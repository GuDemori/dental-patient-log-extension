import type { MouseEvent as ReactMouseEvent } from "react"
import { useEffect, useMemo, useState } from "react"

import { COLLAPSED_KEY, COLLAPSED_WIDTH, MIN_OPEN_WIDTH, OPEN_WIDTH, WIDTH_KEY } from "./constants"
import { applyPageOffset } from "./pageOffset"

type SidebarLayoutResult = {
  collapsed: boolean
  openWidth: number
  collapse: () => void
  expand: () => void
  handleResizeMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void
}

const getMaxWidth = () => Math.floor(window.innerWidth * 0.5)
const clampWidth = (value: number) => Math.min(Math.max(value, MIN_OPEN_WIDTH), getMaxWidth())

export const useSidebarLayout = (hostRoot: HTMLDivElement): SidebarLayoutResult => {
  const [openWidth, setOpenWidth] = useState(() => {
    const savedWidth = Number.parseInt(localStorage.getItem(WIDTH_KEY) || "", 10)
    return Number.isFinite(savedWidth) ? clampWidth(savedWidth) : OPEN_WIDTH
  })
  const [collapsed, setCollapsed] = useState(localStorage.getItem(COLLAPSED_KEY) === "1")

  const effectiveWidth = useMemo(() => (collapsed ? COLLAPSED_WIDTH : openWidth), [collapsed, openWidth])

  useEffect(() => {
    hostRoot.style.width = `${effectiveWidth}px`
    applyPageOffset(effectiveWidth)
    localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0")
  }, [collapsed, effectiveWidth, hostRoot])

  useEffect(() => {
    const onResize = () => {
      setOpenWidth((prev) => {
        const next = clampWidth(prev)
        localStorage.setItem(WIDTH_KEY, String(next))
        return next
      })
    }

    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  const collapse = () => setCollapsed(true)
  const expand = () => setCollapsed(false)

  const handleResizeMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (collapsed) setCollapsed(false)

    event.preventDefault()

    const startX = event.clientX
    const startWidth = openWidth
    document.body.style.userSelect = "none"

    const onMouseMove = (moveEvent: MouseEvent) => {
      const candidate = startWidth + (startX - moveEvent.clientX)
      const next = clampWidth(candidate)
      setOpenWidth(next)
      localStorage.setItem(WIDTH_KEY, String(next))
    }

    const onMouseUp = () => {
      document.body.style.userSelect = ""
      document.removeEventListener("mousemove", onMouseMove)
      document.removeEventListener("mouseup", onMouseUp)
    }

    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp)
  }

  return {
    collapsed,
    openWidth,
    collapse,
    expand,
    handleResizeMouseDown,
  }
}
