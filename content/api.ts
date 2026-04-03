import { ACCESS_TOKEN_KEY, PAGE_SIZE, REFRESH_TOKEN_KEY, USER_EMAIL_KEY } from "./constants"
import type { MessageTemplate, PatientsPageResult, SidebarProcedure } from "./types"

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

export const fetchPatients = async (nameFilter: string, cpfFilter: string, page: number): Promise<PatientsPageResult> => {
  const accessToken = getAccessToken()
  if (!accessToken) throw new Error("not_authenticated")

  try {
    return await callBackground<PatientsPageResult>("PATIENTS_FETCH", {
      accessToken,
      nameFilter,
      cpfFilter,
      page,
      pageSize: PAGE_SIZE,
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

      return await callBackground<PatientsPageResult>("PATIENTS_FETCH", {
        accessToken: renewedToken,
        nameFilter,
        cpfFilter,
        page,
        pageSize: PAGE_SIZE,
      })
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
