/**
 * barcode-engine.js — Códigos de barras 1D nativos em SVG:
 * EAN-13, EAN-8, UPC-A, Code 128 (auto B/C), ITF / Interleaved 2 of 5 (inclui boleto FEBRABAN 44 dígitos)
 * e ITF-14 (GTIN-14 de caixas logísticas), com cálculo e validação de dígito verificador GS1.
 *
 * @license MIT
 * @see https://github.com/clepta2/qrcode-pro
 */

const somenteDigitos = s => String(s ?? '').replace(/\D/g, '');

// ─── GS1 (EAN/UPC/ITF-14) ───

export function digitoGs1(corpo) {
  const d = somenteDigitos(corpo);
  let soma = 0;
  for (let i = 0; i < d.length; i++) soma += Number(d[d.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  return String((10 - (soma % 10)) % 10);
}

export function validarGtin(codigo) {
  const d = somenteDigitos(codigo);
  if (![8, 12, 13, 14].includes(d.length)) return { valido: false, motivo: 'GTIN deve ter 8, 12, 13 ou 14 dígitos.' };
  const esperado = digitoGs1(d.slice(0, -1));
  const tipo = { 8: 'GTIN-8 (EAN-8)', 12: 'GTIN-12 (UPC-A)', 13: 'GTIN-13 (EAN-13)', 14: 'GTIN-14 (ITF-14)' }[d.length];
  const prefixo = d.length === 13 ? d.slice(0, 3) : null;
  return {
    valido: d.slice(-1) === esperado,
    tipo,
    codigo: d,
    digitoInformado: d.slice(-1),
    digitoEsperado: esperado,
    paisGs1: prefixo && Number(prefixo) >= 789 && Number(prefixo) <= 790 ? 'Brasil (GS1 Brasil 789–790)' : undefined
  };
}

const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const EAN_G = EAN_L.map(p => p.split('').reverse().map(b => (b === '0' ? '1' : '0')).join(''));
const EAN_R = EAN_L.map(p => p.split('').map(b => (b === '0' ? '1' : '0')).join(''));
const EAN13_PARIDADE = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

function normalizarGtin(valor, tamanho) {
  const d = somenteDigitos(valor);
  if (d.length === tamanho - 1) return d + digitoGs1(d);
  if (d.length !== tamanho) throw new RangeError(`Informe ${tamanho - 1} dígitos (o DV é calculado) ou ${tamanho} dígitos.`);
  if (d.slice(-1) !== digitoGs1(d.slice(0, -1))) throw new RangeError(`Dígito verificador inválido: esperado ${digitoGs1(d.slice(0, -1))}.`);
  return d;
}

function ean13Modulos(valor) {
  const d = normalizarGtin(valor, 13);
  const par = EAN13_PARIDADE[Number(d[0])];
  let bits = '101';
  for (let i = 1; i <= 6; i++) bits += (par[i - 1] === 'L' ? EAN_L : EAN_G)[Number(d[i])];
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += EAN_R[Number(d[i])];
  bits += '101';
  return { bits, texto: d, guardas: [0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94] };
}

function ean8Modulos(valor) {
  const d = normalizarGtin(valor, 8);
  let bits = '101';
  for (let i = 0; i < 4; i++) bits += EAN_L[Number(d[i])];
  bits += '01010';
  for (let i = 4; i < 8; i++) bits += EAN_R[Number(d[i])];
  bits += '101';
  return { bits, texto: d, guardas: [0, 1, 2, 31, 32, 33, 34, 35, 64, 65, 66] };
}

function upcaModulos(valor) {
  const d = normalizarGtin(valor, 12);
  const r = ean13Modulos('0' + d);
  return { ...r, texto: d };
}

// ─── Code 128 ───

const C128 = [
  '11011001100', '11001101100', '11001100110', '10010011000', '10010001100', '10001001100', '10011001000', '10011000100', '10001100100', '11001001000',
  '11001000100', '11000100100', '10110011100', '10011011100', '10011001110', '10111001100', '10011101100', '10011100110', '11001110010', '11001011100',
  '11001001110', '11011100100', '11001110100', '11101101110', '11101001100', '11100101100', '11100100110', '11101100100', '11100110100', '11100110010',
  '11011011000', '11011000110', '11000110110', '10100011000', '10001011000', '10001000110', '10110001000', '10001101000', '10001100010', '11010001000',
  '11000101000', '11000100010', '10110111000', '10110001110', '10001101110', '10111011000', '10111000110', '10001110110', '11101110110', '11010001110',
  '11000101110', '11011101000', '11011100010', '11011101110', '11101011000', '11101000110', '11100010110', '11101101000', '11101100010', '11100011010',
  '11101111010', '11001000010', '11110001010', '10100110000', '10100001100', '10010110000', '10010000110', '10000101100', '10000100110', '10110010000',
  '10110000100', '10011010000', '10011000010', '10000110100', '10000110010', '11000010010', '11001010000', '11110111010', '11000010100', '10001111010',
  '10100111100', '10010111100', '10010011110', '10111100100', '10011110100', '10011110010', '11110100100', '11110010100', '11110010010', '11011011110',
  '11011110110', '11110110110', '10101111000', '10100011110', '10001011110', '10111101000', '10111100010', '11110101000', '11110100010', '10111011110',
  '10111101110', '11101011110', '11110101110', '11010000100', '11010010000', '11010011100', '1100011101011'
];
const C128_START_B = 104, C128_START_C = 105, C128_CODE_B = 100, C128_CODE_C = 99, C128_STOP = 106;

function code128Valores(texto) {
  const s = String(texto ?? '');
  if (!s.length) throw new RangeError('Conteúdo vazio.');
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 126) throw new RangeError('Code 128 aceita apenas ASCII imprimível (32–126).');
  }
  const ehDig = i => i < s.length && s.charCodeAt(i) >= 48 && s.charCodeAt(i) <= 57;
  const runDig = i => { let n = 0; while (ehDig(i + n)) n++; return n; };

  const vals = [];
  let i = 0;
  let set = runDig(0) >= (s.length === runDig(0) ? 2 : 4) && runDig(0) % 2 === 0 ? 'C' : runDig(0) >= 4 ? 'C' : 'B';
  vals.push(set === 'C' ? C128_START_C : C128_START_B);
  while (i < s.length) {
    if (set === 'C') {
      if (runDig(i) >= 2) { vals.push(Number(s.substr(i, 2))); i += 2; continue; }
      vals.push(C128_CODE_B); set = 'B';
      continue;
    }
    const n = runDig(i);
    if (n >= 4 && (n % 2 === 0 || i + n === s.length || n >= 5)) {
      if (n % 2 === 1) { vals.push(s.charCodeAt(i) - 32); i++; }
      vals.push(C128_CODE_C); set = 'C';
      continue;
    }
    vals.push(s.charCodeAt(i) - 32);
    i++;
  }
  const check = vals.reduce((acc, v, idx) => acc + v * (idx === 0 ? 1 : idx), 0) % 103;
  vals.push(check, C128_STOP);
  return vals;
}

