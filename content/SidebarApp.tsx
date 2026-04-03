import { useEffect, useState } from "react"

import { clearSession, createMessage, deleteMessage, fetchMessages, fetchPatients, fetchProcedures, getAccessToken, signIn, updateMessage } from "./api"
import { PAGE_SIZE } from "./constants"
import { FiltersDropdown } from "./components/FiltersDropdown"
import { LoginForm } from "./components/LoginForm"
import { MessagesScreen } from "./components/MessagesScreen"
import { PatientList } from "./components/PatientList"
import type { MessageTemplate, SidebarPatient, SidebarProcedure } from "./types"

type FiltersValue = {
  name: string
  document: string
  absenceYears: string
  absenceMonths: string
}

type ProcedureStateMap = Record<string, { status: "loading" | "loaded" | "error"; data: SidebarProcedure[] }>

type SidebarAppProps = {
  initialMessage?: string
}

export const SidebarApp = ({ initialMessage }: SidebarAppProps) => {
  const [screen, setScreen] = useState<"patients" | "messages">("patients")
  const [authenticated, setAuthenticated] = useState(Boolean(getAccessToken()))
  const [statusMessage, setStatusMessage] = useState(initialMessage || "")
  const [loadingPatients, setLoadingPatients] = useState(false)
  const [patients, setPatients] = useState<SidebarPatient[]>([])
  const [totalPatients, setTotalPatients] = useState(0)
  const [page, setPage] = useState(1)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState<FiltersValue>({
    name: "",
    document: "",
    absenceYears: "",
    absenceMonths: "",
  })
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [proceduresMap, setProceduresMap] = useState<ProcedureStateMap>({})
  const [messages, setMessages] = useState<MessageTemplate[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [messagesStatus, setMessagesStatus] = useState("")
  const [refreshNonce, setRefreshNonce] = useState(0)

  useEffect(() => {
    if (!authenticated || screen !== "patients") return
    const timer = window.setTimeout(() => {
      setLoadingPatients(true)
      fetchPatients(filters.name, filters.document, page)
        .then((result) => {
          const total = result.total || 0
          const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
          if (page > totalPages) {
            setPage(totalPages)
            return
          }

          setPatients(result.items || [])
          setTotalPatients(total)
          setStatusMessage(result.items?.length ? "" : "Nenhum paciente encontrado.")
          setExpandedIds((prev) => {
            const next = new Set<string>()
            const ids = new Set((result.items || []).map((item) => item.id))
            for (const id of prev) {
              if (ids.has(id)) next.add(id)
            }
            return next
          })
        })
        .catch((error) => {
          const reason = (error as Error).message
          if (reason === "unauthorized" || reason === "not_authenticated") {
            clearSession()
            setAuthenticated(false)
            setStatusMessage("Sessão expirada. Faça login novamente.")
            return
          }
          setPatients([])
          setTotalPatients(0)
          setStatusMessage("Erro ao consultar API de pacientes. Verifique URL/chave do Supabase.")
        })
        .finally(() => {
          setLoadingPatients(false)
        })
    }, 350)

    return () => window.clearTimeout(timer)
  }, [authenticated, screen, filters.name, filters.document, filters.absenceMonths, filters.absenceYears, page, refreshNonce])

  useEffect(() => {
    if (!authenticated || screen !== "messages") return
    setLoadingMessages(true)
    setMessagesStatus("")

    fetchMessages()
      .then((result) => {
        setMessages(result || [])
        setMessagesStatus("")
      })
      .catch((error) => {
        const reason = (error as Error).message
        if (reason === "unauthorized" || reason === "not_authenticated") {
          clearSession()
          setAuthenticated(false)
          setStatusMessage("Sessão expirada. Faça login novamente.")
          return
        }
        setMessages([])
        setMessagesStatus("Erro ao carregar mensagens.")
      })
      .finally(() => {
        setLoadingMessages(false)
      })
  }, [authenticated, screen])

  const handleLogin = async (email: string, password: string) => {
    await signIn(email, password)
    setAuthenticated(true)
    setStatusMessage("Login efetuado com sucesso.")
    setRefreshNonce((prev) => prev + 1)
  }

  const handleLogout = () => {
    clearSession()
    setAuthenticated(false)
    setPatients([])
    setTotalPatients(0)
    setExpandedIds(new Set())
    setProceduresMap({})
    setMessages([])
    setMessagesStatus("")
    setStatusMessage("Você saiu da sessão.")
  }

  const handleToggleExpand = (patientId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(patientId)) {
        next.delete(patientId)
        return next
      }
      next.add(patientId)
      return next
    })

    if (proceduresMap[patientId]?.status === "loading" || proceduresMap[patientId]?.status === "loaded") return

    setProceduresMap((prev) => ({
      ...prev,
      [patientId]: { status: "loading", data: [] },
    }))

    fetchProcedures(patientId)
      .then((procedures) => {
        setProceduresMap((prev) => ({
          ...prev,
          [patientId]: { status: "loaded", data: procedures },
        }))
      })
      .catch(() => {
        setProceduresMap((prev) => ({
          ...prev,
          [patientId]: { status: "error", data: [] },
        }))
      })
  }

  const handleCreateMessage = async (content: string) => {
    const created = await createMessage(content)
    setMessages((prev) => [created, ...prev])
  }

  const handleUpdateMessage = async (id: string, content: string) => {
    const updated = await updateMessage(id, content)
    setMessages((prev) => prev.map((message) => (message.id === id ? updated : message)))
  }

  const handleDeleteMessage = async (id: string) => {
    await deleteMessage(id)
    setMessages((prev) => prev.filter((message) => message.id !== id))
  }

  if (!authenticated) {
    return <LoginForm errorMessage={statusMessage} onSubmit={handleLogin} />
  }

  return (
    <>
      <div className="auth-row">
        <h2 className="page-title">Pacientes</h2>
        <button id="dpl-logout" className="btn secondary" type="button" onClick={handleLogout}>
          Sair
        </button>
      </div>
      <div className="screen-tabs">
        <button
          type="button"
          className={`screen-tab${screen === "patients" ? " active" : ""}`}
          onClick={() => setScreen("patients")}>
          Pacientes
        </button>
        <button
          type="button"
          className={`screen-tab${screen === "messages" ? " active" : ""}`}
          onClick={() => setScreen("messages")}>
          Mensagens
        </button>
      </div>

      {screen === "patients" ? (
        <>
          <FiltersDropdown
            value={filters}
            isOpen={filtersOpen}
            onToggle={() => setFiltersOpen((prev) => !prev)}
            onChange={(next) => {
              setFilters(next)
              setPage(1)
            }}
          />

          <div id="dpl-state" className="state" style={{ display: statusMessage || loadingPatients ? "block" : "none" }}>
            {loadingPatients ? "Carregando pacientes..." : statusMessage}
          </div>

          <PatientList
            patients={patients}
            totalPatients={totalPatients}
            currentPage={page}
            expandedIds={expandedIds}
            proceduresMap={proceduresMap}
            onToggleExpand={handleToggleExpand}
            onPrevPage={() => setPage((prev) => Math.max(1, prev - 1))}
            onNextPage={() => setPage((prev) => prev + 1)}
          />
        </>
      ) : (
        <MessagesScreen
          messages={messages}
          loading={loadingMessages}
          statusMessage={messagesStatus}
          onAddMessage={handleCreateMessage}
          onUpdateMessage={handleUpdateMessage}
          onDeleteMessage={handleDeleteMessage}
        />
      )}
    </>
  )
}
