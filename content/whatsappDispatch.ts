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
  "[data-lexical-text='true']",
  "footer div[contenteditable='true'][role='textbox']",
  "footer div[contenteditable='true'][data-lexical-editor='true']",
  "div[contenteditable='true'][data-tab='10']",
  "div[contenteditable='true'][role='textbox']",
]

const SEND_ICON_IDS = ["wds-ic-send-filled", "send"]
const APP_READY_SELECTOR = "div:has(>#side)"
const LOADING_CHAT_SELECTOR = "[role='status']"
const INVALID_BACKDROP_SELECTOR = "[data-animate-modal-backdrop]"

const INVALID_MODAL_SELECTORS = [
  "div[role='dialog']",
  "div[data-animate-modal-popup='true']",
]

const LOG_PREFIX = "[dpl][whatsapp-dispatch]"

const maskPhone = (value: string | null | undefined) => {
  const digits = normalizePhone(value)
  if (!digits) return "n/a"
  if (digits.length <= 4) return `***${digits}`
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`
}

const describeElement = (el: HTMLElement | null) => {
  if (!el) return "null"
  const role = el.getAttribute("role") || ""
  const aria = el.getAttribute("aria-label") || ""
  return `${el.tagName.toLowerCase()}#${el.id || "-"}.${el.className || "-"}[role=${role || "-"}][aria=${aria || "-"}]`
}

const log = (level: "info" | "warn" | "error", event: string, data?: Record<string, unknown>) => {
  const payload = data ? { ...data, ts: new Date().toISOString() } : { ts: new Date().toISOString() }
  if (level === "error") {
    console.error(`${LOG_PREFIX} ${event}`, payload)
    return
  }
  if (level === "warn") {
    console.warn(`${LOG_PREFIX} ${event}`, payload)
    return
  }
  console.info(`${LOG_PREFIX} ${event}`, payload)
}

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
      if (found) {
        log("info", "waitForElement:found", {
          selector,
          elapsedMs: Date.now() - start,
          element: describeElement(found),
        })
        return found
      }
    }
    await sleep(150)
  }
  log("warn", "waitForElement:timeout", {
    timeoutMs,
    selectors,
  })
  return null
}

const waitForSendButton = async (timeoutMs: number) => {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const button = resolveSendButton(true)
    if (button) return button
    await sleep(150)
  }
  log("warn", "waitForSendButton:timeout", { timeoutMs })
  return null
}

const queryAny = (selectors: string[]) => {
  for (const selector of selectors) {
    const found = document.querySelector<HTMLElement>(selector)
    if (found) return found
  }
  return null
}

const queryAnyWithSelector = (selectors: string[]) => {
  for (const selector of selectors) {
    const found = document.querySelector<HTMLElement>(selector)
    if (found) return { found, selector }
  }
  return null
}

const hasInvalidNumberModal = () => {
  if (document.querySelector(INVALID_BACKDROP_SELECTOR)) {
    log("warn", "invalidModal:backdrop-detected")
    return true
  }

  for (const selector of INVALID_MODAL_SELECTORS) {
    const el = document.querySelector<HTMLElement>(selector)
    if (!el) continue
    const txt = (el.textContent || "").toLowerCase()
    if (txt.includes("invalid") || txt.includes("inválido") || txt.includes("não está no whatsapp")) {
      log("warn", "invalidModal:dialog-detected", {
        selector,
        excerpt: txt.slice(0, 120),
      })
      return true
    }
  }
  return false
}

const readHeaderText = () => {
  const headerMeta = queryAnyWithSelector(HEADER_SELECTORS)
  const header = headerMeta?.found || null
  if (headerMeta) {
    log("info", "header:resolved", {
      selector: headerMeta.selector,
      element: describeElement(headerMeta.found),
    })
  } else {
    log("warn", "header:not-found", { selectors: HEADER_SELECTORS })
  }
  return (header?.textContent || "").trim()
}

const getSendButtonSelectorSets = (id: string) => ({
  normal: [
    `#main footer [role="button"][aria-label="Send"]:has([data-icon="${id}"])`,
    '#main footer [role="button"][aria-label="Send"]',
    `#main footer button[aria-label="Enviar"]:has([data-icon="${id}"])`,
    '#main footer button[aria-label="Enviar"]',
    `#main footer button:has([data-icon="${id}"])`,
    `#main footer [role="button"]:has([data-icon="${id}"])`,
    `#main footer button[data-tab]:has([data-icon="${id}"])`,
  ],
  business: [
    `#main footer [role="button"][aria-label="Enviar"]:has([data-icon="${id}"])`,
    `#main footer [role="button"][aria-label="Send"]:has([data-icon="${id}"])`,
    `#main footer button:has([data-icon="${id}"])`,
    `#main footer [role="button"]:has([data-icon="${id}"])`,
  ],
})

