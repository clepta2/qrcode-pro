import assert from 'node:assert/strict';
import { gerarQr, gerarQrSvg, gerarQrTexto, detectarModo } from './qr-engine.js';
import { gerarBarras, gerarBarrasSvg, validarGtin, digitoGs1, linhaDigitavelParaCodigoBarras } from './barcode-engine.js';
import worker from './worker.js';

console.log('🧪 Iniciando testes de codificação, vetores e API HTTP do QR Code & Barras Pro...');

let pass = 0;
async function t(nome, fn) {
  await fn();
  pass++;
  console.log('  ✅ ' + nome);
}

const call = async (path, init) => worker.fetch(new Request('https://api.test' + path, init));

// Padrões fixos que todo leitor usa para localizar o QR (finders, timing e módulo escuro)
function checarEstrutura(qr) {
  const m = qr.modulos, n = qr.tamanho;
  const finder = (x0, y0) => {
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const borda = x === 0 || y === 0 || x === 6 || y === 6;
      const centro = x >= 2 && x <= 4 && y >= 2 && y <= 4;
      assert.equal(m[y0 + y][x0 + x], borda || centro, `finder em ${x0},${y0}`);
    }
  };
  finder(0, 0); finder(n - 7, 0); finder(0, n - 7);
  for (let i = 8; i < n - 8; i++) {
    assert.equal(m[6][i], i % 2 === 0, 'timing horizontal');
    assert.equal(m[i][6], i % 2 === 0, 'timing vertical');
  }
  assert.equal(m[n - 8][8], true, 'módulo escuro fixo');
}

await t('QR: tamanho por versão (17 + 4·v) e estrutura fixa', () => {
  for (const txt of ['A', 'HTTPS://PONTE.DEV/CATALOGO?X=1', 'x'.repeat(100), 'y'.repeat(900)]) {
    const qr = gerarQr(txt, { ecc: 'M', aumentarEcc: false });
    assert.equal(qr.tamanho, 17 + 4 * qr.versao);
    checarEstrutura(qr);
  }
});

await t('QR: seleção automática de modo', () => {
  assert.equal(detectarModo('0123456789'), 'numerico');
  assert.equal(detectarModo('HELLO WORLD'), 'alfanumerico');
  assert.equal(detectarModo('hello'), 'byte');
  assert.equal(detectarModo('Olá ✓'), 'byte');
});

await t('QR: capacidades máximas oficiais da versão 40-L', () => {
  assert.equal(gerarQr('9'.repeat(7089), { ecc: 'L', aumentarEcc: false }).versao, 40);
  assert.equal(gerarQr('A'.repeat(4296), { ecc: 'L', aumentarEcc: false }).versao, 40);
  assert.equal(gerarQr('x'.repeat(2953), { ecc: 'L', aumentarEcc: false }).versao, 40);
  assert.throws(() => gerarQr('x'.repeat(2954), { ecc: 'L' }), RangeError);
});

await t('QR: capacidade por versão (v1-L = 17 bytes, v2-L = 32 bytes)', () => {
  const v = n => gerarQr('x'.repeat(n), { ecc: 'L', aumentarEcc: false }).versao;
  assert.equal(v(17), 1);
  assert.equal(v(18), 2);
  assert.equal(v(32), 2);
  assert.equal(v(33), 3);
});

await t('QR: determinístico, máscara manual respeitada e ECC elevado quando sobra espaço', () => {
  const a = gerarQr('https://ponte.dev', { ecc: 'Q' });
  assert.deepEqual(a.modulos, gerarQr('https://ponte.dev', { ecc: 'Q' }).modulos);
  assert.equal(gerarQr('abc', { mascara: 5 }).mascara, 5);
  assert.equal(gerarQr('AB', { ecc: 'L' }).ecc, 'H');
  assert.equal(gerarQr('AB', { ecc: 'L', aumentarEcc: false }).ecc, 'L');
});

