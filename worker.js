/**
 * worker.js — Cloudflare Worker Anycast para QR Code & Código de Barras Pro API
 *
 * @license MIT
 * @see https://github.com/clepta2/qrcode-pro
 */

import { gerarQr, gerarQrSvg, gerarQrTexto } from './qr-engine.js';
import { gerarBarras, gerarBarrasSvg, validarGtin, linhaDigitavelParaCodigoBarras, FORMATOS_BARRAS } from './barcode-engine.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
  'Access-Control-Max-Age': '86400',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Ponte-Version': '3.0.0'
};

const PLANOS_CONFIG = {
  free: { nome: 'Free / Sandbox', rpm: 30, cotaDiaria: 500 },
  starter: { nome: 'Starter 86.400 (1 req/s)', rpm: 60, cotaDiaria: 86400 },
  pro: { nome: 'Pro (5 req/s)', rpm: 300, cotaDiaria: 250000 },
  business: { nome: 'Business (20 req/s)', rpm: 1200, cotaDiaria: 1000000 },
  master: { nome: 'Master Admin (Bypass)', rpm: 3000, cotaDiaria: Infinity }
};

const PREFIXOS = [
  ['master', ['qr_master_', 'pnt_master_']],
  ['business', ['qr_biz_', 'pnt_biz_']],
  ['pro', ['qr_pro_', 'pnt_pro_']],
  ['starter', ['qr_start_', 'pnt_start_']]
];

const MAX_CONTEUDO = 4000;
const minuteBuckets = new Map();
const dailyBuckets = new Map();
const BOOT_TIME = Date.now();

function resolverPlano(request, url) {
  const auth = request.headers.get('Authorization') || '';
  const token = (auth.startsWith('Bearer ') ? auth.slice(7) : (request.headers.get('x-api-key') || url.searchParams.get('key') || '')).trim();
  if (!token) {
    const ip = request.headers.get('cf-connecting-ip') || 'anonymous_ip';
    return { plano: 'free', keyId: `ip_${ip}`, config: PLANOS_CONFIG.free };
  }
  for (const [plano, prefixos] of PREFIXOS) {
    if (prefixos.some(p => token.startsWith(p))) return { plano, keyId: token, config: PLANOS_CONFIG[plano] };
  }
  return { plano: 'free', keyId: token, config: PLANOS_CONFIG.free };
}

function aplicarRateLimit(keyId, config) {
  const now = Date.now();
  let d = dailyBuckets.get(keyId);
  if (!d || now > d.resetAt) { d = { count: 0, resetAt: now + 86400000 }; dailyBuckets.set(keyId, d); }
  let m = minuteBuckets.get(keyId);
  if (!m || now > m.resetAt) { m = { count: 0, resetAt: now + 60000 }; minuteBuckets.set(keyId, m); }
  const isMaster = config.cotaDiaria === Infinity;
  if (!isMaster && d.count >= config.cotaDiaria) {
    return { ok: false, error: 'DAILY_LIMIT_EXCEEDED', message: `Cota diária excedida para o plano ${config.nome}.`, resetEmSegundos: Math.ceil((d.resetAt - now) / 1000) };
  }
  if (!isMaster && m.count >= config.rpm) {
    return { ok: false, error: 'RATE_LIMIT_EXCEEDED', message: `Limite de ${config.rpm} RPM excedido.`, resetEmSegundos: Math.ceil((m.resetAt - now) / 1000) };
  }
  d.count++; m.count++;
  return { ok: true, rpmRestante: Math.max(0, config.rpm - m.count) };
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS, ...extra }
  });
}

function svgResponse(svg, extra = {}) {
  return new Response(svg, {
    headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=86400', ...CORS_HEADERS, ...extra }
  });
}

async function lerParametros(request, url) {
  const p = Object.fromEntries(url.searchParams.entries());
  if (request.method === 'POST') {
    try { Object.assign(p, await request.json()); } catch (_) { /* corpo vazio ou inválido: usa só a query */ }
  }
  return p;
}

function conteudoDe(p) {
  const c = p.conteudo ?? p.texto ?? p.dados ?? p.url ?? p.data ?? p.valor;
  if (c === undefined || c === null || String(c) === '') throw new RangeError('Informe o conteúdo em "conteudo" (ou "texto", "url").');
  const s = String(c);
  if (s.length > MAX_CONTEUDO) throw new RangeError(`Conteúdo excede ${MAX_CONTEUDO} caracteres.`);
  return s;
}

