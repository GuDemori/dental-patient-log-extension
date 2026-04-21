const runtime = globalThis.browser?.runtime ?? chrome.runtime

const SUPABASE_URL = process.env.PLASMO_PUBLIC_SUPABASE_URL?.trim() ?? ""
const SUPABASE_PUBLISHABLE_KEY = process.env.PLASMO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ""

const assertSupabaseConfig = () => {
  if (SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY) return
  throw new Error(
    "missing_supabase_env: configure PLASMO_PUBLIC_SUPABASE_URL e PLASMO_PUBLIC_SUPABASE_PUBLISHABLE_KEY no .env.local"
  )
}

type AuthPayload = {
  email: string
  password: string
}

type RefreshPayload = {
  refreshToken: string
}

type PatientsPayload = {
  accessToken: string
  nameFilter: string
  cpfFilter: string
  page: number
  pageSize: number
}

type ProceduresPayload = {
  accessToken: string
  patientId: string
}

type MessagesFetchPayload = {
  accessToken: string
}

type MessageCreatePayload = {
  accessToken: string
  content: string
}

type MessageUpdatePayload = {
  accessToken: string
  id: string
  content: string
}

type MessageDeletePayload = {
  accessToken: string
  id: string
}

type DispatchPatientInput = {
  id: string
  name: string
  phone: string | null
}

type DispatchCreateRunPayload = {
  accessToken: string
  messageTemplateId: string
  filtersSnapshot: Record<string, unknown>
  patients: DispatchPatientInput[]
}

type DispatchGetPendingBatchPayload = {
  accessToken: string
  runId: string
  limit: number
}

type DispatchMarkItemStatusPayload = {
  accessToken: string
  itemId: string
  status: "pending" | "sending" | "sent" | "error" | "cancelled"
  attempts?: number
  errorCode?: string | null
  errorMessage?: string | null
  sentAt?: string | null
}

type DispatchRunStatusPayload = {
  accessToken: string
  runId: string
}

type DispatchFinishRunPayload = {
  accessToken: string
  runId: string
  status: "completed" | "failed" | "cancelled"
}

const normalizePhone = (value: string | null | undefined) => (value || "").replace(/\D/g, "")

const isValidPhone = (value: string | null | undefined) => {
  const normalized = normalizePhone(value)
  return normalized.length >= 10 && normalized.length <= 15
}

const buildPatientsUrl = (nameFilter: string, cpfFilter: string, page: number, pageSize: number) => {
  const params = new URLSearchParams()
  params.set("select", "id,name,cpf,phone,city,address,birth_date")
  params.set("order", "name.asc")
  params.set("limit", String(pageSize))
  params.set("offset", String((Math.max(1, page) - 1) * pageSize))

  if (nameFilter.trim()) params.set("name", `ilike.*${nameFilter.trim()}*`)
  if (cpfFilter.trim()) params.set("cpf", `ilike.*${cpfFilter.trim()}*`)

  return `${SUPABASE_URL}/rest/v1/patients?${params.toString()}`
}

const buildProceduresUrl = (patientId: string) => {
  const params = new URLSearchParams()
  params.set("select", "id,patient_id,name,date,total_value")
  params.set("patient_id", `eq.${patientId}`)
  params.set("order", "date.desc")
  params.set("limit", "20")
  return `${SUPABASE_URL}/rest/v1/procedures?${params.toString()}`
}

const buildMessagesUrl = () => {
  const params = new URLSearchParams()
  params.set("select", "id,content,created_at,updated_at")
  params.set("order", "created_at.desc")
  params.set("limit", "100")
  return `${SUPABASE_URL}/rest/v1/message_templates?${params.toString()}`
}

const buildDispatchRunsUrl = () => `${SUPABASE_URL}/rest/v1/message_dispatch_runs`
const buildDispatchItemsUrl = () => `${SUPABASE_URL}/rest/v1/message_dispatch_items`
const DISPATCH_STALE_SENDING_MS = 120_000

const dispatchHeaders = (accessToken: string) => ({
  apikey: SUPABASE_PUBLISHABLE_KEY,
  Authorization: `Bearer ${accessToken}`,
})