await t('QR: SVG válido, cores explícitas, pontos e proteção contra injeção', () => {
  const { svg } = gerarQrSvg('PONTE', { cor: '#10b981', fundo: 'fff', tamanho: 200 });
  assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
  assert.ok(svg.includes('fill="#10b981"') && svg.includes('fill="#fff"'));
  assert.ok(svg.includes('width="200"'));
  assert.ok(gerarQrSvg('x', { estilo: 'pontos' }).svg.includes('<circle'));
  assert.ok(!gerarQrSvg('x', { cor: 'red"onload="alert(1)' }).svg.includes('onload'));
  assert.ok(!gerarQrSvg('x', { fundo: '"/><script>' }).svg.includes('<script'));
});

await t('QR: texto e validações', () => {
  assert.ok(gerarQrTexto('PONTE').includes('█'));
  assert.throws(() => gerarQr(''), RangeError);
  assert.throws(() => gerarQr('x', { ecc: 'Z' }), RangeError);
});

await t('GTIN: dígito verificador GS1 e validação', () => {
  assert.equal(digitoGs1('789100010010'), '3');
  assert.equal(digitoGs1('400638133393'), '1');
  assert.equal(digitoGs1('03600029145'), '2');
  assert.equal(validarGtin('7891000100103').valido, true);
  assert.equal(validarGtin('7891000100104').valido, false);
  assert.match(validarGtin('7891000100103').paisGs1, /Brasil/);
  assert.equal(validarGtin('123').valido, false);
});

await t('EAN-13: 95 módulos, guardas e DV calculado', () => {
  const b = gerarBarras('ean13', '789100010010');
  assert.equal(b.texto, '7891000100103');
  assert.equal(b.bits.length, 95);
  assert.ok(b.bits.startsWith('101') && b.bits.endsWith('101'));
  assert.equal(b.bits.slice(45, 50), '01010');
  assert.throws(() => gerarBarras('ean13', '7891000100104'), RangeError);
});

await t('EAN-8, UPC-A, ITF-14 e Code 128', () => {
  assert.equal(gerarBarras('ean8', '9638507').texto, '96385074');
  assert.equal(gerarBarras('ean8', '96385074').bits.length, 67);
  assert.equal(gerarBarras('upca', '03600029145').texto, '036000291452');
  assert.equal(gerarBarras('itf14', '1789100010010').texto, '17891000100100');
  assert.ok(gerarBarras('code128', 'PONTE-2026').bits.endsWith('1100011101011'));
  assert.throws(() => gerarBarras('code128', 'Olá'), RangeError);
});

await t('Code 128: subconjunto C para dígitos usa menos módulos', () => {
  const soDig = gerarBarras('code128', '1234567890').bits.length;
  assert.ok(soDig < gerarBarras('code128', 'ABCDEFGHIJ').bits.length);
  assert.equal(soDig, (1 + 5 + 1 + 1) * 11 + 2);
});

await t('Boleto: linha digitável (47) → código de barras (44) → ITF', () => {
  const linha = '34191.79001 01043.510047 91020.150008 5 84230000016000';
  const cod = linhaDigitavelParaCodigoBarras(linha);
  assert.equal(cod, '34195842300000160001790001043510049102015000');
  assert.equal(linhaDigitavelParaCodigoBarras(cod), cod);
  assert.equal(gerarBarras('boleto', linha).texto, cod);
  assert.throws(() => linhaDigitavelParaCodigoBarras('123'), RangeError);
});

await t('Barras SVG: estrutura, escape e opção de texto', () => {
  const { svg } = gerarBarrasSvg('ean13', '789100010010', { modulo: 3, altura: 60 });
  assert.ok(svg.includes('<path') && svg.includes('7891000100103'));
  assert.ok(!gerarBarrasSvg('code128', 'A<B>&"', {}).svg.includes('<B>'));
  assert.ok(!gerarBarrasSvg('ean13', '789100010010', { texto: false }).svg.includes('<text'));
});

