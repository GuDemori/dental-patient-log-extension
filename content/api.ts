import { ACCESS_TOKEN_KEY, PAGE_SIZE, REFRESH_TOKEN_KEY, USER_EMAIL_KEY } from "./constants"
import type {
  DispatchCreateResult,
  DispatchItem,
  DispatchItemStatus,
  DispatchPatientInput,
  DispatchRunProgress,
  DispatchRunStatus,
  MessageTemplate,
  PatientsPageResult,
  SidebarProcedure,
} from "./types"

const extRuntime: any = globalThis.browser?.runtime ?? chrome.runtime

export const getAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY)
const getRefreshToken = () => localStorage.getItem(REFRESH_TOKEN_KEY)

const saveSession = (accessToken: string, refreshToken: string, email?: string) => {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
  if (email) localStorage.setItem(USER_EMAIL_KEY, email)
}

export const clearSession = () => {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(USER_EMAIL_KEY)
}

const callBackground = <T>(type: string, payload: Record<string, unknown>) =>
  new Promise<T>((resolve, reject) => {
    extRuntime.sendMessage({ type, payload }, (response: { ok: boolean; data?: T; error?: string; status?: number }) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }

      if (!response?.ok) {
        const err = new Error(response?.error || "background_error")
        ;(err as Error & { status?: number }).status = response?.status
        reject(err)
        return
      }

      resolve(response.data as T)
    })
  })

const refreshSession = async () => {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false
  try {
    const payload = await callBackground<{ access_token: string; refresh_token: string; user?: { email?: string } }>(
      "AUTH_REFRESH",
      { refreshToken }
    )
    saveSession(payload.access_token, payload.refresh_token, payload.user?.email)
    return true
  } catch {
    return false
  }
}

export const signIn = async (email: string, password: string) => {
  const payload = await callBackground<{ access_token: string; refresh_token: string; user?: { email?: string } }>(
    "AUTH_SIGN_IN",
    { email, password }
  )
  saveSession(payload.access_token, payload.refresh_token, payload.user?.email)
}

export type PatientsFiltersInput = {
  name: string
  document: string
  dynamicMode: "none" | "no_return" | "next_scheduled" | "today_scheduled"
  absenceYears: string
  absenceMonths: string
  nextConsultWeeks: string
}

const buildPatientsPayload = (accessToken: string, filters: PatientsFiltersInput, page: number) => ({
  accessToken,
  nameFilter: filters.name,
  cpfFilter: filters.document,
  filterMode: filters.dynamicMode,
  absenceYears: Number.parseInt(filters.absenceYears || "0", 10) || 0,
  absenceMonths: Number.parseInt(filters.absenceMonths || "0", 10) || 0,
  nextConsultWeeks: Number.parseInt(filters.nextConsultWeeks || "0", 10) || 0,
  page,
  pageSize: PAGE_SIZE,
})

export const fetchPatients = async (filters: PatientsFiltersInput, page: number): Promise<PatientsPageResult> => {
  const accessToken = getAccessToken()
  if (!accessToken) throw new Error("not_authenticated")

  try {
    return await callBackground<PatientsPageResult>("PATIENTS_FETCH", buildPatientsPayload(accessToken, filters, page))
  } catch (error) {
    const status = (error as Error & { status?: number }).status
    if (status === 401 || status === 403) {
      const refreshed = await refreshSession()
      if (!refreshed) {
        clearSession()
        throw new Error("unauthorized")
      }
      const renewedToken = getAccessToken()
      if (!renewedToken) throw new Error("unauthorized")

      return await callBackground<PatientsPageResult>("PATIENTS_FETCH", buildPatientsPayload(renewedToken, filters, page))
    }
    throw error
  }
}

