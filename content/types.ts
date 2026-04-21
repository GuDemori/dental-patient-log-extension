export type SidebarPatient = {
  id: string
  name: string
  cpf: string | null
  phone: string | null
  city: string | null
  address?: string | null
  birth_date: string | null
}

export type SidebarProcedure = {
  id: string
  patient_id: string
  name: string
  date: string | null
  total_value: number | null
}

export type PatientsPageResult = {
  items: SidebarPatient[]
  total: number
}

export type MessageTemplate = {
  id: string
  content: string
  created_at: string
  updated_at: string
}

export type DispatchRunStatus = "running" | "paused" | "completed" | "failed" | "cancelled"
export type DispatchItemStatus = "pending" | "sending" | "sent" | "error" | "cancelled"

export type DispatchPatientInput = {
  id: string
  name: string
  phone: string | null
}

export type DispatchRun = {
  id: string
  status: DispatchRunStatus
  message_template_id: string
  started_at: string
  finished_at: string | null
  created_at: string
}

export type DispatchItem = {
  id: string
  run_id: string
  patient_id: string
  phone: string | null
  rendered_text: string
  status: DispatchItemStatus
  attempts: number
  error_code: string | null
  error_message: string | null
  sent_at: string | null
  created_at: string
  updated_at: string
}

export type DispatchRunProgress = {
  run: DispatchRun
  total: number
  pending: number
  sending: number
  sent: number
  error: number
  cancelled: number
}

export type DispatchCreateResult = {
  run: DispatchRun
  progress: DispatchRunProgress
}
