import { LAYOUT_STYLE_ID } from "./constants"

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

export const applyPageOffset = (width: number) => {
  ensureLayoutStyle()
  document.documentElement.classList.add("dpl-ext-layout")
  document.documentElement.style.setProperty("--dpl-ext-sidebar-width", `${width}px`)
}