function code128Modulos(texto) {
  const vals = code128Valores(texto);
  return { bits: vals.map(v => C128[v]).join(''), texto: String(texto) };
}

// ─── Interleaved 2 of 5 / ITF-14 / Boleto FEBRABAN ───

const I25 = ['NNWWN', 'WNNNW', 'NWNNW', 'WWNNN', 'NNWNW', 'WNWNN', 'NWWNN', 'NNNWW', 'WNNWN', 'NWNWN'];

function itfModulos(valor, { largo = 3, exigirPar = true } = {}) {
  let d = somenteDigitos(valor);
  if (!d.length) throw new RangeError('ITF aceita apenas dígitos.');
  if (d.length % 2 === 1) {
    if (exigirPar) throw new RangeError('Interleaved 2 of 5 exige quantidade par de dígitos.');
    d = '0' + d;
  }
  const w = n => (n === 'W' ? largo : 1);
  let bits = '1010';
  for (let i = 0; i < d.length; i += 2) {
    const barras = I25[Number(d[i])], espacos = I25[Number(d[i + 1])];
    for (let k = 0; k < 5; k++) bits += '1'.repeat(w(barras[k])) + '0'.repeat(w(espacos[k]));
  }
  bits += '1'.repeat(largo) + '01';
  return { bits, texto: d };
}