const opcoesQr = p => ({
  ecc: p.ecc || p.correcao || 'M',
  tamanho: p.tamanho,
  margem: p.margem,
  cor: p.cor,
  fundo: p.fundo,
  estilo: p.estilo,
  tema: p.tema || 'light',
  borda: p.borda === 'false' ? false : p.borda,
  raio: p.raio,
  mascara: p.mascara !== undefined && p.mascara !== '' ? Number(p.mascara) : undefined,
  aumentarEcc: p.aumentarEcc === undefined ? true : p.aumentarEcc !== 'false' && p.aumentarEcc !== false
});

// Helpers de payload (formatos de conteúdo mais usados)
function escaparWifi(s) { return String(s).replace(/([\\;,:"])/g, '\\$1'); }
function escaparVcard(s) { return String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n'); }

export function montarPayload(tipo, p) {
  switch (String(tipo).toLowerCase()) {
    case 'texto':
    case 'url':
      return conteudoDe(p);
    case 'wifi': {
      if (!p.ssid) throw new RangeError('Informe "ssid".');
      const seg = String(p.seguranca || (p.senha ? 'WPA' : 'nopass')).toUpperCase();
      if (!['WPA', 'WEP', 'NOPASS'].includes(seg)) throw new RangeError('seguranca deve ser WPA, WEP ou nopass.');
      return `WIFI:T:${seg === 'NOPASS' ? 'nopass' : seg};S:${escaparWifi(p.ssid)};${seg !== 'NOPASS' ? `P:${escaparWifi(p.senha || '')};` : ''}${p.oculta === 'true' || p.oculta === true ? 'H:true;' : ''};`;
    }
    case 'whatsapp': {
      const tel = String(p.telefone || '').replace(/\D/g, '');
      if (tel.length < 10) throw new RangeError('Informe "telefone" com DDD (ex.: 11999998888).');
      const completo = tel.length <= 11 ? '55' + tel : tel;
      return `https://wa.me/${completo}${p.mensagem ? '?text=' + encodeURIComponent(p.mensagem) : ''}`;
    }
    case 'email': {
      if (!p.para) throw new RangeError('Informe "para".');
      const q = [p.assunto ? 'subject=' + encodeURIComponent(p.assunto) : '', p.corpo ? 'body=' + encodeURIComponent(p.corpo) : ''].filter(Boolean).join('&');
      return `mailto:${p.para}${q ? '?' + q : ''}`;
    }
    case 'telefone':
      if (!p.telefone) throw new RangeError('Informe "telefone".');
      return `tel:${String(p.telefone).replace(/[^\d+]/g, '')}`;
    case 'sms':
      if (!p.telefone) throw new RangeError('Informe "telefone".');
      return `SMSTO:${String(p.telefone).replace(/[^\d+]/g, '')}:${p.mensagem || ''}`;
    case 'geo': {
      const lat = Number(p.lat), lng = Number(p.lng ?? p.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new RangeError('Informe "lat" e "lng" válidos.');
      return `geo:${lat},${lng}`;
    }
    case 'vcard': {
      if (!p.nome) throw new RangeError('Informe "nome".');
      const linhas = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${escaparVcard(p.nome)}`];
      if (p.empresa) linhas.push(`ORG:${escaparVcard(p.empresa)}`);
      if (p.cargo) linhas.push(`TITLE:${escaparVcard(p.cargo)}`);
      if (p.telefone) linhas.push(`TEL;TYPE=CELL:${escaparVcard(p.telefone)}`);
      if (p.email) linhas.push(`EMAIL:${escaparVcard(p.email)}`);
      if (p.site) linhas.push(`URL:${escaparVcard(p.site)}`);
      linhas.push('END:VCARD');
      return linhas.join('\n');
    }
    default:
      throw new RangeError('Tipo inválido. Use: texto, url, wifi, whatsapp, email, telefone, sms, geo, vcard.');
  }
}

export const TIPOS_PAYLOAD = ['texto', 'url', 'wifi', 'whatsapp', 'email', 'telefone', 'sms', 'geo', 'vcard'];

export default {
  async fetch(request) {
    const t0 = performance.now();
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

    const { plano, keyId, config } = resolverPlano(request, url);
    const rate = aplicarRateLimit(keyId, config);
    if (!rate.ok) return json(rate, 429, { 'Retry-After': String(rate.resetEmSegundos || 60) });

    const rh = {
      'x-qrcode-plan': plano,
      'x-qrcode-ratelimit-limit': String(config.rpm),
      'x-qrcode-ratelimit-remaining': String(rate.rpmRestante),
      'x-qrcode-edge-latency': `${Math.max(1, Math.round(performance.now() - t0))}ms`
    };

    try {
      const p = await lerParametros(request, url);

      if (path === '/' || path === '/health' || path === '/status' || path === '/api/qrcode/health') {
        return json({
          ok: true,
          servico: 'QR Code & Código de Barras Pro API',
          versao: '1.0.0',
          borda: 'Cloudflare Workers Anycast (<2ms)',
          uptimeSegundos: Math.floor((Date.now() - BOOT_TIME) / 1000),
          planoAtivo: config.nome,
          formatosBarras: Object.fromEntries(Object.entries(FORMATOS_BARRAS).map(([k, v]) => [k, v.nome])),
          tiposQr: TIPOS_PAYLOAD,
          rotas: [
            'GET|POST /api/qrcode.svg?conteudo=...&ecc=M&tamanho=320&cor=000000&fundo=ffffff&estilo=quadrado|arredondado|pontos',
            'GET|POST /api/qrcode/json?conteudo=...  (matriz de módulos)',
            'GET /api/qrcode/texto?conteudo=...  (ASCII para terminal)',
            'GET|POST /api/qrcode/:tipo.svg  (wifi, whatsapp, email, telefone, sms, geo, vcard, url)',
            'GET /api/barcode/:formato.svg?valor=7891000100103  (ean13, ean8, upca, code128, itf, itf14, boleto)',
            'GET /api/barcode/:formato/json?valor=...',
            'GET /api/barcode/gtin/validar/:codigo',
            'GET /api/barcode/boleto/converter?linha=...'
          ]
        }, 200, rh);
      }

      if (path === '/api/qrcode.svg' || path === '/api/qrcode' || path === '/api/qr.svg') {
        const { svg } = gerarQrSvg(conteudoDe(p), opcoesQr(p));
        return svgResponse(svg, rh);
      }

      if (path === '/api/qrcode/json') {
        const qr = gerarQr(conteudoDe(p), opcoesQr(p));
        return json({ ok: true, versao: qr.versao, tamanho: qr.tamanho, ecc: qr.ecc, mascara: qr.mascara, modo: qr.modo, modulos: qr.modulos.map(l => l.map(c => (c ? 1 : 0)).join('')) }, 200, rh);
      }

      if (path === '/api/qrcode/texto') {
        return new Response(gerarQrTexto(conteudoDe(p), opcoesQr(p)), {
          headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS_HEADERS, ...rh }
        });
      }

      const mTipo = path.match(/^\/api\/qrcode\/([a-z]+)\.svg$/i);
      if (mTipo) {
        const { svg } = gerarQrSvg(montarPayload(mTipo[1], p), opcoesQr(p));
        return svgResponse(svg, rh);
      }

      if (path === '/api/barcode/gtin/validar' || path.startsWith('/api/barcode/gtin/validar/')) {
        const codigo = decodeURIComponent(path.split('/').pop() === 'validar' ? (p.codigo || '') : path.split('/').pop());
        if (!codigo) return json({ ok: false, erro: 'PARAMETROS_OBRIGATORIOS', mensagem: 'Informe o código GTIN.' }, 400, rh);
        return json({ ok: true, ...validarGtin(codigo) }, 200, rh);
      }

      if (path === '/api/barcode/boleto/converter') {
        const cod = linhaDigitavelParaCodigoBarras(p.linha || p.codigo || '');
        return json({ ok: true, codigoBarras: cod, tamanho: cod.length }, 200, rh);
      }

      const mBarSvg = path.match(/^\/api\/barcode\/([a-z0-9]+)\.svg$/i);
      if (mBarSvg) {
        const valor = p.valor ?? p.conteudo ?? p.codigo;
        if (valor === undefined || valor === '') throw new RangeError('Informe o código em "valor".');
        const { svg } = gerarBarrasSvg(mBarSvg[1], String(valor).slice(0, 200), { modulo: p.modulo, altura: p.altura, texto: p.texto, cor: p.cor, corTexto: p.corTexto, fundo: p.fundo, tema: p.tema || 'light', borda: p.borda === 'false' ? false : p.borda, raio: p.raio });
        return svgResponse(svg, rh);
      }

      const mBarJson = path.match(/^\/api\/barcode\/([a-z0-9]+)\/json$/i);
      if (mBarJson) {
        const valor = p.valor ?? p.conteudo ?? p.codigo;
        if (valor === undefined || valor === '') throw new RangeError('Informe o código em "valor".');
        const b = gerarBarras(mBarJson[1], String(valor).slice(0, 200));
        return json({ ok: true, formato: b.formato, nome: b.nome, codigo: b.texto, modulos: b.bits.length, bits: b.bits }, 200, rh);
      }

      return json({ ok: false, erro: 'ROTA_NAO_ENCONTRADA', mensagem: `Rota "${path}" não existe. Consulte GET /health.` }, 404, rh);
    } catch (e) {
      if (e instanceof RangeError) return json({ ok: false, erro: 'PARAMETRO_INVALIDO', mensagem: e.message }, 400, rh);
      return json({ ok: false, erro: 'ERRO_INTERNO', mensagem: 'Falha inesperada ao processar a requisição.' }, 500, rh);
    }
  }
};
