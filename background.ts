const runtime = globalThis.browser?.runtime ?? chrome.runtime

const SUPABASE_URL = "https://tecolrvvuvyrzlqlyxcb.supabase.co"
const SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlY29scnZ2dXZ5cnpscWx5eGNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3MTc2NzUsImV4cCI6MjA3ODI5MzY3NX0.Ts4wadXIha-p9PkbITXZg70F9RqDeBRAr_B89V4Pm2k"

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

const buildPatientsUrl = (nameFilter: string, cpfFilter: string, page: number, pageSize: number) => {
  const params = new URLSearchParams()
  params.set("select", "id,name,cpf,city,address,birth_date")
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

runtime.onInstalled.addListener(() => {
  console.log("Dental Patient Log Extension instalada.")
})

runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const run = async () => {
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
