/**
 * test.js — Bateria de Testes Automatizados da Suíte QRCode Pro & Barcode Engine
 * Validação de algoritmos 1D/2D, GS1, ISO/IEC 18004, Temas Ponte API e SVG
 *
 * @license MIT
 */

import { gerarBarras, gerarBarrasSvg, validarGtin, digitoGs1, linhaDigitavelParaCodigoBarras, FORMATOS_BARRAS, TEMAS_BARCODE } from './barcode-engine.js';
import { gerarQr, gerarQrSvg, gerarQrTexto, TEMAS_QR } from './qr-engine.js';

let pass = 0;
let fail = 0;

function assert(cond, msg) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${msg}`);
  } else {
    fail++;
    console.error(`  ❌ FALHA: ${msg}`);
    throw new Error(msg);
  }
}

console.log('🧪 Iniciando Testes do QRCode Pro & Barcode Engine...\n');

// ─── 1. TESTES GS1 & DIGITOS VERIFICADORES ───
console.log('--- 1. Algoritmos GS1 & Dígitos Verificadores ---');
assert(digitoGs1('789123456789') === '5', 'Cálculo de DV GS1 EAN-13 correto');
assert(validarGtin('7891234567895').valido === true, 'Validação de GTIN-13 brasileiro válida');
assert(validarGtin('7891234567890').valido === false, 'Validação detecta GTIN-13 inválido');

// ─── 2. TESTES DE LINHA DIGITÁVEL E BOLETO FEBRABAN ───
console.log('\n--- 2. Conversão e Validação Boleto FEBRABAN ---');
const linhaBoleto = '34191.09008 00000.283101 09257.470006 4 96450000012500';
const codBarras = linhaDigitavelParaCodigoBarras(linhaBoleto);
assert(codBarras.length === 44, 'Linha digitável de 47 dígitos convertida para 44 dígitos');
assert(codBarras.startsWith('3419'), 'Banco Itaú preservado no código de barras 44');

// ─── 3. TESTES DE TEMAS E DESIGN SYSTEM PONTE NO BARCODE SVG ───
console.log('\n--- 3. Renderização Barcode SVG com Design System da Ponte API ---');
const svgDefault = gerarBarrasSvg('ean13', '7891234567895').svg;
assert(svgDefault.includes('fill="#111827"'), 'Tema padrão dark usa fundo #111827 (Paper)');
assert(svgDefault.includes('fill="#f8fafc"'), 'Tema padrão dark usa barras #f8fafc (Ink)');
assert(svgDefault.includes("font-family=\"'JetBrains Mono', monospace\""), 'Tipografia usa JetBrains Mono');
assert(svgDefault.includes('rx="8"'), 'Card possui cantos arredondados rx="8"');

const svgPonte = gerarBarrasSvg('code128', 'PONTE-API', { tema: 'ponte' }).svg;
assert(svgPonte.includes('fill="#0b0f19"'), 'Tema ponte usa fundo #0b0f19 (Canvas)');
assert(svgPonte.includes('fill="#a3e635"'), 'Tema ponte usa barras e texto em #a3e635 (Mint Oficial)');

const svgTransp = gerarBarrasSvg('boleto', codBarras, { tema: 'transparent' }).svg;
assert(svgTransp.includes('fill="currentColor"'), 'Tema transparente usa currentColor para barras');
assert(!svgTransp.includes('<rect width="100%" height="100%"'), 'Tema transparente não renderiza fundo opaco');

// ─── 4. TESTES DE QR CODE & TEMAS PONTE ───
console.log('\n--- 4. Renderização QR Code SVG com Temas Ponte API ---');
const qrRes = gerarQr('https://ponte-marketplace.maputo2.workers.dev');
assert(qrRes.tamanho > 0, 'Matriz QR Code gerada com sucesso');

const qrSvgPonte = gerarQrSvg('https://ponte.dev', { tema: 'ponte' }).svg;
assert(qrSvgPonte.includes('fill="#0b0f19"'), 'QR Code tema ponte usa fundo #0b0f19');
assert(qrSvgPonte.includes('fill="#a3e635"'), 'QR Code tema ponte usa módulos em #a3e635 (Mint)');

const qrSvgDark = gerarQrSvg('https://ponte.dev').svg;
assert(qrSvgDark.includes('fill="#111827"'), 'QR Code tema padrão dark usa fundo #111827');
assert(qrSvgDark.includes('fill="#f8fafc"'), 'QR Code tema padrão dark usa módulos em #f8fafc');

const qrSvgPontos = gerarQrSvg('teste', { tema: 'emerald', estilo: 'pontos' }).svg;
assert(qrSvgPontos.includes('<circle'), 'QR Code com estilo pontos renderiza círculos');

console.log(`\n🎉 Bateria de testes concluída: ${pass} testes APROVADOS com sucesso! Zero falhas (${fail}).\n`);
