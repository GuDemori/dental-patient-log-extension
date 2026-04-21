export type WhatsAppSendErrorCode =
  | "chat-mismatch"
  | "ui-not-ready"
  | "invalid-number"
  | "timeout"
  | "unknown"

const HEADER_SELECTORS = [
  "header [data-testid='conversation-info-header-chat-title']",
  "header [data-testid='conversation-header-title']",
  "header [data-testid='chat-subtitle']",
  "header span[title]",
]

const INPUT_SELECTORS = [
  "footer div[contenteditable='true'][role='textbox']",
  "footer div[contenteditable='true'][data-lexical-editor='true']",
  "div[contenteditable='true'][data-tab='10']",
  "div[contenteditable='true'][role='textbox']",
]

const SEND_BUTTON_SELECTORS = [
  "button[data-testid='compose-btn-send']",
  "button[data-testid='send']",
  "button[aria-label='Enviar']",
  "button[aria-label='Send']",
]

const INVALID_MODAL_SELECTORS = [
  "div[role='dialog']",
  "div[data-animate-modal-popup='true']",
]

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })

export const randomDelayMs = (minMs: number, maxMs: number) =>
  Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs

const normalizePhone = (value: string | null | undefined) => (value || "").replace(/\D/g, "")

export const validatePhoneForSend = (phone: string | null | undefined) => {
  const normalized = normalizePhone(phone)
  if (!normalized) return { ok: false as const, code: "no_phone" as const, phone: normalized }
  if (normalized.length < 10 || normalized.length > 15) {
    return { ok: false as const, code: "invalid_phone" as const, phone: normalized }
  }
  return { ok: true as const, phone: normalized }
}

const waitForElement = async (selectors: string[], timeoutMs: number) => {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    for (const selector of selectors) {
      const found = document.querySelector<HTMLElement>(selector)
      if (found) return found
    }
    await sleep(150)
  }
  return null
}

const waitForSendButton = async (timeoutMs: number) => {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const direct = queryAny(SEND_BUTTON_SELECTORS)
    if (direct) return direct

    const icon = document.querySelector<HTMLElement>("span[data-icon='send']")
    if (icon) {
      const button = icon.closest("button") as HTMLElement | null
      if (button) return button
    }
    await sleep(150)
  }
  return null
}

const queryAny = (selectors: string[]) => {
  for (const selector of selectors) {
    const found = document.querySelector<HTMLElement>(selector)
    if (found) return found
  }
  return null
}

const hasInvalidNumberModal = () => {
  for (const selector of INVALID_MODAL_SELECTORS) {
    const el = document.querySelector<HTMLElement>(selector)
    if (!el) continue
    const txt = (el.textContent || "").toLowerCase()
    if (txt.includes("invalid") || txt.includes("inválido") || txt.includes("não está no whatsapp")) {
      return true
    }
  }
  return false
}

const readHeaderText = () => {
  const header = queryAny(HEADER_SELECTORS)
  return (header?.textContent || "").trim()
}

const isCorrectChat = (expectedPhone: string) => {
  const headerText = readHeaderText()
  const current = normalizePhone(headerText)
  const expected = normalizePhone(expectedPhone)
  if (!expected) return false
  if (!current) return true
  return current.includes(expected) || expected.includes(current)
}

const insertText = (input: HTMLElement, text: string) => {
  input.focus()
  document.execCommand("selectAll", false)
  document.execCommand("insertText", false, text)
  const inputEvent = new InputEvent("input", { bubbles: true, inputType: "insertText", data: text })
  input.dispatchEvent(inputEvent)
}

const buildSendUrl = (phone: string, text: string) => {
  const params = new URLSearchParams()
  params.set("phone", normalizePhone(phone))
  params.set("text", text)
  params.set("type", "phone_number")
  params.set("app_absent", "0")
  return `${window.location.origin}/send?${params.toString()}`
}

const ensureChatRoute = (phone: string, text: string) => {
  const normalizedPhone = normalizePhone(phone)
  if (!normalizedPhone) return

  const search = new URLSearchParams(window.location.search)
  const currentPhone = normalizePhone(search.get("phone") || "")
  if (window.location.pathname === "/send" && currentPhone && (currentPhone.includes(normalizedPhone) || normalizedPhone.includes(currentPhone))) {
    return
  }

  const targetUrl = buildSendUrl(normalizedPhone, text)
  window.location.assign(targetUrl)
}

const waitForChatRoute = async (phone: string, timeoutMs: number) => {
  const start = Date.now()
  const normalized = normalizePhone(phone)
  while (Date.now() - start < timeoutMs) {
    const search = new URLSearchParams(window.location.search)
    const urlPhone = normalizePhone(search.get("phone") || "")
    const header = normalizePhone(readHeaderText())
    if (
      (urlPhone && (urlPhone.includes(normalized) || normalized.includes(urlPhone))) ||
      (header && (header.includes(normalized) || normalized.includes(header)))
    ) {
      return true
    }
    if (hasInvalidNumberModal()) return true
    await sleep(200)
  }
  return false
}

export const sendWhatsAppMessage = async (
  phone: string,
  text: string
): Promise<{ ok: true } | { ok: false; code: WhatsAppSendErrorCode; reason: string }> => {
  try {
    ensureChatRoute(phone, text)
    const routeOk = await waitForChatRoute(phone, 15000)
    if (!routeOk) {
      return { ok: false, code: "timeout", reason: "Tempo esgotado ao abrir conversa do contato." }
    }
    await sleep(1200)

    if (hasInvalidNumberModal()) {
      return { ok: false, code: "invalid-number", reason: "Número inválido no WhatsApp Web." }
    }

    const input = await waitForElement(INPUT_SELECTORS, 10000)
    const sendBtn = await waitForSendButton(10000)
    if (!input || !sendBtn) {
      return { ok: false, code: "ui-not-ready", reason: "Input ou botão de envio indisponíveis." }
    }

    if (!isCorrectChat(phone)) {
      return { ok: false, code: "chat-mismatch", reason: "Chat aberto não corresponde ao telefone esperado." }
    }

    const content = (input.textContent || "").trim()
    if (!content) {
      insertText(input, text)
      await sleep(300)
    }

    sendBtn.click()
    await sleep(1000)
    return { ok: true }
  } catch (error) {
    if ((error as Error).message.toLowerCase().includes("timeout")) {
      return { ok: false, code: "timeout", reason: "Tempo esgotado ao enviar mensagem." }
    }
    return { ok: false, code: "unknown", reason: (error as Error).message || "Falha desconhecida no envio." }
  }
}

export const backoffDelayMs = (attempt: number) => {
  const base = 1000
  return base * Math.pow(2, Math.max(0, attempt - 1))
}

export const waitMs = sleep
