import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://web.whatsapp.com/*"]
}

const ROOT_ID = "dpl-ext-sidebar-root"
const LAYOUT_STYLE_ID = "dpl-ext-layout-style"
const COLLAPSED_KEY = "dpl_ext_sidebar_collapsed"
const WIDTH_KEY = "dpl_ext_sidebar_width"
const OPEN_WIDTH = 360
const COLLAPSED_WIDTH = 40
const MIN_OPEN_WIDTH = 280

const ensureLayoutStyle = () => {
  if (document.getElementById(LAYOUT_STYLE_ID)) return

  const style = document.createElement("style")
  style.id = LAYOUT_STYLE_ID
  style.textContent = `
    html.dpl-ext-layout,
    html.dpl-ext-layout body {
      overflow-x: hidden !important;
    }

    html.dpl-ext-layout #app,
    html.dpl-ext-layout #app > div,
    html.dpl-ext-layout #app > div > div {
      width: calc(100vw - var(--dpl-ext-sidebar-width, 0px)) !important;
      max-width: calc(100vw - var(--dpl-ext-sidebar-width, 0px)) !important;
    }
  `

  document.head.appendChild(style)
}

const applyPageOffset = (width: number) => {
  ensureLayoutStyle()
  document.documentElement.classList.add("dpl-ext-layout")
  document.documentElement.style.setProperty("--dpl-ext-sidebar-width", `${width}px`)
}

const setCollapsedState = (
  root: HTMLDivElement,
  collapsed: boolean,
  collapseButton: HTMLButtonElement,
  expandButton: HTMLButtonElement,
  title: HTMLHeadingElement,
  content: HTMLDivElement,
  openWidth: number
) => {
  root.style.width = `${collapsed ? COLLAPSED_WIDTH : openWidth}px`
  collapseButton.style.display = collapsed ? "none" : "inline-flex"
  expandButton.style.display = collapsed ? "inline-flex" : "none"
  title.style.display = collapsed ? "none" : "block"
  content.style.display = collapsed ? "none" : "block"

  applyPageOffset(collapsed ? COLLAPSED_WIDTH : openWidth)
  localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0")
}

const mountSidebar = () => {
  if (window.top !== window.self) return
  if (window.location.hostname !== "web.whatsapp.com") return
  if (document.getElementById(ROOT_ID)) return

  const root = document.createElement("div")
  root.id = ROOT_ID
  root.style.position = "fixed"
  root.style.top = "0"
  root.style.right = "0"
  root.style.height = "100vh"
  root.style.width = `${OPEN_WIDTH}px`
  root.style.zIndex = "2147483647"
  root.style.transition = "width 180ms ease"
  root.style.pointerEvents = "auto"

  const shadow = root.attachShadow({ mode: "open" })

  const style = document.createElement("style")
  style.textContent = `
    :host {
      all: initial;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    }

    .panel {
      height: 100%;
      box-sizing: border-box;
      background: #f8fafc;
      border-left: 1px solid #d1d5db;
      color: #0f172a;
      display: flex;
      flex-direction: column;
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 10px 10px 12px;
      border-bottom: 1px solid #e5e7eb;
      background: #ffffff;
    }

    .title {
      font-size: 14px;
      font-weight: 700;
      margin: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .toggle {
      border: 1px solid #cbd5e1;
      background: #ffffff;
      color: #0f172a;
      min-width: 28px;
      height: 28px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      line-height: 1;
      padding: 0 8px;
      align-items: center;
      justify-content: center;
      display: inline-flex;
    }

    .expand {
      width: 100%;
      height: 100%;
      border: none;
      border-left: 1px solid #d1d5db;
      background: #ffffff;
      color: #334155;
      cursor: pointer;
      font-size: 12px;
      font-weight: 700;
      writing-mode: vertical-rl;
      text-orientation: mixed;
      letter-spacing: 0.04em;
      display: none;
      align-items: center;
      justify-content: center;
      user-select: none;
    }

    .content {
      padding: 12px;
      font-size: 14px;
      color: #475569;
    }

    .hint {
      margin: 0;
      line-height: 1.4;
    }

    .resizer {
      position: absolute;
      left: 0;
      top: 0;
      width: 8px;
      height: 100%;
      cursor: ew-resize;
      z-index: 20;
    }

    .resizer:hover {
      background: rgba(59, 130, 246, 0.12);
    }
  `

  const panel = document.createElement("section")
  panel.className = "panel"

  const topbar = document.createElement("div")
  topbar.className = "topbar"

  const title = document.createElement("h2")
  title.className = "title"
  title.textContent = "Dental Patient Log"

  const collapseButton = document.createElement("button")
  collapseButton.className = "toggle"
  collapseButton.type = "button"
  collapseButton.textContent = "Minimizar"
  collapseButton.title = "Minimizar painel"

  const expandButton = document.createElement("button")
  expandButton.className = "expand"
  expandButton.type = "button"
  expandButton.textContent = "EXPANDIR"
  expandButton.title = "Expandir painel"

  const content = document.createElement("div")
  content.className = "content"
  content.innerHTML =
    '<p class="hint">Painel sempre visivel no WhatsApp Web. Proximos blocos: lista de pacientes, templates e envio.</p>'

  const resizer = document.createElement("div")
  resizer.className = "resizer"
  resizer.title = "Arraste para redimensionar"

  const getMaxWidth = () => Math.floor(window.innerWidth * 0.5)
  const clampWidth = (value: number) => Math.min(Math.max(value, MIN_OPEN_WIDTH), getMaxWidth())

  const savedWidth = Number.parseInt(localStorage.getItem(WIDTH_KEY) || "", 10)
  let openWidth = Number.isFinite(savedWidth) ? clampWidth(savedWidth) : OPEN_WIDTH
  let collapsed = localStorage.getItem(COLLAPSED_KEY) === "1"

  const collapse = () => {
    collapsed = true
    setCollapsedState(root, true, collapseButton, expandButton, title, content, openWidth)
  }

  const expand = () => {
    collapsed = false
    setCollapsedState(root, false, collapseButton, expandButton, title, content, openWidth)
  }

  resizer.addEventListener("mousedown", (event) => {
    if (collapsed) {
      collapsed = false
      setCollapsedState(root, false, collapseButton, expandButton, title, content, openWidth)
    }

    event.preventDefault()

    const startX = event.clientX
    const startWidth = openWidth

    document.body.style.userSelect = "none"

    const onMouseMove = (moveEvent: MouseEvent) => {
      const candidate = startWidth + (startX - moveEvent.clientX)
      openWidth = clampWidth(candidate)
      localStorage.setItem(WIDTH_KEY, String(openWidth))
      setCollapsedState(root, false, collapseButton, expandButton, title, content, openWidth)
    }

    const onMouseUp = () => {
      document.body.style.userSelect = ""
      document.removeEventListener("mousemove", onMouseMove)
      document.removeEventListener("mouseup", onMouseUp)
    }

    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp)
  })

  window.addEventListener("resize", () => {
    openWidth = clampWidth(openWidth)
    localStorage.setItem(WIDTH_KEY, String(openWidth))
    setCollapsedState(root, collapsed, collapseButton, expandButton, title, content, openWidth)
  })

  collapseButton.addEventListener("click", collapse)
  expandButton.addEventListener("click", expand)

  topbar.append(title, collapseButton)
  panel.append(topbar, content, expandButton)
  shadow.append(style, panel, resizer)
  document.documentElement.appendChild(root)

  setCollapsedState(root, collapsed, collapseButton, expandButton, title, content, openWidth)
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountSidebar, { once: true })
} else {
  mountSidebar()
}
