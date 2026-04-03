import type { MouseEvent } from "react"

import { SidebarApp } from "../SidebarApp"

type SidebarChromeProps = {
  collapsed: boolean
  onCollapse: () => void
  onExpand: () => void
  onStartResize: (event: MouseEvent<HTMLDivElement>) => void
  logoUrl: string
  iconUrl: string
}

export const SidebarChrome = ({ collapsed, onCollapse, onExpand, onStartResize, logoUrl, iconUrl }: SidebarChromeProps) => {
  return (
    <>
      <section className="panel">
        {!collapsed ? (
          <>
            <div className="topbar">
              <div className="brand">
                <img
                  className="brand-logo"
                  alt="Logo"
                  src={logoUrl}
                  onError={(event) => {
                    ;(event.currentTarget as HTMLImageElement).src = iconUrl
                  }}
                />
                <h2 className="title">Gerenciamento de Pacientes</h2>
              </div>
              <button className="toggle" type="button" title="Minimizar painel" onClick={onCollapse}>
                Minimizar
              </button>
            </div>
            <div className="content">
              <SidebarApp />
            </div>
          </>
        ) : null}

        <button
          className="expand"
          type="button"
          title="Expandir painel"
          style={{ display: collapsed ? "inline-flex" : "none" }}
          onClick={onExpand}>
          EXPANDIR
        </button>
      </section>

      <div className="resizer" title="Arraste para redimensionar" onMouseDown={onStartResize}></div>
    </>
  )
}
