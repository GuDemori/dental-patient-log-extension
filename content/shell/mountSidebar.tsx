import { createRoot } from "react-dom/client"

import iconUrl from "url:../../assets/icon.png"
import logoUrl from "url:../../assets/logo.jpg"
import sidebarCssText from "data-text:../styles/sidebar.css"

import { SidebarChrome } from "../components/SidebarChrome"
import { OPEN_WIDTH, ROOT_ID } from "./constants"
import { useSidebarLayout } from "./useSidebarLayout"

const SidebarHost = ({ hostRoot }: { hostRoot: HTMLDivElement }) => {
  const layout = useSidebarLayout(hostRoot)

  return (
    <SidebarChrome
      collapsed={layout.collapsed}
      onCollapse={layout.collapse}
      onExpand={layout.expand}
      onStartResize={layout.handleResizeMouseDown}
      logoUrl={logoUrl}
      iconUrl={iconUrl}
    />
  )
}

export const mountSidebar = () => {
  if (window.top !== window.self) return
  if (window.location.hostname !== "web.whatsapp.com") return
  if (document.getElementById(ROOT_ID)) return

  const hostRoot = document.createElement("div")
  hostRoot.id = ROOT_ID
  hostRoot.style.position = "fixed"
  hostRoot.style.top = "0"
  hostRoot.style.right = "0"
  hostRoot.style.height = "100vh"
  hostRoot.style.width = `${OPEN_WIDTH}px`
  hostRoot.style.zIndex = "2147483647"
  hostRoot.style.transition = "width 180ms ease"
  hostRoot.style.pointerEvents = "auto"

  const shadow = hostRoot.attachShadow({ mode: "open" })

  const style = document.createElement("style")
  style.textContent = sidebarCssText

  const mountPoint = document.createElement("div")
  mountPoint.style.height = "100%"
  mountPoint.style.width = "100%"
  shadow.append(style, mountPoint)
  document.documentElement.appendChild(hostRoot)

  const reactRoot = createRoot(mountPoint)
  reactRoot.render(<SidebarHost hostRoot={hostRoot} />)
}