function itf14Modulos(valor) {
  const d = normalizarGtin(valor, 14);
  return { ...itfModulos(d), texto: d, bordaPortadora: true };
}

/** Converte linha digitável (47) em código de barras (44) de boleto bancário. */
export function linhaDigitavelParaCodigoBarras(linha) {
  const d = somenteDigitos(linha);
  if (d.length === 44) return d;
  if (d.length === 47) return d.slice(0, 4) + d[32] + d.slice(33, 47) + d.slice(4, 9) + d.slice(10, 20) + d.slice(21, 31);
  if (d.length === 48 && d[0] === '8') return d.slice(0, 11) + d.slice(12, 23) + d.slice(24, 35) + d.slice(36, 47);
  throw new RangeError('Informe a linha digitável (47 ou 48 dígitos) ou o código de barras (44 dígitos).');
}

function boletoModulos(valor) {
  const cod = linhaDigitavelParaCodigoBarras(valor);
  return { ...itfModulos(cod), texto: cod };
}

// ─── Renderização ───

export const FORMATOS_BARRAS = {
  ean13: { nome: 'EAN-13 / GTIN-13', fn: ean13Modulos, quietZone: 11 },
  ean8: { nome: 'EAN-8 / GTIN-8', fn: ean8Modulos, quietZone: 7 },
  upca: { nome: 'UPC-A / GTIN-12', fn: upcaModulos, quietZone: 9 },
  code128: { nome: 'Code 128 (auto B/C)', fn: code128Modulos, quietZone: 10 },
  itf: { nome: 'Interleaved 2 of 5', fn: v => itfModulos(v), quietZone: 10 },
  itf14: { nome: 'ITF-14 / GTIN-14', fn: itf14Modulos, quietZone: 10 },
  boleto: { nome: 'Boleto FEBRABAN (ITF 44 dígitos)', fn: boletoModulos, quietZone: 10 }
};

export const TEMAS_BARCODE = {
  dark: {
    cor: '#f8fafc',
    fundo: '#111827',
    borda: '#1e293b',
    texto: '#cbd5e1'
  },
  ponte: {
    cor: '#a3e635',
    fundo: '#0b0f19',
    borda: 'rgba(163, 230, 53, 0.28)',
    texto: '#a3e635'
  },
  emerald: {
    cor: '#10b981',
    fundo: '#0b0f19',
    borda: 'rgba(16, 185, 129, 0.28)',
    texto: '#34d399'
  },
  blue: {
    cor: '#38bdf8',
    fundo: '#0b0f19',
    borda: 'rgba(56, 189, 248, 0.28)',
    texto: '#7dd3fc'
  },
  transparent: {
    cor: 'currentColor',
    fundo: 'none',
    borda: 'none',
    texto: 'currentColor'
  },
  light: {
    cor: '#0c1715',
    fundo: '#ffffff',
    borda: '#e2e8e4',
    texto: '#253833'
  }
};

function escaparXml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

function corValida(c, padrao) {
  if (c === undefined || c === null || c === '') return padrao;
  const s = String(c).trim();
  if (/^(transparent|none|currentColor)$/i.test(s)) return s;
  if (/^#?[0-9a-f]{3}([0-9a-f]{3})?([0-9a-f]{2})?$/i.test(s)) return s.startsWith('#') ? s : '#' + s;
  if (/^rgba?\([^)]+\)$/i.test(s)) return s;
  if (/^var\(--[a-zA-Z0-9_-]+\)$/.test(s)) return s;
  return padrao;
}

/** Gera a sequência de módulos (1 = barra) de um formato. */
export function gerarBarras(formato, valor) {
  const f = FORMATOS_BARRAS[String(formato || '').toLowerCase()];
  if (!f) throw new RangeError(`Formato desconhecido. Use: ${Object.keys(FORMATOS_BARRAS).join(', ')}.`);
  return { formato: String(formato).toLowerCase(), nome: f.nome, quietZone: f.quietZone, ...f.fn(valor) };
}

