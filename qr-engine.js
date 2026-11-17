/**
 * qr-engine.js — Codificador QR Code (ISO/IEC 18004) 100% nativo, sem dependências.
 * Modos numérico, alfanumérico e byte (UTF-8), versões 1–40, correção L/M/Q/H,
 * seleção automática de máscara por penalidade e renderização SVG / matriz.
 *
 * @license MIT
 * @see https://github.com/clepta2/qrcode-pro
 */

export const NIVEIS_ECC = { L: 0, M: 1, Q: 2, H: 3 };
// Bits de formato por nível (L=01, M=00, Q=11, H=10)
const ECC_FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };

// [nível][versão] — codewords de correção por bloco e número de blocos (ISO/IEC 18004 Tabela 9)
const ECC_CODEWORDS_POR_BLOCO = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
];
const NUM_BLOCOS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
];

const ALFANUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

// ─── Reed-Solomon sobre GF(256) com polinômio 0x11D ───

function rsMultiplicar(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsDivisor(grau) {
  const r = new Array(grau).fill(0);
  r[grau - 1] = 1;
  let raiz = 1;
  for (let i = 0; i < grau; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = rsMultiplicar(r[j], raiz);
      if (j + 1 < r.length) r[j] ^= r[j + 1];
    }
    raiz = rsMultiplicar(raiz, 0x02);
  }
  return r;
}

function rsResto(dados, divisor) {
  const r = divisor.map(() => 0);
  for (const b of dados) {
    const fator = b ^ r.shift();
    r.push(0);
    divisor.forEach((coef, i) => { r[i] ^= rsMultiplicar(coef, fator); });
  }
  return r;
}

// ─── Capacidades ───

function totalModulosDados(ver) {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const nAlign = Math.floor(ver / 7) + 2;
    r -= (25 * nAlign - 10) * nAlign - 55;
    if (ver >= 7) r -= 36;
  }
  return r;
}

function totalCodewordsDados(ver, ecl) {
  return Math.floor(totalModulosDados(ver) / 8) - ECC_CODEWORDS_POR_BLOCO[ecl][ver] * NUM_BLOCOS[ecl][ver];
}

// ─── Segmentação ───

function bitsContagem(modo, ver) {
  const faixa = ver <= 9 ? 0 : ver <= 26 ? 1 : 2;
  return { numerico: [10, 12, 14], alfanumerico: [9, 11, 13], byte: [8, 16, 16] }[modo][faixa];
}

function utf8(texto) {
  return Array.from(new TextEncoder().encode(texto));
}

export function detectarModo(texto) {
  if (/^\d*$/.test(texto)) return 'numerico';
  if ([...texto].every(c => ALFANUM.includes(c))) return 'alfanumerico';
  return 'byte';
}

function criarSegmento(texto, modoForcado) {
  const modo = modoForcado || detectarModo(texto);
  const bits = [];
  const push = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  let qtd;
  if (modo === 'numerico') {
    for (let i = 0; i < texto.length; i += 3) {
      const g = texto.slice(i, i + 3);
      push(parseInt(g, 10), g.length * 3 + 1);
    }
    qtd = texto.length;
  } else if (modo === 'alfanumerico') {
    for (let i = 0; i < texto.length; i += 2) {
      if (i + 1 < texto.length) push(ALFANUM.indexOf(texto[i]) * 45 + ALFANUM.indexOf(texto[i + 1]), 11);
      else push(ALFANUM.indexOf(texto[i]), 6);
    }
    qtd = texto.length;
  } else {
    const bytes = utf8(texto);
    bytes.forEach(b => push(b, 8));
    qtd = bytes.length;
  }
  return { modo, qtd, bits, indicador: { numerico: 1, alfanumerico: 2, byte: 4 }[modo] };
}

// ─── Construção da matriz ───

class Matriz {
  constructor(ver) {
    this.ver = ver;
    this.tam = ver * 4 + 17;
    this.mod = Array.from({ length: this.tam }, () => new Array(this.tam).fill(false));
    this.func = Array.from({ length: this.tam }, () => new Array(this.tam).fill(false));
  }

  set(x, y, escuro) {
    this.mod[y][x] = escuro;
    this.func[y][x] = true;
  }

