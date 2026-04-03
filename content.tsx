import type { PlasmoCSConfig } from "plasmo"

import { mountSidebar } from "./content/shell/mountSidebar"

export const config: PlasmoCSConfig = {
  matches: ["https://web.whatsapp.com/*"],
}

const Content = () => null

export default Content

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountSidebar, { once: true })
} else {
  mountSidebar()
}