const patchDispatchRun = async (
  accessToken: string,
  runId: string,
  payload: Record<string, unknown>
) => {
  const response = await fetch(`${buildDispatchRunsUrl()}?id=eq.${encodeURIComponent(runId)}`, {
    method: "PATCH",
    headers: {
      ...dispatchHeaders(accessToken),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(text || `http_${response.status}`)
  }
  const parsed = text ? JSON.parse(text) : []
  return Array.isArray(parsed) ? parsed[0] : parsed
}

const getRunItemsStatusSummary = async (accessToken: string, runId: string) => {
  const response = await fetch(`${buildDispatchItemsUrl()}?run_id=eq.${encodeURIComponent(runId)}&select=status`, {
    headers: dispatchHeaders(accessToken),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(text || `http_${response.status}`)
  }
  const statuses = JSON.parse(text) as Array<{ status: string }>
  return {
    total: statuses.length,
    pending: statuses.filter((item) => item.status === "pending").length,
    sending: statuses.filter((item) => item.status === "sending").length,
    sent: statuses.filter((item) => item.status === "sent").length,
    error: statuses.filter((item) => item.status === "error").length,
    cancelled: statuses.filter((item) => item.status === "cancelled").length,
  }
}

const markStaleSendingItemsAsError = async (accessToken: string, runId: string) => {
  const staleBefore = new Date(Date.now() - DISPATCH_STALE_SENDING_MS).toISOString()
  const response = await fetch(
    `${buildDispatchItemsUrl()}?run_id=eq.${encodeURIComponent(
      runId
    )}&status=eq.sending&updated_at=lt.${encodeURIComponent(staleBefore)}&select=id,attempts`,
    {
      headers: dispatchHeaders(accessToken),
    }
  )
  const text = await response.text()
  if (!response.ok) {
    throw new Error(text || `http_${response.status}`)
  }
  const staleItems = JSON.parse(text) as Array<{ id: string; attempts: number }>
  if (!staleItems.length) return 0

  for (const staleItem of staleItems) {
    const patchResponse = await fetch(`${buildDispatchItemsUrl()}?id=eq.${encodeURIComponent(staleItem.id)}`, {
      method: "PATCH",
      headers: {
        ...dispatchHeaders(accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: "error",
        attempts: Math.max(Number(staleItem.attempts || 0), 1),
        error_code: "send-timeout",
        error_message: "Envio travado por timeout. Item finalizado como erro.",
        sent_at: null,
      }),
    })
    if (!patchResponse.ok) {
      const patchText = await patchResponse.text()
      throw new Error(patchText || `http_${patchResponse.status}`)
    }
  }

  return staleItems.length
}

const recoverRunStateIfNeeded = async (accessToken: string, runId: string) => {
  await markStaleSendingItemsAsError(accessToken, runId)
  let summary = await getRunItemsStatusSummary(accessToken, runId)
  if (summary.pending > 0 && summary.sending === 0) {
    const latestActivityResponse = await fetch(
      `${buildDispatchItemsUrl()}?run_id=eq.${encodeURIComponent(runId)}&select=updated_at&order=updated_at.desc&limit=1`,
      {
        headers: dispatchHeaders(accessToken),
      }
    )
    const latestActivityText = await latestActivityResponse.text()
    if (!latestActivityResponse.ok) {
      throw new Error(latestActivityText || `http_${latestActivityResponse.status}`)
    }
    const latestActivityRows = JSON.parse(latestActivityText) as Array<{ updated_at: string }>
    const latestActivityAt = latestActivityRows[0]?.updated_at
    const latestActivityMs = latestActivityAt ? new Date(latestActivityAt).getTime() : 0
    const idleForMs = latestActivityMs ? Date.now() - latestActivityMs : Number.MAX_SAFE_INTEGER

    if (idleForMs >= DISPATCH_STALE_SENDING_MS) {
      const cancelPendingResponse = await fetch(
        `${buildDispatchItemsUrl()}?run_id=eq.${encodeURIComponent(runId)}&status=eq.pending`,
        {
          method: "PATCH",
          headers: {
            ...dispatchHeaders(accessToken),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: "cancelled",
            error_code: "orchestrator-stopped",
            error_message: "Execução interrompida. Itens pendentes foram cancelados.",
          }),
        }
      )
      if (!cancelPendingResponse.ok) {
        const cancelPendingText = await cancelPendingResponse.text()
        throw new Error(cancelPendingText || `http_${cancelPendingResponse.status}`)
      }
      await patchDispatchRun(accessToken, runId, {
        status: "failed",
        finished_at: new Date().toISOString(),
      })
      summary = await getRunItemsStatusSummary(accessToken, runId)
      return { ...summary, completedNow: false, recoveredFromStaleOrchestrator: true }
    }
  }

  if (summary.pending === 0 && summary.sending === 0) {
    await patchDispatchRun(accessToken, runId, {
      status: "completed",
      finished_at: new Date().toISOString(),
    })
    return { ...summary, completedNow: true }
  }
  return { ...summary, completedNow: false }
}

runtime.onInstalled.addListener(() => {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    console.warn("Dental Patient Log Extension instalada sem configuração de Supabase (.env.local).")
    return
  }
  console.log("Dental Patient Log Extension instalada.")
})

runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const run = async () => {
    assertSupabaseConfig()

    if (message?.type === "AUTH_SIGN_IN") {
      const { email, password } = message.payload as AuthPayload
      const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      })

      const text = await response.text()
      if (!response.ok) {
        return sendResponse({ ok: false, error: text || `http_${response.status}` })
      }

      return sendResponse({ ok: true, data: JSON.parse(text) })
    }

    if (message?.type === "AUTH_REFRESH") {
      const { refreshToken } = message.payload as RefreshPayload
      const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })

      const text = await response.text()
      if (!response.ok) {
        return sendResponse({ ok: false, error: text || `http_${response.status}` })
      }

      return sendResponse({ ok: true, data: JSON.parse(text) })
    }

    if (message?.type === "PATIENTS_FETCH") {
      const { accessToken, nameFilter, cpfFilter, page, pageSize } = message.payload as PatientsPayload
      const safePageSize = Math.min(Math.max(pageSize || 15, 1), 50)
      const url = buildPatientsUrl(nameFilter, cpfFilter, page || 1, safePageSize)
      const response = await fetch(url, {
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
          Prefer: "count=exact",
        },
      })

      const text = await response.text()
      if (!response.ok) {
        return sendResponse({ ok: false, status: response.status, error: text || `http_${response.status}` })
      }

      const contentRange = response.headers.get("content-range") || ""
      const totalRaw = contentRange.split("/")[1]
      const total = Number.parseInt(totalRaw || "0", 10)

      return sendResponse({
        ok: true,
        data: {
          items: JSON.parse(text),
          total: Number.isFinite(total) ? total : 0,
        },
      })
    }

    if (message?.type === "PATIENT_PROCEDURES_FETCH") {
      const { accessToken, patientId } = message.payload as ProceduresPayload
      const url = buildProceduresUrl(patientId)
      const response = await fetch(url, {
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
      })

      const text = await response.text()
      if (!response.ok) {
        return sendResponse({ ok: false, status: response.status, error: text || `http_${response.status}` })
      }

      return sendResponse({ ok: true, data: JSON.parse(text) })
    }

    if (message?.type === "MESSAGES_FETCH") {
      const { accessToken } = message.payload as MessagesFetchPayload
      const response = await fetch(buildMessagesUrl(), {
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
      })

      const text = await response.text()
      if (!response.ok) {
        return sendResponse({ ok: false, status: response.status, error: text || `http_${response.status}` })
      }

      return sendResponse({ ok: true, data: JSON.parse(text) })
    }

    if (message?.type === "MESSAGE_CREATE") {
      const { accessToken, content } = message.payload as MessageCreatePayload
      const response = await fetch(`${SUPABASE_URL}/rest/v1/message_templates`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify([{ content: content.trim() }]),
      })

      const text = await response.text()
      if (!response.ok) {
        return sendResponse({ ok: false, status: response.status, error: text || `http_${response.status}` })
      }

      const parsed = JSON.parse(text)
      return sendResponse({ ok: true, data: Array.isArray(parsed) ? parsed[0] : parsed })
    }

    if (message?.type === "MESSAGE_UPDATE") {
      const { accessToken, id, content } = message.payload as MessageUpdatePayload
      const response = await fetch(`${SUPABASE_URL}/rest/v1/message_templates?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({ content: content.trim() }),
      })

      const text = await response.text()
      if (!response.ok) {
        return sendResponse({ ok: false, status: response.status, error: text || `http_${response.status}` })
      }

      const parsed = JSON.parse(text)
      return sendResponse({ ok: true, data: Array.isArray(parsed) ? parsed[0] : parsed })
    }

    if (message?.type === "MESSAGE_DELETE") {
      const { accessToken, id } = message.payload as MessageDeletePayload
      const response = await fetch(`${SUPABASE_URL}/rest/v1/message_templates?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
      })

      const text = await response.text()
      if (!response.ok) {
        return sendResponse({ ok: false, status: response.status, error: text || `http_${response.status}` })
      }

      return sendResponse({ ok: true, data: { id } })
    }

    if (message?.type === "DISPATCH_CREATE_RUN") {
      const { accessToken, messageTemplateId, filtersSnapshot, patients } = message.payload as DispatchCreateRunPayload

      const runningRunsBeforeResponse = await fetch(
        `${buildDispatchRunsUrl()}?select=id,status,message_template_id,started_at,finished_at,created_at&status=eq.running&order=created_at.desc&limit=1`,
        {
          headers: dispatchHeaders(accessToken),
        }
      )
      const runningRunsBeforeText = await runningRunsBeforeResponse.text()
      if (!runningRunsBeforeResponse.ok) {
        return sendResponse({
          ok: false,
          status: runningRunsBeforeResponse.status,
          error: runningRunsBeforeText || `http_${runningRunsBeforeResponse.status}`,
        })
      }
      const runningRunsBefore = JSON.parse(runningRunsBeforeText) as Array<{ id: string }>
      for (const run of runningRunsBefore) {
        await recoverRunStateIfNeeded(accessToken, run.id)
      }

      const activeRunResponse = await fetch(
        `${buildDispatchRunsUrl()}?select=id,status,message_template_id,started_at,finished_at,created_at&status=eq.running&order=created_at.desc&limit=1`,
        {
          headers: dispatchHeaders(accessToken),
        }
      )
      const activeRunText = await activeRunResponse.text()
      if (!activeRunResponse.ok) {
        return sendResponse({ ok: false, status: activeRunResponse.status, error: activeRunText || `http_${activeRunResponse.status}` })
      }
      const activeRuns = JSON.parse(activeRunText) as Array<{ id: string }>
      if (activeRuns.length > 0) {
        return sendResponse({ ok: false, status: 409, error: "dispatch_already_running" })
      }

      const templateResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/message_templates?id=eq.${encodeURIComponent(
          messageTemplateId
        )}&select=id,content&limit=1`,
        {
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )
      const templateText = await templateResponse.text()
      if (!templateResponse.ok) {
        return sendResponse({ ok: false, status: templateResponse.status, error: templateText || `http_${templateResponse.status}` })
      }
      const templates = JSON.parse(templateText) as Array<{ id: string; content: string }>
      const template = templates[0]
      if (!template) {
        return sendResponse({ ok: false, status: 404, error: "message_template_not_found" })
      }

      const runResponse = await fetch(buildDispatchRunsUrl(), {
        method: "POST",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify([
          {
            message_template_id: messageTemplateId,
            status: "running",
            filters_snapshot: filtersSnapshot ?? {},
          },
        ]),
      })
      const runText = await runResponse.text()
      if (!runResponse.ok) {
        return sendResponse({ ok: false, status: runResponse.status, error: runText || `http_${runResponse.status}` })
      }
      const createdRun = (JSON.parse(runText) as Array<Record<string, unknown>>)[0]
      const runId = String(createdRun.id)

      const itemsPayload = (patients || []).map((patient) => {
        const normalizedPhone = normalizePhone(patient.phone)
        if (!normalizedPhone) {
          return {
            run_id: runId,
            patient_id: patient.id,
            phone: null,
            rendered_text: template.content,
            status: "error",
            attempts: 0,
            error_code: "no_phone",
            error_message: "Paciente sem telefone cadastrado.",
          }
        }
        if (!isValidPhone(normalizedPhone)) {
          return {
            run_id: runId,
            patient_id: patient.id,
            phone: normalizedPhone,
            rendered_text: template.content,
            status: "error",
            attempts: 0,
            error_code: "invalid_phone",
            error_message: "Telefone inválido para envio.",
          }
        }
        return {
          run_id: runId,
          patient_id: patient.id,
          phone: normalizedPhone,
          rendered_text: template.content,
          status: "pending",
          attempts: 0,
        }
      })

      if (itemsPayload.length > 0) {
        const itemsResponse = await fetch(buildDispatchItemsUrl(), {
          method: "POST",
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify(itemsPayload),
        })
        const itemsText = await itemsResponse.text()
        if (!itemsResponse.ok) {
          return sendResponse({ ok: false, status: itemsResponse.status, error: itemsText || `http_${itemsResponse.status}` })
        }
      }

      const pending = itemsPayload.filter((item) => item.status === "pending").length
      const error = itemsPayload.filter((item) => item.status === "error").length
      const progress = {
        run: createdRun,
        total: itemsPayload.length,
        pending,
        sending: 0,
        sent: 0,
        error,
        cancelled: 0,
      }

      return sendResponse({
        ok: true,
        data: {
          run: createdRun,
          progress,
        },
      })
    }

    if (message?.type === "DISPATCH_GET_PENDING_BATCH") {
      const { accessToken, runId, limit } = message.payload as DispatchGetPendingBatchPayload
      const safeLimit = Math.min(Math.max(limit || 20, 1), 100)

      const runResponse = await fetch(`${buildDispatchRunsUrl()}?id=eq.${encodeURIComponent(runId)}&select=id,status&limit=1`, {
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
      })
      const runText = await runResponse.text()
      if (!runResponse.ok) {
        return sendResponse({ ok: false, status: runResponse.status, error: runText || `http_${runResponse.status}` })
      }
      const runs = JSON.parse(runText) as Array<{ id: string; status: string }>
      if (!runs[0]) {
        return sendResponse({ ok: false, status: 404, error: "dispatch_run_not_found" })
      }
      if (runs[0].status !== "running") {
        return sendResponse({ ok: true, data: [] })
      }
      await recoverRunStateIfNeeded(accessToken, runId)
      const refreshedRunResponse = await fetch(`${buildDispatchRunsUrl()}?id=eq.${encodeURIComponent(runId)}&select=id,status&limit=1`, {
        headers: dispatchHeaders(accessToken),
      })
      const refreshedRunText = await refreshedRunResponse.text()
      if (!refreshedRunResponse.ok) {
        return sendResponse({
          ok: false,
          status: refreshedRunResponse.status,
          error: refreshedRunText || `http_${refreshedRunResponse.status}`,
        })
      }
      const refreshedRun = (JSON.parse(refreshedRunText) as Array<{ id: string; status: string }>)[0]
      if (!refreshedRun || refreshedRun.status !== "running") {
        return sendResponse({ ok: true, data: [] })
      }

      const response = await fetch(
        `${buildDispatchItemsUrl()}?run_id=eq.${encodeURIComponent(
          runId
        )}&status=eq.pending&select=id,run_id,patient_id,phone,rendered_text,status,attempts,error_code,error_message,sent_at,created_at,updated_at&order=created_at.asc&limit=${safeLimit}`,
        {
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )
      const text = await response.text()
      if (!response.ok) {
        return sendResponse({ ok: false, status: response.status, error: text || `http_${response.status}` })
      }
      return sendResponse({ ok: true, data: JSON.parse(text) })
    }

    if (message?.type === "DISPATCH_MARK_ITEM_STATUS") {
      const { accessToken, itemId, status, attempts, errorCode, errorMessage, sentAt } =
        message.payload as DispatchMarkItemStatusPayload
      const response = await fetch(`${buildDispatchItemsUrl()}?id=eq.${encodeURIComponent(itemId)}`, {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          status,
          attempts: attempts ?? undefined,
          error_code: errorCode ?? null,
          error_message: errorMessage ?? null,
          sent_at: sentAt ?? null,
        }),
      })
      const text = await response.text()
      if (!response.ok) {
        return sendResponse({ ok: false, status: response.status, error: text || `http_${response.status}` })
      }
      const parsed = JSON.parse(text)
      return sendResponse({ ok: true, data: Array.isArray(parsed) ? parsed[0] : parsed })
    }

    if (message?.type === "DISPATCH_PAUSE_RUN") {
      const { accessToken, runId } = message.payload as DispatchRunStatusPayload
      const response = await fetch(`${buildDispatchRunsUrl()}?id=eq.${encodeURIComponent(runId)}`, {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({ status: "paused" }),
      })
      const text = await response.text()
      if (!response.ok) {
        return sendResponse({ ok: false, status: response.status, error: text || `http_${response.status}` })
      }
      const parsed = JSON.parse(text)
      return sendResponse({ ok: true, data: Array.isArray(parsed) ? parsed[0] : parsed })
    }

    if (message?.type === "DISPATCH_RESUME_RUN") {
      const { accessToken, runId } = message.payload as DispatchRunStatusPayload
      const response = await fetch(`${buildDispatchRunsUrl()}?id=eq.${encodeURIComponent(runId)}`, {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({ status: "running" }),
      })
      const text = await response.text()
      if (!response.ok) {
        return sendResponse({ ok: false, status: response.status, error: text || `http_${response.status}` })
      }
      const parsed = JSON.parse(text)
      return sendResponse({ ok: true, data: Array.isArray(parsed) ? parsed[0] : parsed })
    }

    if (message?.type === "DISPATCH_FINISH_RUN") {
      const { accessToken, runId, status } = message.payload as DispatchFinishRunPayload
      const response = await fetch(`${buildDispatchRunsUrl()}?id=eq.${encodeURIComponent(runId)}`, {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({ status, finished_at: new Date().toISOString() }),
      })
      const text = await response.text()
      if (!response.ok) {
        return sendResponse({ ok: false, status: response.status, error: text || `http_${response.status}` })
      }
      const parsed = JSON.parse(text)
      return sendResponse({ ok: true, data: Array.isArray(parsed) ? parsed[0] : parsed })
    }

    if (message?.type === "DISPATCH_GET_RUN_PROGRESS") {
      const { accessToken, runId } = message.payload as DispatchRunStatusPayload
      await recoverRunStateIfNeeded(accessToken, runId)
      const runResponse = await fetch(
        `${buildDispatchRunsUrl()}?id=eq.${encodeURIComponent(
          runId
        )}&select=id,status,message_template_id,started_at,finished_at,created_at&limit=1`,
        {
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )
      const runText = await runResponse.text()
      if (!runResponse.ok) {
        return sendResponse({ ok: false, status: runResponse.status, error: runText || `http_${runResponse.status}` })
      }
      const runs = JSON.parse(runText) as Array<Record<string, unknown>>
      const run = runs[0]
      if (!run) {
        return sendResponse({ ok: false, status: 404, error: "dispatch_run_not_found" })
      }

      const itemsResponse = await fetch(
        `${buildDispatchItemsUrl()}?run_id=eq.${encodeURIComponent(runId)}&select=status`,
        {
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )
      const itemsText = await itemsResponse.text()
      if (!itemsResponse.ok) {
        return sendResponse({ ok: false, status: itemsResponse.status, error: itemsText || `http_${itemsResponse.status}` })
      }
      const statuses = JSON.parse(itemsText) as Array<{ status: string }>
      const progress = {
        run,
        total: statuses.length,
        pending: statuses.filter((item) => item.status === "pending").length,
        sending: statuses.filter((item) => item.status === "sending").length,
        sent: statuses.filter((item) => item.status === "sent").length,
        error: statuses.filter((item) => item.status === "error").length,
        cancelled: statuses.filter((item) => item.status === "cancelled").length,
      }
      return sendResponse({ ok: true, data: progress })
    }

    return sendResponse({ ok: false, error: "unknown_message_type" })
  }

  run().catch((error) => {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : "unexpected_error",
    })
  })

  return true
})
