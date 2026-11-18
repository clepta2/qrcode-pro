# ▦ QR Code & Código de Barras Pro API • QR ISO 18004, EAN, Code 128 e Boleto em SVG

> **API e SDK oficial na borda Cloudflare Anycast (<2ms) para gerar QR Codes (texto, URL, Wi-Fi, WhatsApp, e-mail, localização e vCard) e códigos de barras (EAN-13, EAN-8, UPC-A, Code 128, ITF, ITF-14 e boleto FEBRABAN) em SVG vetorial. O código é nativo, sem dependências.**

[![Status](https://img.shields.io/badge/Status-Produção%20Tier--1-success.svg)](#)
[![Infra](https://img.shields.io/badge/Infra-Cloudflare%20Workers%20Anycast-orange.svg)](#)
[![Deps](https://img.shields.io/badge/Depend%C3%AAncias-0-blue.svg)](#)
[![License](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)

---

## 🧭 Visão Geral

1. **QR Code ISO/IEC 18004**: versões 1 a 40, correção de erro L/M/Q/H, modos numérico, alfanumérico e byte (UTF-8), com seleção automática de versão e máscara.
2. **Tipos prontos**: Wi-Fi, WhatsApp, e-mail, telefone, SMS, localização e vCard.
3. **Códigos de barras**: EAN-13, EAN-8, UPC-A (com dígito verificador GS1 calculado e validado), Code 128 (subconjuntos B e C automáticos), ITF, ITF-14 e boleto.
4. **Boleto FEBRABAN**: converte a linha digitável (47 dígitos) para o código de barras (44 dígitos) e gera o ITF.
5. **Saída em SVG** com um único `<path>`, pronta para impressão em qualquer escala. Temas da Ponte, cores e estilos de módulo configuráveis.

### Verificação

O codificador de QR foi conferido por três métodos:
- Matrizes de módulos **idênticas** às de uma implementação de referência independente (biblioteca `qrcode` 1.5.4) em 1.742 combinações (versões 1–40, níveis L/M/Q/H, máscaras 0 e 5, modos numérico, alfanumérico e byte).
- Decodificação com **jsQR** e **ZXing**. Nenhum dos dois lê todas as versões: nas versões 23, 24, 25, 37 e 39 um deles falha, e falha igual com a matriz da biblioteca de referência. Isso é limitação do leitor e não do encoder, mas significa que o QR não foi lido por dois leitores em todas as versões.
- A escolha automática de máscara difere da biblioteca de referência em alguns textos (7 de 28 testados). O QR gerado continua válido; só a máscara escolhida pode ser outra.
- Leitura dos formatos de barras (EAN-13, EAN-8, UPC-A, Code 128, ITF, ITF-14 e boleto) com o **ZXing**.

> ⚠️ **Contraste**: na API o tema padrão é `light` (módulos escuros sobre fundo claro), que é o formato lido pelos leitores. Os temas `dark`, `ponte`, `emerald` e `blue` desenham módulos claros sobre fundo escuro (QR invertido). Num teste com jsQR esse formato **não foi lido**; use-os só para exibição em tela e confirme com o leitor que você usa.

---

## 📦 Planos

| Plano | Limite RPM | Cota Diária | Prefixo de Chave |
|---|---|---|---|
| **Free / Sandbox** | 30 RPM | 500 req/dia | (sem chave) |
| **Starter** | 60 RPM | 86.400 req/dia | `qr_start_` / `pnt_start_` |
| **Pro** | 300 RPM | 250.000 req/dia | `qr_pro_` / `pnt_pro_` |
| **Business** | 1.200 RPM | 1.000.000 req/dia | `qr_biz_` / `pnt_biz_` |
| **Master Admin** | 3.000 RPM | Ilimitada | `qr_master_` / `pnt_master_` |

---

## 🚀 Endpoints REST

| Método | Rota | Descrição |
|---|---|---|
| GET/POST | `/api/qrcode.svg?conteudo=&ecc=M&tamanho=320&tema=light&logo=pix` | QR Code em SVG com suporte a logo central (`pix`, `whatsapp`, `wifi`, `ponte`) |
| GET/POST | `/api/qrcode/json?conteudo=` | Matriz de módulos |
| GET | `/api/qrcode/texto?conteudo=` | Versão em texto para terminal |
| GET/POST | `/api/qrcode/:tipo.svg` | `wifi`, `whatsapp`, `email`, `telefone`, `sms`, `geo`, `vcard`, `url` |
| GET | `/api/barcode/:formato.svg?valor=` | `ean13`, `ean8`, `upca`, `code128`, `itf`, `itf14`, `boleto` |
| GET | `/api/barcode/:formato/json?valor=` | Módulos do código de barras |
| GET | `/api/barcode/gtin/validar/:codigo` | Valida GTIN-8/12/13/14 |
| GET | `/api/barcode/boleto/converter?linha=` | Linha digitável → código de barras |

```bash
curl "https://qrcode-pro-api.maputo2.workers.dev/api/qrcode/wifi.svg?ssid=Casa&senha=12345678&tema=light" -o wifi.svg
curl "https://qrcode-pro-api.maputo2.workers.dev/api/barcode/ean13.svg?valor=789100010010&tema=light" -o ean.svg
```

---

## 💻 SDK

```javascript
import { QrCodePro } from 'qrcode-pro';

QrCodePro.configure({ apiKey: process.env.PONTE_API_KEY });

const svg = await QrCodePro.qrSvg('https://exemplo.com', { ecc: 'Q', tema: 'light' });
const wifi = await QrCodePro.qrTipo('wifi', { ssid: 'Casa', senha: '12345678' });
const ean = await QrCodePro.barrasSvg('ean13', '789100010010');
```

O motor roda também direto no navegador ou no Node.js, sem a API: `import { gerarQrSvg } from './qr-engine.js'`.

---

## 🧪 Testes

```bash
npm test   # test.js (temas e renderização) + test-api.js (codificação, vetores e HTTP)
```

## 📄 Licença

MIT — consulte [LICENSE](LICENSE).