const resolveSendButton = (emitLogs = false) => {
  for (const id of SEND_ICON_IDS) {
    const set = getSendButtonSelectorSets(id)
    const normal = queryAnyWithSelector(set.normal)
    if (normal) {
      if (emitLogs) {
        log("info", "sendButton:resolved-normal", {
          iconId: id,
          selector: normal.selector,
          element: describeElement(normal.found),
        })
      }
      return normal.found
    }
  }

  for (const id of SEND_ICON_IDS) {
    const set = getSendButtonSelectorSets(id)
    const business = queryAnyWithSelector(set.business)
    if (business) {
      if (emitLogs) {
        log("info", "sendButton:resolved-business", {
          iconId: id,
          selector: business.selector,
          element: describeElement(business.found),
        })
      }
      return business.found
    }
  }

  const direct = queryAnyWithSelector([
    "button[data-testid='compose-btn-send']",
    "button[data-testid='send']",
    "button[aria-label='Enviar']",
    "button[aria-label='Send']",
    "#main footer [role='button'][aria-label='Enviar']",
    "#main footer [role='button'][aria-label='Send']",
  ])
  if (direct) {
    if (emitLogs) {
      log("info", "sendButton:resolved-direct", {
        selector: direct.selector,
        element: describeElement(direct.found),
      })
    }
    return direct.found
  }

  const icon = document.querySelector<HTMLElement>("span[data-icon='send'], div[data-icon='send']")
  if (!icon) {
    if (emitLogs) log("warn", "sendButton:not-found")
    return null
  }

  const fallback = (icon.closest("button, [role='button']") as HTMLElement | null) || null
  if (emitLogs) {
    log("info", "sendButton:resolved-icon-fallback", {
      element: describeElement(fallback),
    })
  }
  return fallback
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
    log("info", "route:already-open", {
      phone: maskPhone(normalizedPhone),
      pathname: window.location.pathname,
    })
    return
  }

  const targetUrl = buildSendUrl(normalizedPhone, text)
  log("info", "route:navigate", {
    fromPathname: window.location.pathname,
    toPathname: "/send",
    phone: maskPhone(normalizedPhone),
    hasText: Boolean(text),
    textLength: text.length,
  })
  window.location.assign(targetUrl)
}

const waitForChatRoute = async (phone: string, timeoutMs: number) => {
  const start = Date.now()
  const normalized = normalizePhone(phone)
  log("info", "route:wait-start", {
    timeoutMs,
    phone: maskPhone(normalized),
  })
  while (Date.now() - start < timeoutMs) {
    const search = new URLSearchParams(window.location.search)
    const urlPhone = normalizePhone(search.get("phone") || "")
    const header = normalizePhone(readHeaderText())
    if (
      (urlPhone && (urlPhone.includes(normalized) || normalized.includes(urlPhone))) ||
      (header && (header.includes(normalized) || normalized.includes(header)))
    ) {
      log("info", "route:wait-success", {
        elapsedMs: Date.now() - start,
        urlPhoneLast4: urlPhone.slice(-4),
        headerHasDigits: Boolean(header),
      })
      return true
    }
    if (hasInvalidNumberModal()) {
      log("warn", "route:wait-ended-invalid-modal", {
        elapsedMs: Date.now() - start,
      })
      return true
    }
    await sleep(200)
  }
  log("warn", "route:wait-timeout", {
    elapsedMs: Date.now() - start,
    timeoutMs,
    phone: maskPhone(normalized),
  })
  return false
}

export const sendWhatsAppMessage = async (
  phone: string,
  text: string
): Promise<{ ok: true } | { ok: false; code: WhatsAppSendErrorCode; reason: string }> => {
  try {
    const startedAt = Date.now()
    log("info", "send:start", {
      phone: maskPhone(phone),
      textLength: text.length,
      pathname: window.location.pathname,
    })

    ensureChatRoute(phone, text)
    const routeOk = await waitForChatRoute(phone, 15000)
    if (!routeOk) {
      log("warn", "send:route-timeout", {
        elapsedMs: Date.now() - startedAt,
      })
      return { ok: false, code: "timeout", reason: "Tempo esgotado ao abrir conversa do contato." }
    }
    const uiBootStart = Date.now()
    while (Date.now() - uiBootStart < 8000) {
      if (document.querySelector(APP_READY_SELECTOR) && !document.querySelector(LOADING_CHAT_SELECTOR)) break
      await sleep(150)
    }
    log("info", "send:ui-boot-check", {
      elapsedMs: Date.now() - uiBootStart,
      appReady: Boolean(document.querySelector(APP_READY_SELECTOR)),
      loading: Boolean(document.querySelector(LOADING_CHAT_SELECTOR)),
    })

    if (hasInvalidNumberModal()) {
      log("warn", "send:invalid-number", {
        elapsedMs: Date.now() - startedAt,
      })
      return { ok: false, code: "invalid-number", reason: "Número inválido no WhatsApp Web." }
    }

    const input = await waitForElement(INPUT_SELECTORS, 10000)
    const sendBtn = await waitForSendButton(10000)
    if (!input || !sendBtn) {
      log("warn", "send:ui-not-ready", {
        hasInput: Boolean(input),
        hasSendButton: Boolean(sendBtn),
        elapsedMs: Date.now() - startedAt,
      })
      return { ok: false, code: "ui-not-ready", reason: "Input ou botão de envio indisponíveis." }
    }

    if (!isCorrectChat(phone)) {
      log("warn", "send:chat-mismatch", {
        phone: maskPhone(phone),
        elapsedMs: Date.now() - startedAt,
      })
      return { ok: false, code: "chat-mismatch", reason: "Chat aberto não corresponde ao telefone esperado." }
    }

    const content = (input.textContent || "").trim()
    if (!content) {
      log("info", "send:insert-text", {
        textLength: text.length,
      })
      insertText(input, text)
      await sleep(300)
    }

    log("info", "send:click-button", {
      button: describeElement(sendBtn),
      elapsedMs: Date.now() - startedAt,
    })
    sendBtn.click()
    await sleep(1000)
    log("info", "send:success", {
      elapsedMs: Date.now() - startedAt,
      phone: maskPhone(phone),
    })
    return { ok: true }
  } catch (error) {
    log("error", "send:exception", {
      reason: (error as Error).message || "unknown_error",
      phone: maskPhone(phone),
    })
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
