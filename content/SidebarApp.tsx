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
import { FiltersDropdown, type FiltersValue } from "./components/FiltersDropdown"
import { LoginForm } from "./components/LoginForm"
import { MessagesScreen } from "./components/MessagesScreen"
import { PatientList } from "./components/PatientList"
import type { DispatchItem, DispatchRunProgress, MessageTemplate, SidebarPatient, SidebarProcedure } from "./types"
import { backoffDelayMs, randomDelayMs, sendWhatsAppMessage, validatePhoneForSend, waitMs } from "./whatsappDispatch"

type ProcedureStateMap = Record<string, { status: "loading" | "loaded" | "error"; data: SidebarProcedure[] }>

type SidebarAppProps = {
  initialMessage?: string
}

const DISPATCH_SEND_TIMEOUT_MS = 60_000
const DISPATCH_STATUS_TIMEOUT_MS = 20_000
const DISPATCH_LOG_PREFIX = "[dpl][dispatch]"

const maskPhoneLog = (value: string | null | undefined) => {
  const digits = (value || "").replace(/\D/g, "")
  if (!digits) return "n/a"
  if (digits.length <= 4) return `***${digits}`
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`
}

const dispatchLog = (level: "info" | "warn" | "error", event: string, data?: Record<string, unknown>) => {
  const payload = data ? { ...data, ts: new Date().toISOString() } : { ts: new Date().toISOString() }
  if (level === "error") {
    console.error(`${DISPATCH_LOG_PREFIX} ${event}`, payload)
    return
  }
  if (level === "warn") {
    console.warn(`${DISPATCH_LOG_PREFIX} ${event}`, payload)
    return
  }
  console.info(`${DISPATCH_LOG_PREFIX} ${event}`, payload)
}

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
  const emptyFilters: FiltersValue = {
    name: "",
    document: "",
    dynamicMode: "none",
    absenceYears: "1",
    absenceMonths: "0",
    nextConsultWeeks: "4",
  }

  const [draftFilters, setDraftFilters] = useState<FiltersValue>(emptyFilters)
  const [appliedFilters, setAppliedFilters] = useState<FiltersValue>(emptyFilters)
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
      fetchPatients(appliedFilters, page)
        .then((result) => {
          const total = result.total || 0
          const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
          if (page > totalPages) {
            setPage(totalPages)
            return
          }

          setPatients(result.items || [])
          setTotalPatients(total)
          setStatusMessage(result.items?.length ? "" : "Nenhum paciente encontrado para os filtros aplicados.")
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
  }, [
    authenticated,
    screen,
    appliedFilters.name,
    appliedFilters.document,
    appliedFilters.dynamicMode,
    appliedFilters.absenceYears,
    appliedFilters.absenceMonths,
    appliedFilters.nextConsultWeeks,
    page,
    refreshNonce,
  ])

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
    dispatchLog("info", "item:start", {
      itemId: item.id,
      patientId: item.patient_id,
      currentStatus: item.status,
      currentAttempts: attempts,
      phone: maskPhoneLog(item.phone),
    })

    for (let attempt = attempts + 1; attempt <= 3; attempt += 1) {
      lastAttempt = attempt
      dispatchLog("info", "item:attempt-start", {
        itemId: item.id,
        attempt,
        maxAttempts: 3,
      })
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
        dispatchLog("info", "item:send-call", {
          itemId: item.id,
          attempt,
        })
        sendResult = await withTimeout(
          sendWhatsAppMessage(item.phone || "", item.rendered_text),
          DISPATCH_SEND_TIMEOUT_MS,
          "Timeout ao enviar mensagem no WhatsApp Web."
        )
      } catch (error) {
        dispatchLog("warn", "item:send-timeout-catch", {
          itemId: item.id,
          attempt,
          reason: (error as Error).message || "timeout",
        })
        sendResult = {
          ok: false,
          code: "timeout",
          reason: (error as Error).message || "Timeout ao enviar mensagem.",
        }
      }

      if (sendResult.ok === true) {
        dispatchLog("info", "item:send-success", {
          itemId: item.id,
          attempt,
        })
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
      dispatchLog("warn", "item:send-failed", {
        itemId: item.id,
        attempt,
        code: failedResult.code,
        reason: failedResult.reason,
      })

      if (failedResult.code === "invalid-number" || failedResult.code === "chat-mismatch") {
        dispatchLog("warn", "item:non-retriable-error", {
          itemId: item.id,
          attempt,
          code: failedResult.code,
        })
        break
      }
      if (attempt < 3) {
        const delayMs = backoffDelayMs(attempt)
        dispatchLog("info", "item:retry-backoff", {
          itemId: item.id,
          attempt,
          delayMs,
        })
        await waitMs(delayMs)
      }
    }

    dispatchLog("warn", "item:final-error-status", {
      itemId: item.id,
      attempts: lastAttempt,
      errorCode: lastErrorCode || "send-failed",
      errorMessage: lastErrorMessage || "Falha ao enviar mensagem.",
    })
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
    dispatchLog("info", "run:start", { runId })

    try {
      while (!pauseRequestedRef.current) {
        const batch = await getDispatchPendingBatch(runId, 20)
        dispatchLog("info", "run:batch-fetched", {
          runId,
          batchSize: batch.length,
        })
        if (batch.length === 0) break

        for (let index = 0; index < batch.length; index += 1) {
          const item = batch[index]
          if (pauseRequestedRef.current) break
          await processDispatchItem(item)
          if (pauseRequestedRef.current) break
          const hasNextItemInBatch = index < batch.length - 1
          if (hasNextItemInBatch) {
            const delayMs = randomDelayMs(30_000, 50_000)
            dispatchLog("info", "run:item-delay", {
              runId,
              itemId: item.id,
              delayMs,
            })
            await waitMs(delayMs)
          }
        }
      }

      if (pauseRequestedRef.current) {
        dispatchLog("warn", "run:pause-requested", { runId })
        await pauseDispatchRun(runId)
      } else {
        dispatchLog("info", "run:finish-completed", { runId })
        await finishDispatchRun(runId, "completed")
      }
      const refreshed = await getDispatchRunProgress(runId)
      dispatchLog("info", "run:progress-refreshed", {
        runId,
        total: refreshed.total,
        pending: refreshed.pending,
        sending: refreshed.sending,
        sent: refreshed.sent,
        error: refreshed.error,
        cancelled: refreshed.cancelled,
      })
      setDispatchProgress(refreshed)
    } catch (error) {
      dispatchLog("error", "run:failed", {
        runId,
        reason: (error as Error).message || "Falha inesperada no disparo.",
      })
      await finishDispatchRun(runId, "failed")
      setDispatchError((error as Error).message || "Falha inesperada no disparo.")
      const refreshed = await getDispatchRunProgress(runId).catch(() => null)
      if (refreshed) setDispatchProgress(refreshed)
    } finally {
      dispatchLog("info", "run:finalize", { runId })
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
      dispatchLog("info", "run:create-request", {
        templateId: selectedTemplate.id,
        currentPage: page,
        totalPatientsInView: patients.length,
      })
      const result = await createDispatchRun(
        selectedTemplate.id,
        {
          filters: appliedFilters,
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

      dispatchLog("info", "run:create-success", {
        runId: result.run.id,
        total: result.progress.total,
      })
      setDispatchProgress(result.progress)
      await runDispatchLoop(result.run.id)
    } catch (error) {
      const reason = (error as Error).message
      dispatchLog("error", "run:create-failed", { reason })
      if (reason.includes("dispatch_already_running")) {
        setDispatchError("Já existe um disparo em execução.")
        return
      }
      setDispatchError(reason || "Não foi possível iniciar o disparo.")
    }
  }

  const handlePauseDispatch = async () => {
    dispatchLog("warn", "run:pause-clicked")
    pauseRequestedRef.current = true
  }

  const handleApplyFilters = () => {
    setPage(1)
    setAppliedFilters({ ...draftFilters })
    setRefreshNonce((prev) => prev + 1)
  }

  const handleClearFilters = () => {
    setDraftFilters({ ...emptyFilters })
    setAppliedFilters({ ...emptyFilters })
    setPage(1)
    setRefreshNonce((prev) => prev + 1)
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
            value={draftFilters}
            isOpen={filtersOpen}
            onToggle={() => setFiltersOpen((prev) => !prev)}
            onChange={setDraftFilters}
            onApply={handleApplyFilters}
            onClear={handleClearFilters}
            disabled={loadingPatients}
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
