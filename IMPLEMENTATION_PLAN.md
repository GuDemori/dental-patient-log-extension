# Dental Patient Log Extension - Plano de Implementacao

Este documento detalha a execucao dos Blocos 1 a 6 para evolucao da extensao.

## Escopo e objetivo

- Contexto: extensao com sidebar fixa no `web.whatsapp.com` ja funcional no Bloco 0.
- Objetivo: entregar fluxo completo de lembretes com UI equivalente ao sistema principal, integracao com dados reais, fila de envio, automacao do WhatsApp Web e operacao segura.

## Premissas

- Projeto principal (frontend + Supabase) continua sendo a fonte de verdade de dados.
- Extensao atua como cliente operacional dentro do WhatsApp Web.
- Browser alvo inicial para operacao interna: Firefox e Chrome.

## Arquitetura alvo (resumo)

- Extensao (Plasmo):
  - `content.ts`: sidebar, automacao no DOM do WhatsApp Web, executor de envio.
  - `background.ts`: orquestracao leve, retries, watchdog, mensagens entre contexts.
  - `popup.tsx`: status rapido e atalhos.
- Backend (Supabase):
  - tabelas de templates, jobs, tentativas e logs.
  - RPC/Views para pacientes elegiveis sem retorno > 1 ano.
  - politicas RLS e auditoria.

---

## Bloco 1 - UI identica ao sistema

### Objetivo
Reaproveitar design tokens, tipografia, cores e componentes para que a sidebar fique visualmente equivalente ao app principal.

### Entregaveis
- Base visual da sidebar com layout equivalente.
- Lista de pacientes com busca/filtro.
- Seletor de template de mensagem.
- Estados de UI: carregando, vazio, erro, sucesso.

### Tarefas
1. Extrair tokens visuais do app principal (cores, radius, spacing, fontes, sombras).
2. Criar `styles/tokens.css` na extensao e aplicar no shadow root.
3. Modelar componentes de UI da sidebar:
   - `SidebarHeader`
   - `PatientList`
   - `PatientItem`
   - `TemplatePicker`
   - `ActionBar`
4. Padronizar componentes com acessibilidade basica:
   - foco visivel
   - navegaçao por teclado
   - labels e aria
5. Implementar estados de tela:
   - skeleton
   - sem pacientes elegiveis
   - falha de carregamento com retry

### Criterio de aceite
- Visual e comportamento equivalentes ao app principal.
- Sidebar responsiva entre 320px e 420px.
- Sem overflow quebrado no WhatsApp Web.

### Riscos
- Drift visual entre app e extensao ao longo do tempo.

### Mitigacao
- Centralizar tokens em arquivo unico e mapear versao.

---

## Bloco 2 - Integracao de dados

### Objetivo
Buscar pacientes e templates do backend com filtro "sem retorno > 1 ano".

### Entregaveis
- Integracao com Supabase (leitura).
- Filtro por elegibilidade aplicado no backend.
- Atualizacao periodica de dados.

### Tarefas
1. Definir contrato de dados (tipos TS):
   - `PatientEligibility`
   - `MessageTemplate`
2. Criar view/RPC no banco para pacientes elegiveis:
   - base: ultima consulta <= hoje - 1 ano
   - incluir telefone normalizado
3. Criar tabela de templates (se ainda nao existir):
   - `id`, `name`, `category`, `content`, `active`
4. Implementar camada API na extensao:
   - `fetchEligiblePatients`
   - `fetchTemplates`
5. Implementar polling leve (ex: 60s) com controle de concorrencia.
6. Tratar expiracao/autenticacao e erros de rede.

### Criterio de aceite
- Dados reais aparecem e atualizam sem reload manual.
- Filtro >1 ano consistente com regra de negocio.

### Riscos
- Divergencia entre timezone local e banco.

### Mitigacao
- Calcular elegibilidade no banco (`current_date`) e registrar timezone de referencia.

---

## Bloco 3 - Orquestracao de envio

### Objetivo
Clique em "Enviar mensagem" cria job; extensao consome job e persiste status.

### Entregaveis
- Fila de jobs no banco.
- Fluxo `pendente -> processando -> enviado/erro`.
- Registro de tentativa com timestamp e motivo de falha.

### Tarefas
1. Criar tabelas:
   - `message_jobs`
   - `message_attempts`
2. Campos minimos `message_jobs`:
   - `id`, `patient_id`, `template_id`, `phone`, `message_text`
   - `status`, `created_at`, `scheduled_at`, `picked_at`, `finished_at`
   - `picked_by`, `error_code`, `error_message`