  padroesFuncionais() {
    const t = this.tam;
    for (let i = 0; i < t; i++) {
      this.set(6, i, i % 2 === 0);
      this.set(i, 6, i % 2 === 0);
    }
    this.finder(3, 3);
    this.finder(t - 4, 3);
    this.finder(3, t - 4);
    const pos = this.posicoesAlinhamento();
    const n = pos.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        this.alinhamento(pos[i], pos[j]);
      }
    }
    this.formato(0, 0);
    this.versao();
  }

  finder(x, y) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < this.tam && yy >= 0 && yy < this.tam) this.set(xx, yy, d !== 2 && d !== 4);
      }
    }
  }

  alinhamento(x, y) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) this.set(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }

  posicoesAlinhamento() {
    if (this.ver === 1) return [];
    const n = Math.floor(this.ver / 7) + 2;
    const passo = this.ver === 32 ? 26 : Math.ceil((this.ver * 4 + 4) / (n * 2 - 2)) * 2;
    const r = [6];
    for (let p = this.tam - 7; r.length < n; p -= passo) r.splice(1, 0, p);
    return r;
  }

  formato(eclBits, mascara) {
    const dados = (eclBits << 3) | mascara;
    let rem = dados;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((dados << 10) | rem) ^ 0x5412;
    const b = i => ((bits >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) this.set(8, i, b(i));
    this.set(8, 7, b(6));
    this.set(8, 8, b(7));
    this.set(7, 8, b(8));
    for (let i = 9; i < 15; i++) this.set(14 - i, 8, b(i));
    for (let i = 0; i < 8; i++) this.set(this.tam - 1 - i, 8, b(i));
    for (let i = 8; i < 15; i++) this.set(8, this.tam - 15 + i, b(i));
    this.set(8, this.tam - 8, true);
  }

  versao() {
    if (this.ver < 7) return;
    let rem = this.ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const escuro = ((bits >>> i) & 1) !== 0;
      const a = this.tam - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.set(a, b, escuro);
      this.set(b, a, escuro);
    }
  }

  posicionarDados(codewords) {
    let i = 0;
    for (let direita = this.tam - 1; direita >= 1; direita -= 2) {
      if (direita === 6) direita = 5;
      for (let v = 0; v < this.tam; v++) {
        for (let j = 0; j < 2; j++) {
          const x = direita - j;
          const subindo = ((direita + 1) & 2) === 0;
          const y = subindo ? this.tam - 1 - v : v;
          if (!this.func[y][x] && i < codewords.length * 8) {
            this.mod[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
        }
      }
    }
  }

  aplicarMascara(m) {
    for (let y = 0; y < this.tam; y++) {
      for (let x = 0; x < this.tam; x++) {
        if (this.func[y][x]) continue;
        let inv;
        switch (m) {
          case 0: inv = (x + y) % 2 === 0; break;
          case 1: inv = y % 2 === 0; break;
          case 2: inv = x % 3 === 0; break;
          case 3: inv = (x + y) % 3 === 0; break;
          case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: inv = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: inv = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: inv = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
        }
        if (inv) this.mod[y][x] = !this.mod[y][x];
      }
    }
  }

  penalidade() {
    const t = this.tam;
    const m = this.mod;
    let p = 0;
    const N1 = 3, N2 = 3, N3 = 40, N4 = 10;

    const linhaPenalidade = get => {
      let pts = 0;
      let corAnt = false, run = 0;
      const hist = [0, 0, 0, 0, 0, 0, 0];
      const addHist = r => {
        if (hist[0] === 0) r += t;
        hist.pop();
        hist.unshift(r);
      };
      const contarFinder = () => {
        const n = hist[1];
        const core = n > 0 && hist[2] === n && hist[3] === n * 3 && hist[4] === n && hist[5] === n;
        return (core && hist[0] >= n * 4 && hist[6] >= n ? 1 : 0) + (core && hist[6] >= n * 4 && hist[0] >= n ? 1 : 0);
      };
      for (let i = 0; i < t; i++) {
        const c = get(i);
        if (c === corAnt) {
          run++;
          if (run === 5) pts += N1;
          else if (run > 5) pts++;
        } else {
          addHist(run);
          if (!corAnt) pts += contarFinder() * N3;
          corAnt = c;
          run = 1;
        }
      }
      if (corAnt) { addHist(run); run = 0; }
      run += t;
      addHist(run);
      pts += contarFinder() * N3;
      return pts;
    };

    for (let y = 0; y < t; y++) p += linhaPenalidade(x => m[y][x]);
    for (let x = 0; x < t; x++) p += linhaPenalidade(y => m[y][x]);

    for (let y = 0; y < t - 1; y++) {
      for (let x = 0; x < t - 1; x++) {
        const c = m[y][x];
        if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += N2;
      }
    }

    let escuros = 0;
    for (const row of m) for (const c of row) if (c) escuros++;
    const total = t * t;
    const k = Math.ceil(Math.abs(escuros * 20 - total * 10) / total) - 1;
    p += k * N4;
    return p;
  }
}

function adicionarEcc(dados, ver, ecl) {
  const nBlocos = NUM_BLOCOS[ecl][ver];
  const eccLen = ECC_CODEWORDS_POR_BLOCO[ecl][ver];
  const rawCodewords = Math.floor(totalModulosDados(ver) / 8);
  const nCurtos = nBlocos - (rawCodewords % nBlocos);
  const lenCurto = Math.floor(rawCodewords / nBlocos);
  const divisor = rsDivisor(eccLen);
  const blocos = [];
  for (let i = 0, k = 0; i < nBlocos; i++) {
    const tamDados = lenCurto - eccLen + (i < nCurtos ? 0 : 1);
    const dat = dados.slice(k, k + tamDados);
    k += tamDados;
    const ecc = rsResto(dat, divisor);
    if (i < nCurtos) dat.push(0);
    blocos.push(dat.concat(ecc));
  }
  const res = [];
  for (let i = 0; i < blocos[0].length; i++) {
    blocos.forEach((b, j) => {
      if (i !== lenCurto - eccLen || j >= nCurtos) res.push(b[i]);
    });
  }
  return res;
}

/**
 * Codifica texto em QR Code.
 * @param {string} texto
 * @param {{ ecc?: 'L'|'M'|'Q'|'H', versaoMin?: number, versaoMax?: number, mascara?: number, modo?: string, aumentarEcc?: boolean }} [opcoes]
 * @returns {{ versao: number, tamanho: number, ecc: string, mascara: number, modo: string, modulos: boolean[][] }}
 */
export function gerarQr(texto, opcoes = {}) {
  const txt = String(texto ?? '');
  if (!txt.length) throw new RangeError('Conteúdo vazio. Informe o texto a codificar.');
  let eccNome = String(opcoes.ecc || 'M').toUpperCase();
  if (!(eccNome in NIVEIS_ECC)) throw new RangeError('Nível de correção inválido. Use L, M, Q ou H.');
  const vMin = Math.max(1, Math.min(40, parseInt(opcoes.versaoMin, 10) || 1));
  const vMax = Math.max(vMin, Math.min(40, parseInt(opcoes.versaoMax, 10) || 40));
  const seg = criarSegmento(txt, opcoes.modo);

  let ver, bitsUsados;
  for (ver = vMin; ; ver++) {
    const capacidade = totalCodewordsDados(ver, NIVEIS_ECC[eccNome]) * 8;
    const cc = bitsContagem(seg.modo, ver);
    bitsUsados = seg.qtd < (1 << cc) ? 4 + cc + seg.bits.length : Infinity;
    if (bitsUsados <= capacidade) break;
    if (ver >= vMax) throw new RangeError(`Conteúdo grande demais para QR Code (${seg.qtd} ${seg.modo === 'byte' ? 'bytes' : 'caracteres'}) com correção ${eccNome}.`);
  }

  if (opcoes.aumentarEcc !== false) {
    for (const nome of ['M', 'Q', 'H']) {
      if (NIVEIS_ECC[nome] > NIVEIS_ECC[eccNome] && bitsUsados <= totalCodewordsDados(ver, NIVEIS_ECC[nome]) * 8) eccNome = nome;
    }
  }
  const ecl = NIVEIS_ECC[eccNome];

  const bits = [];
  const push = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  push(seg.indicador, 4);
  push(seg.qtd, bitsContagem(seg.modo, ver));
  bits.push(...seg.bits);
  const capBits = totalCodewordsDados(ver, ecl) * 8;
  push(0, Math.min(4, capBits - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capBits; pad ^= 0xec ^ 0x11) push(pad, 8);

  const dados = [];
  for (let i = 0; i < bits.length; i += 8) dados.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

  const codewords = adicionarEcc(dados, ver, ecl);
  const m = new Matriz(ver);
  m.padroesFuncionais();
  m.posicionarDados(codewords);

  let mascara = opcoes.mascara;
  if (mascara === undefined || mascara === null || mascara === '' || mascara < 0 || mascara > 7) {
    let melhor = Infinity;
    for (let i = 0; i < 8; i++) {
      m.aplicarMascara(i);
      m.formato(ECC_FORMAT_BITS[eccNome], i);
      const p = m.penalidade();
      if (p < melhor) { melhor = p; mascara = i; }
      m.aplicarMascara(i);
    }
  }
  mascara = Number(mascara);
  m.aplicarMascara(mascara);
  m.formato(ECC_FORMAT_BITS[eccNome], mascara);

  return { versao: ver, tamanho: m.tam, ecc: eccNome, mascara, modo: seg.modo, bytes: seg.modo === 'byte' ? seg.qtd : undefined, modulos: m.mod };
}

export const TEMAS_QR = {
  dark: {
    cor: '#f8fafc',
    fundo: '#111827',
    borda: '#1e293b'
  },
  ponte: {
    cor: '#a3e635',
    fundo: '#0b0f19',
    borda: 'rgba(163, 230, 53, 0.28)'
  },
  emerald: {
    cor: '#10b981',
    fundo: '#0b0f19',
    borda: 'rgba(16, 185, 129, 0.28)'
  },
  blue: {
    cor: '#38bdf8',
    fundo: '#0b0f19',
    borda: 'rgba(56, 189, 248, 0.28)'
  },
  transparent: {
    cor: 'currentColor',
    fundo: 'none',
    borda: 'none'
  },
  light: {
    cor: '#0c1715',
    fundo: '#ffffff',
    borda: '#e2e8e4'
  }
};

function corValida(c, padrao) {
  if (c === undefined || c === null || c === '') return padrao;
  const s = String(c).trim();
  if (/^(transparent|none|currentColor)$/i.test(s)) return s;
  if (/^#?[0-9a-f]{3}([0-9a-f]{3})?([0-9a-f]{2})?$/i.test(s)) return s.startsWith('#') ? s : '#' + s;
  if (/^rgba?\([^)]+\)$/i.test(s)) return s;
  if (/^var\(--[a-zA-Z0-9_-]+\)$/.test(s)) return s;
  return padrao;
}

/**
 * Renderiza QR em SVG (um único <path>, ideal para impressão e escala infinita).
 * @param {string} texto
 * @param {{ ecc?: string, tamanho?: number, margem?: number, cor?: string, fundo?: string, estilo?: 'quadrado'|'arredondado'|'pontos', tema?: 'dark'|'ponte'|'emerald'|'blue'|'transparent'|'light', borda?: string|boolean, raio?: number }} [opcoes]
 */
export function gerarQrSvg(texto, opcoes = {}) {
  const qr = gerarQr(texto, opcoes);
  const temaCfg = TEMAS_QR[String(opcoes.tema || '').toLowerCase()] || TEMAS_QR.dark;

  const margem = Math.max(0, Math.min(20, parseInt(opcoes.margem ?? 4, 10) || 0));
  const lado = qr.tamanho + margem * 2;
  const px = Math.max(64, Math.min(4096, parseInt(opcoes.tamanho, 10) || 320));
  
  const cor = corValida(opcoes.cor, temaCfg.cor);
  const fundo = corValida(opcoes.fundo, temaCfg.fundo);
  const corBorda = opcoes.borda === false || opcoes.borda === 'none' 
    ? 'none' 
    : corValida(opcoes.borda, temaCfg.borda);
  const raio = opcoes.raio !== undefined ? Math.max(0, Number(opcoes.raio) || 0) : (fundo !== 'none' ? 2 : 0);

  const estilo = opcoes.estilo || 'quadrado';
  let desenho = '';
  if (estilo === 'pontos') {
    for (let y = 0; y < qr.tamanho; y++) for (let x = 0; x < qr.tamanho; x++) if (qr.modulos[y][x]) desenho += `<circle cx="${x + margem + 0.5}" cy="${y + margem + 0.5}" r="0.45"/>`;
    desenho = `<g fill="${cor}">${desenho}</g>`;
  } else {
    let d = '';
    for (let y = 0; y < qr.tamanho; y++) for (let x = 0; x < qr.tamanho; x++) if (qr.modulos[y][x]) d += `M${x + margem},${y + margem}h1v1h-1z`;
    desenho = `<path d="${d}" fill="${cor}"${estilo === 'arredondado' ? ' stroke="' + cor + '" stroke-width="0.08" stroke-linejoin="round"' : ''}/>`;
  }

  let fundoElemento = '';
  if (fundo !== 'none') {
    const strokeAttr = corBorda !== 'none' ? ` stroke="${corBorda}" stroke-width="0.4"` : '';
    const rxAttr = raio > 0 ? ` rx="${raio}" ry="${raio}"` : '';
    fundoElemento = `<rect width="100%" height="100%" fill="${fundo}"${strokeAttr}${rxAttr}/>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" width="${px}" height="${px}" shape-rendering="crispEdges" role="img" aria-label="QR Code">` +
    fundoElemento + desenho + '</svg>';
  return { svg, qr };
}

/** Matriz como texto (█ e espaços) — útil em terminais e logs. */
export function gerarQrTexto(texto, opcoes = {}) {
  const qr = gerarQr(texto, opcoes);
  const margem = 2;
  const t = qr.tamanho;
  const get = (x, y) => x >= 0 && y >= 0 && x < t && y < t && qr.modulos[y][x];
  const linhas = [];
  for (let y = -margem; y < t + margem; y += 2) {
    let l = '';
    for (let x = -margem; x < t + margem; x++) {
      const a = get(x, y), b = get(x, y + 1);
      l += a && b ? '█' : a ? '▀' : b ? '▄' : ' ';
    }
    linhas.push(l);
  }
  return linhas.join('\n');
}

export default { gerarQr, gerarQrSvg, gerarQrTexto, detectarModo, NIVEIS_ECC };
