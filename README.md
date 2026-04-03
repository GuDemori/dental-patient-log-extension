# Dental Patient Log Extension

Extensao Chrome (Manifest V3) para suportar fluxo de mensagens no WhatsApp Web.

## Arquitetura Atual

- Base com Plasmo + React + TypeScript.
- Entrada principal no WhatsApp Web:
  - `content.tsx` (shell da sidebar + mount React)
- Backend da extensao:
  - `background.ts` (auth e chamadas da API via runtime message)
- UI componentizada:
  - `content/SidebarApp.tsx`
  - `content/components/LoginForm.tsx`
  - `content/components/FiltersDropdown.tsx`
  - `content/components/PatientList.tsx`
  - `content/components/PatientCard.tsx`
  - `content/api.ts`
  - `content/types.ts`
  - `content/constants.ts`
  - `content/utils.ts`

## Requisitos

- Node.js 20+
- npm

## Como rodar (por navegador)

```bash
npm install
npm run dev:chrome
```

Comandos:

```bash
npm run dev:chrome
npm run dev:edge
npm run dev:firefox
npm run dev:safari
```

Builds de desenvolvimento:

- `build/chrome-mv3-dev`
- `build/edge-mv3-dev`
- `build/firefox-mv3-dev`
- `build/safari-mv3-dev`

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