/**
 * Renderiza código de barras em SVG.
 * @param {string} formato ean13 | ean8 | upca | code128 | itf | itf14 | boleto
 * @param {string} valor
 * @param {{ modulo?: number, altura?: number, texto?: boolean, cor?: string, fundo?: string, tema?: 'dark'|'ponte'|'emerald'|'blue'|'transparent'|'light', borda?: string|boolean, padding?: number, raio?: number }} [opcoes]
 */
export function gerarBarrasSvg(formato, valor, opcoes = {}) {
  const b = gerarBarras(formato, valor);
  const temaCfg = TEMAS_BARCODE[String(opcoes.tema || '').toLowerCase()] || TEMAS_BARCODE.dark;

  const mod = Math.max(1, Math.min(10, Number(opcoes.modulo) || 2));
  const altura = Math.max(20, Math.min(600, Number(opcoes.altura) || (b.formato === 'boleto' ? 50 : 80)));
  const mostrarTexto = opcoes.texto !== false && opcoes.texto !== 'false';
  
  const cor = corValida(opcoes.cor, temaCfg.cor);
  const fundo = corValida(opcoes.fundo, temaCfg.fundo);
  const corTexto = corValida(opcoes.corTexto, corValida(opcoes.cor, temaCfg.texto));
  const corBorda = opcoes.borda === false || opcoes.borda === 'none' 
    ? 'none' 
    : corValida(opcoes.borda, temaCfg.borda);
  const raio = opcoes.raio !== undefined ? Math.max(0, Number(opcoes.raio) || 0) : 8;

  const qz = b.quietZone;
  const larguraModulos = b.bits.length + qz * 2;
  const fonte = 10;
  const alturaTotal = altura + (mostrarTexto ? fonte + 8 : 0) + (b.bordaPortadora ? 8 : 0);
  const guardas = new Set(b.guardas || []);

  let d = '';
  for (let i = 0; i < b.bits.length;) {
    if (b.bits[i] !== '1') { i++; continue; }
    let j = i;
    while (j < b.bits.length && b.bits[j] === '1') j++;
    const ext = mostrarTexto && guardas.has(i) ? 5 : 0;
    d += `M${i + qz},${b.bordaPortadora ? 4 : 0}h${j - i}v${altura + ext}h-${j - i}z`;
    i = j;
  }

  const w = larguraModulos * mod;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${larguraModulos} ${alturaTotal}" width="${w}" height="${alturaTotal * mod}" shape-rendering="crispEdges" role="img" aria-label="${escaparXml(b.nome + ' ' + b.texto)}">`;
  
  if (fundo !== 'none') {
    const strokeAttr = corBorda !== 'none' ? ` stroke="${corBorda}" stroke-width="1"` : '';
    const rxAttr = raio > 0 ? ` rx="${raio}" ry="${raio}"` : '';
    svg += `<rect width="100%" height="100%" fill="${fundo}"${strokeAttr}${rxAttr}/>`;
  }

  if (b.bordaPortadora) {
    svg += `<rect x="${qz / 2}" y="1" width="${larguraModulos - qz}" height="${altura + 6}" fill="none" stroke="${cor}" stroke-width="2" rx="2"/>`;
  }
  
  svg += `<path d="${d}" fill="${cor}"/>`;
  
  if (mostrarTexto) {
    svg += `<text x="${larguraModulos / 2}" y="${alturaTotal - 4}" font-family="'JetBrains Mono', monospace" font-size="${fonte}" font-weight="600" letter-spacing="1px" text-anchor="middle" fill="${corTexto}" shape-rendering="auto">${escaparXml(b.texto)}</text>`;
  }
  
  svg += '</svg>';
  return { svg, ...b };
}

export default { gerarBarras, gerarBarrasSvg, validarGtin, digitoGs1, linhaDigitavelParaCodigoBarras, FORMATOS_BARRAS, TEMAS_BARCODE };