await t('HTTP /health lista formatos e tipos', async () => {
  const b = await (await call('/health')).json();
  assert.equal(b.ok, true);
  assert.ok(b.formatosBarras.ean13 && b.tiposQr.includes('wifi'));
});

await t('HTTP QR SVG por GET e POST', async () => {
  const g = await call('/api/qrcode.svg?conteudo=https://ponte.dev&tamanho=256');
  assert.equal(g.status, 200);
  assert.ok(g.headers.get('Content-Type').startsWith('image/svg+xml'));
  assert.ok((await g.text()).includes('width="256"'));
  const p = await call('/api/qrcode.svg', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conteudo: 'Olá ✓', ecc: 'H' }) });
  assert.equal(p.status, 200);
});

await t('HTTP: tema padrão da API é o claro (QR escuro sobre fundo claro, legível por leitores)', async () => {
  const s = await (await call('/api/qrcode.svg?conteudo=PONTE')).text();
  assert.ok(s.includes('fill="#0c1715"') && s.includes('fill="#ffffff"'));
  assert.ok(!s.includes('#f8fafc'));
  const b = await (await call('/api/barcode/ean13.svg?valor=789100010010')).text();
  assert.ok(b.includes('fill="#ffffff"'));
  const d = await (await call('/api/qrcode.svg?conteudo=PONTE&tema=dark')).text();
  assert.ok(d.includes('#111827'));
});

await t('HTTP QR JSON e texto', async () => {
  const j = await (await call('/api/qrcode/json?conteudo=PONTE')).json();
  assert.equal(j.tamanho, j.modulos.length);
  assert.ok(j.modulos.every(l => l.length === j.tamanho));
  assert.ok((await (await call('/api/qrcode/texto?conteudo=PONTE')).text()).includes('█'));
});

await t('HTTP QR de tipos prontos (wifi, whatsapp, vcard, geo, email)', async () => {
  for (const q of [
    'wifi.svg?ssid=Casa&senha=12345678',
    'whatsapp.svg?telefone=11999998888&mensagem=Oi',
    'vcard.svg?nome=Maria&telefone=11999998888&email=m@x.com',
    'geo.svg?lat=-23.55&lng=-46.63',
    'email.svg?para=a@b.com&assunto=Oi'
  ]) assert.equal((await call('/api/qrcode/' + q)).status, 200, q);
  assert.equal((await call('/api/qrcode/wifi.svg')).status, 400);
  assert.equal((await call('/api/qrcode/xyz.svg?conteudo=a')).status, 400);
});

await t('HTTP código de barras SVG/JSON/GTIN/boleto', async () => {
  const s = await call('/api/barcode/ean13.svg?valor=789100010010');
  assert.equal(s.status, 200);
  assert.ok((await s.text()).includes('7891000100103'));
  assert.equal((await (await call('/api/barcode/code128/json?valor=PONTE')).json()).formato, 'code128');
  assert.equal((await (await call('/api/barcode/gtin/validar/7891000100103')).json()).valido, true);
  const c = await (await call('/api/barcode/boleto/converter?linha=34191790010104351004791020150008584230000016000')).json();
  assert.equal(c.codigoBarras.length, 44);
});

await t('HTTP erros: 400 conteúdo ausente/grande/formato inválido e 404', async () => {
  assert.equal((await call('/api/qrcode.svg')).status, 400);
  assert.equal((await call('/api/qrcode.svg?conteudo=' + 'x'.repeat(4001))).status, 400);
  assert.equal((await call('/api/barcode/xyz.svg?valor=1')).status, 400);
  assert.equal((await call('/api/barcode/ean13.svg?valor=123')).status, 400);
  assert.equal((await call('/api/nada')).status, 404);
});

console.log(`\n🎉 Todos os ${pass} testes de API do QR Code Pro passaram!`);