export const fetchProcedures = async (patientId: string): Promise<SidebarProcedure[]> => {
  const accessToken = getAccessToken()
  if (!accessToken) throw new Error("not_authenticated")

  try {
    return await callBackground<SidebarProcedure[]>("PATIENT_PROCEDURES_FETCH", {
      accessToken,
      patientId,
    })
  } catch (error) {
    const status = (error as Error & { status?: number }).status
    if (status === 401 || status === 403) {
      const refreshed = await refreshSession()
      if (!refreshed) {
        clearSession()
        throw new Error("unauthorized")
      }
      const renewedToken = getAccessToken()
      if (!renewedToken) throw new Error("unauthorized")
      return await callBackground<SidebarProcedure[]>("PATIENT_PROCEDURES_FETCH", {
        accessToken: renewedToken,
        patientId,
      })
    }
    throw error
  }
}

export const fetchMessages = async (): Promise<MessageTemplate[]> => {
  const accessToken = getAccessToken()
  if (!accessToken) throw new Error("not_authenticated")

  try {
    return await callBackground<MessageTemplate[]>("MESSAGES_FETCH", {
      accessToken,
    })
  } catch (error) {
    const status = (error as Error & { status?: number }).status
    if (status === 401 || status === 403) {
      const refreshed = await refreshSession()
      if (!refreshed) {
        clearSession()
        throw new Error("unauthorized")
      }
      const renewedToken = getAccessToken()
      if (!renewedToken) throw new Error("unauthorized")
      return await callBackground<MessageTemplate[]>("MESSAGES_FETCH", {
        accessToken: renewedToken,
      })
    }
    throw error
  }
}

export const createMessage = async (content: string): Promise<MessageTemplate> => {
  const accessToken = getAccessToken()
  if (!accessToken) throw new Error("not_authenticated")

  try {
    return await callBackground<MessageTemplate>("MESSAGE_CREATE", {
      accessToken,
      content,
    })
  } catch (error) {
    const status = (error as Error & { status?: number }).status
    if (status === 401 || status === 403) {
      const refreshed = await refreshSession()
      if (!refreshed) {
        clearSession()
        throw new Error("unauthorized")
      }
      const renewedToken = getAccessToken()
      if (!renewedToken) throw new Error("unauthorized")
      return await callBackground<MessageTemplate>("MESSAGE_CREATE", {
        accessToken: renewedToken,
        content,
      })
    }
    throw error
  }
}

export const updateMessage = async (id: string, content: string): Promise<MessageTemplate> => {
  const accessToken = getAccessToken()
  if (!accessToken) throw new Error("not_authenticated")

  try {
    return await callBackground<MessageTemplate>("MESSAGE_UPDATE", {
      accessToken,
      id,
      content,
    })
  } catch (error) {
    const status = (error as Error & { status?: number }).status
    if (status === 401 || status === 403) {
      const refreshed = await refreshSession()
      if (!refreshed) {
        clearSession()
        throw new Error("unauthorized")
      }
      const renewedToken = getAccessToken()
      if (!renewedToken) throw new Error("unauthorized")
      return await callBackground<MessageTemplate>("MESSAGE_UPDATE", {
        accessToken: renewedToken,
        id,
        content,
      })
    }
    throw error
  }
}

export const deleteMessage = async (id: string): Promise<void> => {
  const accessToken = getAccessToken()
  if (!accessToken) throw new Error("not_authenticated")

  try {
    await callBackground<{ id: string }>("MESSAGE_DELETE", {
      accessToken,
      id,
    })
  } catch (error) {
    const status = (error as Error & { status?: number }).status
    if (status === 401 || status === 403) {
      const refreshed = await refreshSession()
      if (!refreshed) {
        clearSession()
        throw new Error("unauthorized")
      }
      const renewedToken = getAccessToken()
      if (!renewedToken) throw new Error("unauthorized")
      await callBackground<{ id: string }>("MESSAGE_DELETE", {
        accessToken: renewedToken,
        id,
      })
      return
    }
    throw error
  }
}

