import { useEffect, useRef, useState } from "react"

import {
  clearSession,
  createDispatchRun,
  createMessage,
  deleteMessage,
  fetchMessages,
  fetchPatients,
  fetchProcedures,
  finishDispatchRun,
  getAccessToken,
  getDispatchPendingBatch,
  getDispatchRunProgress,
  markDispatchItemStatus,
  pauseDispatchRun,
  signIn,
  updateMessage,
} from "./api"
import { PAGE_SIZE } from "./constants"
import { FiltersDropdown } from "./components/FiltersDropdown"
import { LoginForm } from "./components/LoginForm"
import { MessagesScreen } from "./components/MessagesScreen"
import { PatientList } from "./components/PatientList"
import type { DispatchItem, DispatchRunProgress, MessageTemplate, SidebarPatient, SidebarProcedure } from "./types"
import { backoffDelayMs, randomDelayMs, sendWhatsAppMessage, validatePhoneForSend, waitMs } from "./whatsappDispatch"

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

const DISPATCH_SEND_TIMEOUT_MS = 60_000
const DISPATCH_STATUS_TIMEOUT_MS = 20_000

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> => {
  let timer = 0
  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
      }),
    ])
  } finally {
    if (timer) window.clearTimeout(timer)
  }
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
  const [dispatchTemplateId, setDispatchTemplateId] = useState("")
  const [dispatchProgress, setDispatchProgress] = useState<DispatchRunProgress | null>(null)
  const [dispatchRunning, setDispatchRunning] = useState(false)
  const [dispatchBusy, setDispatchBusy] = useState(false)
  const [dispatchError, setDispatchError] = useState("")
  const pauseRequestedRef = useRef(false)

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

  useEffect(() => {
    if (!messages.length) {
      setDispatchTemplateId("")
      return
    }
    if (!dispatchTemplateId || !messages.some((item) => item.id === dispatchTemplateId)) {
      setDispatchTemplateId(messages[0].id)
    }
  }, [messages, dispatchTemplateId])

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
    setDispatchTemplateId("")
    setDispatchProgress(null)
    setDispatchRunning(false)
    setDispatchBusy(false)
    setDispatchError("")
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

  const updateProgressFromItem = (status: DispatchItem["status"], previousStatus: DispatchItem["status"]) => {
    setDispatchProgress((prev) => {
      if (!prev) return prev
      const next = { ...prev }
      const dec = (field: "pending" | "sending" | "sent" | "error" | "cancelled") => {
        next[field] = Math.max(0, next[field] - 1)
      }
      const inc = (field: "pending" | "sending" | "sent" | "error" | "cancelled") => {
        next[field] += 1
      }
      dec(previousStatus)
      inc(status)
      return next
    })
  }

  const processDispatchItem = async (item: DispatchItem): Promise<void> => {
    let attempts = item.attempts || 0
    let lastErrorCode: string | null = null
    let lastErrorMessage = ""
    let lastAttempt = attempts

    for (let attempt = attempts + 1; attempt <= 3; attempt += 1) {
      lastAttempt = attempt
      await withTimeout(
        markDispatchItemStatus({
          itemId: item.id,
          status: "sending",
          attempts: attempt,
          errorCode: null,
          errorMessage: null,
          sentAt: null,
        }),
        DISPATCH_STATUS_TIMEOUT_MS,
        "Timeout ao atualizar item para sending."
      )
      updateProgressFromItem("sending", attempt === attempts + 1 ? "pending" : "sending")

      let sendResult:
        | { ok: true }
        | { ok: false; code: "chat-mismatch" | "ui-not-ready" | "invalid-number" | "timeout" | "unknown"; reason: string }
      try {
        sendResult = await withTimeout(
          sendWhatsAppMessage(item.phone || "", item.rendered_text),
          DISPATCH_SEND_TIMEOUT_MS,
          "Timeout ao enviar mensagem no WhatsApp Web."
        )
      } catch (error) {
        sendResult = {
          ok: false,
          code: "timeout",
          reason: (error as Error).message || "Timeout ao enviar mensagem.",
        }
      }

      if (sendResult.ok === true) {
        const sentAt = new Date().toISOString()
        await withTimeout(
          markDispatchItemStatus({
            itemId: item.id,
            status: "sent",
            attempts: attempt,
            errorCode: null,
            errorMessage: null,
            sentAt,
          }),
          DISPATCH_STATUS_TIMEOUT_MS,
          "Timeout ao atualizar item para sent."
        )
        updateProgressFromItem("sent", "sending")
        return
      }

      const failedResult = sendResult as { ok: false; code: string; reason: string }
      lastErrorCode = failedResult.code
      lastErrorMessage = failedResult.reason

      if (failedResult.code === "invalid-number" || failedResult.code === "chat-mismatch") {
        break
      }
      if (attempt < 3) {
        await waitMs(backoffDelayMs(attempt))
      }
    }

    await withTimeout(
      markDispatchItemStatus({
        itemId: item.id,
        status: "error",
        attempts: lastAttempt,
        errorCode: lastErrorCode || "send-failed",
        errorMessage: lastErrorMessage || "Falha ao enviar mensagem.",
        sentAt: null,
      }),
      DISPATCH_STATUS_TIMEOUT_MS,
      "Timeout ao atualizar item para error."
    )
    updateProgressFromItem("error", "sending")
  }

  const runDispatchLoop = async (runId: string) => {
    setDispatchRunning(true)
    setDispatchBusy(true)
    setDispatchError("")
    pauseRequestedRef.current = false

    try {
      while (!pauseRequestedRef.current) {
        const batch = await getDispatchPendingBatch(runId, 20)
        if (batch.length === 0) break

        for (const item of batch) {
          if (pauseRequestedRef.current) break
          await processDispatchItem(item)
          if (pauseRequestedRef.current) break
          await waitMs(randomDelayMs(30_000, 50_000))
        }
      }

      if (pauseRequestedRef.current) {
        await pauseDispatchRun(runId)
      } else {
        await finishDispatchRun(runId, "completed")
      }
      const refreshed = await getDispatchRunProgress(runId)
      setDispatchProgress(refreshed)
    } catch (error) {
      await finishDispatchRun(runId, "failed")
      setDispatchError((error as Error).message || "Falha inesperada no disparo.")
      const refreshed = await getDispatchRunProgress(runId).catch(() => null)
      if (refreshed) setDispatchProgress(refreshed)
    } finally {
      setDispatchRunning(false)
      setDispatchBusy(false)
      pauseRequestedRef.current = false
    }
  }

  const handleStartDispatch = async () => {
    if (dispatchBusy || dispatchRunning) return
    const selectedTemplate = messages.find((message) => message.id === dispatchTemplateId)
    if (!selectedTemplate) {
      setDispatchError("Selecione uma mensagem para disparo.")
      return
    }
    if (!patients.length) {
      setDispatchError("Nenhum paciente disponível no lote atual para disparo.")
      return
    }

    try {
      const result = await createDispatchRun(
        selectedTemplate.id,
        {
          filters,
          page,
          totalPatients,
          source: "current_filtered_batch",
        },
        patients.map((patient) => {
          const phoneValidation = validatePhoneForSend(patient.phone)
          return {
            id: patient.id,
            name: patient.name,
            phone: phoneValidation.ok ? phoneValidation.phone : patient.phone,
          }
        })
      )

      setDispatchProgress(result.progress)
      await runDispatchLoop(result.run.id)
    } catch (error) {
      const reason = (error as Error).message
      if (reason.includes("dispatch_already_running")) {
        setDispatchError("Já existe um disparo em execução.")
        return
      }
      setDispatchError(reason || "Não foi possível iniciar o disparo.")
    }
  }

  const handlePauseDispatch = async () => {
    pauseRequestedRef.current = true
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
          dispatchTemplateId={dispatchTemplateId}
          onDispatchTemplateChange={setDispatchTemplateId}
          onStartDispatch={handleStartDispatch}
          onPauseDispatch={handlePauseDispatch}
          dispatchRunning={dispatchRunning}
          dispatchBusy={dispatchBusy}
          dispatchProgress={dispatchProgress}
          dispatchError={dispatchError}
        />
      )}
    </>
  )
}