3. Criar RPC atomica para "claim" do proximo job elegivel.
4. Criar endpoint/RPC para atualizar status final.
5. Implementar worker na extensao:
   - loop controlado
   - claim de job
   - dispatch para automacao
   - persistencia do resultado
6. Implementar botao UI para criar job individual e em lote.

### Criterio de aceite
- Cada clique cria job.
- Job processado com status persistido no banco (`pendente/enviado/erro`).

### Riscos
- Corrida entre multiplas instancias da extensao.

### Mitigacao
- Claim atomico com lock logico e timeout de processamento.

---

## Bloco 4 - Automacao WhatsApp Web

### Objetivo
Abrir chat, preencher mensagem e confirmar envio com retry.

### Entregaveis
- Executor de envio confiavel para lote pequeno.
- Tratamento de erros comuns no DOM do WhatsApp Web.

### Tarefas
1. Criar adaptador de automacao com etapas:
   - abrir URL `https://web.whatsapp.com/send?phone=...&text=...`
   - aguardar UI estabilizar
   - confirmar que caixa de mensagem/chat foi carregada
   - acionar envio
2. Detectar estados de falha:
   - numero invalido
   - chat indisponivel
   - sessao desconectada
   - seletor nao encontrado
3. Implementar retry:
   - max 2 tentativas
   - backoff (ex: 2s, 5s)
4. Capturar evidencias de falha:
   - codigo de erro
   - trecho de contexto DOM (curto)
5. Atualizar status do job ao final de cada tentativa.

### Criterio de aceite
- Envio consistente em lote pequeno (ex: 20 mensagens) com taxa de sucesso esperada.
- Falhas classificadas corretamente.

### Riscos
- Mudancas de DOM no WhatsApp Web.

### Mitigacao
- Centralizar seletores em modulo unico e versionar adaptador.

---

## Bloco 5 - Confiabilidade

### Objetivo
Evitar duplicidade, criar observabilidade e controles operacionais.

### Entregaveis
- Idempotencia por job.
- Logs e trilha de auditoria.
- Rate-limit, pausa e retomada operacional.

### Tarefas
1. Idempotencia:
   - chave unica por (`patient_id`, `template_id`, `periodo`) quando aplicavel.
   - impedir novo envio se `status=enviado` no mesmo ciclo.
2. Auditoria:
   - `message_audit_log` com ator, acao, timestamp, payload minimo.
3. Rate-limit:
   - limite configuravel por minuto.
4. Controles de operacao na UI:
   - `Pausar envios`
   - `Retomar envios`
   - `Cancelar fila pendente`
5. Alertas basicos:
   - percentual de erro acima do limiar.

### Criterio de aceite
- Sem duplicidade indevida em testes de concorrencia.
- Operacao segura para uso interno.

### Riscos
- Volume maior que capacidade da automacao web.

### Mitigacao
- throttle, janela operacional e lote maximo por execucao.

---

## Bloco 6 - Empacotamento e operacao

### Objetivo
Padronizar release e suporte para time operar sem dependencia direta de dev.

### Entregaveis
- Pipeline de build/versionamento.
- Processo de release interna.
- Runbook de troubleshooting.

### Tarefas
1. Versionamento semantico:
   - `MAJOR.MINOR.PATCH`
2. Scripts de release:
   - build por navegador
   - pacote assinado/interno (quando aplicavel)
3. Documento de instalacao interna por browser.
4. Runbook de suporte:
   - extensao nao aparece
   - nao encontra WhatsApp Web
   - job preso em processando
   - erro de envio por numero invalido
5. Checklist de go-live interno:
   - backup/rollback
   - monitoramento inicial
   - janela de observacao 7 dias

### Criterio de aceite
- Time consegue instalar, operar e diagnosticar sem apoio continuo de dev.

---

## Sequencia sugerida de execucao

1. Bloco 1 (UI)
2. Bloco 2 (dados)
3. Bloco 3 (fila/orquestracao)
4. Bloco 4 (automacao)
5. Bloco 5 (confiabilidade)
6. Bloco 6 (operacao)

## Marco de validacao por sprint (sugestao)

- Sprint A: Bloco 1 + metade do Bloco 2
- Sprint B: fim do Bloco 2 + Bloco 3
- Sprint C: Bloco 4
- Sprint D: Bloco 5 + Bloco 6

## Checklist final de pronto para uso interno

- [ ] UI equivalente ao sistema principal
- [ ] Pacientes elegiveis e templates em dados reais
- [ ] Criacao e consumo de jobs funcionando
- [ ] Envio automatico com retry e classificacao de erro
- [ ] Idempotencia e auditoria ativas
- [ ] Processo de release e runbook publicados