export const createDispatchRun = async (
  messageTemplateId: string,
  filtersSnapshot: Record<string, unknown>,
  patients: DispatchPatientInput[]
): Promise<DispatchCreateResult> => {
  const accessToken = getAccessToken()
  if (!accessToken) throw new Error("not_authenticated")

  try {
    return await callBackground<DispatchCreateResult>("DISPATCH_CREATE_RUN", {
      accessToken,
      messageTemplateId,
      filtersSnapshot,
      patients,
    })
  } catch (error) {
    const status = (error as Error & { status?: number }).status
    if (status === 401 || status === 403) {
      const refreshed = await refreshSession()
      if (!refreshed) {
        clearSession()
        throw new Error("unauthorized")
      }
      const renewedToken = getAccessToken()
      if (!renewedToken) throw new Error("unauthorized")
      return await callBackground<DispatchCreateResult>("DISPATCH_CREATE_RUN", {
        accessToken: renewedToken,
        messageTemplateId,
        filtersSnapshot,
        patients,
      })
    }
    throw error
  }
}

export const getDispatchPendingBatch = async (runId: string, limit: number): Promise<DispatchItem[]> => {
  const accessToken = getAccessToken()
  if (!accessToken) throw new Error("not_authenticated")

  try {
    return await callBackground<DispatchItem[]>("DISPATCH_GET_PENDING_BATCH", {
      accessToken,
      runId,
      limit,
    })
  } catch (error) {
    const status = (error as Error & { status?: number }).status
    if (status === 401 || status === 403) {
      const refreshed = await refreshSession()
      if (!refreshed) {
        clearSession()
        throw new Error("unauthorized")
      }
      const renewedToken = getAccessToken()
      if (!renewedToken) throw new Error("unauthorized")
      return await callBackground<DispatchItem[]>("DISPATCH_GET_PENDING_BATCH", {
        accessToken: renewedToken,
        runId,
        limit,
      })
    }
    throw error
  }
}

export const markDispatchItemStatus = async (payload: {
  itemId: string
  status: DispatchItemStatus
  attempts?: number
  errorCode?: string | null
  errorMessage?: string | null
  sentAt?: string | null
}) => {
  const accessToken = getAccessToken()
  if (!accessToken) throw new Error("not_authenticated")

  try {
    await callBackground<{ id: string }>("DISPATCH_MARK_ITEM_STATUS", {
      accessToken,
      ...payload,
    })
  } catch (error) {
    const status = (error as Error & { status?: number }).status
    if (status === 401 || status === 403) {
      const refreshed = await refreshSession()
      if (!refreshed) {
        clearSession()
        throw new Error("unauthorized")
      }
      const renewedToken = getAccessToken()
      if (!renewedToken) throw new Error("unauthorized")
      await callBackground<{ id: string }>("DISPATCH_MARK_ITEM_STATUS", {
        accessToken: renewedToken,
        ...payload,
      })
      return
    }
    throw error
  }
}

export const pauseDispatchRun = async (runId: string) => {
  const accessToken = getAccessToken()
  if (!accessToken) throw new Error("not_authenticated")
  await callBackground<{ id: string }>("DISPATCH_PAUSE_RUN", { accessToken, runId })
}

export const resumeDispatchRun = async (runId: string) => {
  const accessToken = getAccessToken()
  if (!accessToken) throw new Error("not_authenticated")
  await callBackground<{ id: string }>("DISPATCH_RESUME_RUN", { accessToken, runId })
}

export const finishDispatchRun = async (runId: string, status: DispatchRunStatus) => {
  const accessToken = getAccessToken()
  if (!accessToken) throw new Error("not_authenticated")
  await callBackground<{ id: string }>("DISPATCH_FINISH_RUN", { accessToken, runId, status })
}

export const getDispatchRunProgress = async (runId: string): Promise<DispatchRunProgress> => {
  const accessToken = getAccessToken()
  if (!accessToken) throw new Error("not_authenticated")
  return await callBackground<DispatchRunProgress>("DISPATCH_GET_RUN_PROGRESS", { accessToken, runId })
}
