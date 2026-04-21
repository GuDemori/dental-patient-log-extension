# Fluxo de Envio de Mensagens (sem enfileiramento)

## Visão geral
Quando você clica em **Disparar**, o front inicia um loop que processa uma lista de contatos diretamente, sem fila:
1. busca um lote de mensagens no back,
2. abre o chat do contato,
3. envia texto/mídia,
4. atualiza status no back,
5. avança para o próximo contato até terminar ou pausar.

## Fluxo passo a passo

### 1) Clique em Disparar (front)
- O front valida permissões e bloqueios.
- Aplica proteção anti-duplo-clique.
- Alterna para estado "rodando" e inicia o processamento sequencial.

### 2) Buscar lote no back (controller/service)
- O front pede um lote de pendências ao back.
- O back devolve uma lista ordenada de itens pendentes.
- O front mantém essa lista em memória e processa item por item.

### 3) Processar item atual
Para cada item:
- normaliza telefone,
- prepara texto com variáveis,
- abre a conversa do contato,
- valida se a tela está pronta,
- envia,
- atualiza status (`sent`, `error`, `cancelled`).

### 4) Atualizar status no back
Após tentativa:
- o front chama endpoint de atualização de status,
- o back persiste o resultado,
- o front segue para o próximo item.

### 5) Delay entre envios
- Aplica atraso aleatório entre mínimo/máximo configurados.
- Reduz padrão rígido de disparo.

### 6) Falhas e retentativas
- Em timeout ou erro de UI, tenta novamente com backoff.
- Se exceder limite de retentativas, marca `error` e segue.
- Se houver número inválido, fecha modal e registra erro.

### 7) Pausar disparo
- Interrompe loop atual.
- Limpa timers/intervalos.
- Nenhum novo item é enviado até novo clique em Disparar.

## Como identificar contato e componentes corretos (exemplos genéricos)

## 1) Identificar contato certo antes de enviar
```js
function normalizePhone(raw) {
  return raw.replace(/\D/g, "");
}

function isCorrectChat(expectedPhone, headerText) {
  const expected = normalizePhone(expectedPhone);
  const current = normalizePhone(headerText || "");
  return current.includes(expected) || expected.includes(current);
}
```

Regra prática:
- abra o chat,
- leia nome/telefone no cabeçalho,
- compare com o telefone esperado normalizado,
- só envia se bater.

## 2) Seletores com fallback (não depender de 1 seletor só)
```js
function findSendButton(doc) {
  const selectors = [
    '[aria-label="Send"]',
    '[aria-label="Enviar"]',
    'button[data-testid="send"]',
    'footer button:has(svg[data-icon="send"])'
  ];
  for (const s of selectors) {
    const el = doc.querySelector(s);
    if (el) return el;
  }
  return null;
}
```

Regra prática:
- monte lista de seletores por prioridade,
- tente todos,
- use o primeiro válido.

## 3) Validar estado da tela antes de clicar enviar
```js
function canSend({ loadingEl, invalidModalEl, inputEl, sendBtn }) {
  if (loadingEl) return { ok: false, reason: "loading" };
  if (invalidModalEl) return { ok: false, reason: "invalid-number" };
  if (!inputEl || !sendBtn) return { ok: false, reason: "ui-not-ready" };
  return { ok: true };
}
```

Regra prática:
- bloquear envio se a tela ainda carrega,
- bloquear envio se modal de erro estiver aberto,
- bloquear envio se input/botão não estiverem prontos.

## 4) Confirmar que a mídia foi anexada
```js
function mediaReady(previewEl, sendMediaBtn) {
  return Boolean(previewEl && sendMediaBtn);
}
```

Regra prática:
- só enviar mídia quando preview + botão de envio da mídia estiverem visíveis.

## 5) Orquestração resumida do envio
```js
for (const item of batch) {
  openChat(item.phone, item.text);
  await waitUntilUIReady();

  if (!isCorrectChat(item.phone, readHeader())) {
    await markStatus(item.id, "error", "chat-mismatch");
    continue;
  }

  const state = canSend(readUIState());
  if (!state.ok) {
    await retryOrMarkError(item, state.reason);
    continue;
  }

  clickSend();
  await markStatus(item.id, "sent");
  await randomDelay(minDelay, maxDelay);
}
```

## Papel das camadas (genérico)
- **Front:** controla o loop, encontra elementos na tela e executa envio.
- **Controller:** expõe endpoints de obter lote e atualizar status.
- **Service:** aplica regras de negócio (limites, transição de status, retentativas).
- **Persistência:** mantém estado oficial dos disparos.

## Resumo em uma linha
No modelo sem fila, o clique em **Disparar** inicia um loop direto no front que processa o lote recebido do back, envia item a item na UI do WhatsApp e confirma status no back até concluir.
