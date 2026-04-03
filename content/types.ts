export type SidebarPatient = {
  id: string
  name: string
  cpf: string | null
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
