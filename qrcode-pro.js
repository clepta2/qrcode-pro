/**
 * qrcode-pro.js
 * SDK Oficial para Node.js, Browser e Edge Runtimes
 * QR Code & Código de Barras Pro API — QR (ISO 18004), EAN/UPC, Code 128, ITF-14 e boleto
 *
 * @license MIT
 * @see https://github.com/clepta2/qrcode-pro
 */

export class QrCodePro {
  static baseUrl = 'https://qrcode-pro-api.maputo2.workers.dev';
  static apiKey = '';

  /** @param {{ apiKey?: string, baseUrl?: string }} config */
  static configure(config = {}) {
    if (config.baseUrl) this.baseUrl = config.baseUrl.replace(/\/$/, '');
    if (config.apiKey) this.apiKey = config.apiKey;
  }

  static _headers() {
    const h = { 'User-Agent': 'QrCodePro-SDK/1.0.0' };
    if (this.apiKey) {
      h['Authorization'] = `Bearer ${this.apiKey}`;
      h['x-api-key'] = this.apiKey;
    }
    return h;
  }

  static _qs(params) {
    return new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();
  }

  static async _fetch(path, params, tipo) {
    const resp = await fetch(`${this.baseUrl}${path}?${this._qs(params)}`, { headers: this._headers() });
    if (!resp.ok) {
      let msg = `HTTP ${resp.status}`;
      try { msg = (await resp.json()).mensagem || msg; } catch (_) { /* resposta sem JSON */ }
      throw new Error(`QrCodePro: ${msg}`);
    }
    return tipo === 'json' ? resp.json() : resp.text();
  }

  /** Retorna o SVG do QR Code. Opções: ecc, tamanho, margem, cor, fundo, estilo. */
  static qrSvg(conteudo, opcoes = {}) {
    return this._fetch('/api/qrcode.svg', { conteudo, ...opcoes }, 'text');
  }

  /** QR de tipos prontos: wifi, whatsapp, email, telefone, sms, geo, vcard. */
  static qrTipo(tipo, campos = {}, opcoes = {}) {
    return this._fetch(`/api/qrcode/${encodeURIComponent(tipo)}.svg`, { ...campos, ...opcoes }, 'text');
  }

  static qrMatriz(conteudo, opcoes = {}) {
    return this._fetch('/api/qrcode/json', { conteudo, ...opcoes }, 'json');
  }

  /** Código de barras em SVG. Formatos: ean13, ean8, upca, code128, itf, itf14, boleto. */
  static barrasSvg(formato, valor, opcoes = {}) {
    return this._fetch(`/api/barcode/${encodeURIComponent(formato)}.svg`, { valor, ...opcoes }, 'text');
  }

  static validarGtin(codigo) {
    return this._fetch(`/api/barcode/gtin/validar/${encodeURIComponent(codigo)}`, {}, 'json');
  }

  static linhaDigitavelParaCodigoBarras(linha) {
    return this._fetch('/api/barcode/boleto/converter', { linha }, 'json');
  }
}

export default QrCodePro;
