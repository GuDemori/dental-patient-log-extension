# Dental Patient Log Extension

Extensao Chrome (Manifest V3) para suportar fluxo de mensagens no WhatsApp Web.

## Bloco 0 (fundacao)

- Base criada com Plasmo + React + TypeScript.
- Entradas prontas:
  - `popup.tsx`
  - `background.ts`
  - `content.ts` (carrega em `https://web.whatsapp.com/*`)

## Requisitos

- Node.js 20+
- npm

## Como rodar (por navegador)

```bash
npm install
npm run dev:chrome
```

Builds de desenvolvimento:

- `build/chrome-mv3-dev`
- `build/edge-mv3-dev`
- `build/firefox-mv3-dev`
- `build/safari-mv3-dev`

Comandos:

```bash
npm run dev:chrome
npm run dev:edge
npm run dev:firefox
npm run dev:safari
```

## Build de producao

```bash
npm run build:chrome
npm run build:edge
npm run build:firefox
npm run build:safari
```

Empacotamento:

```bash
npm run package:chrome
npm run package:edge
npm run package:firefox
npm run package:safari
```