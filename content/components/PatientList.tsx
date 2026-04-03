import { PAGE_SIZE } from "../constants"
import type { SidebarPatient, SidebarProcedure } from "../types"
import { PatientCard } from "./PatientCard"

type ProcedureStateMap = Record<string, { status: "loading" | "loaded" | "error"; data: SidebarProcedure[] }>

type PatientListProps = {
  patients: SidebarPatient[]
  totalPatients: number
  currentPage: number
  expandedIds: Set<string>
  proceduresMap: ProcedureStateMap
  onToggleExpand: (patientId: string) => void
  onPrevPage: () => void
  onNextPage: () => void
}

export const PatientList = ({
  patients,
  totalPatients,
  currentPage,
  expandedIds,
  proceduresMap,
  onToggleExpand,
  onPrevPage,
  onNextPage,
}: PatientListProps) => {
  const totalPages = Math.max(1, Math.ceil(totalPatients / PAGE_SIZE))

  return (
    <>
      <section id="dpl-patient-list" className="patient-list" aria-label="Lista de pacientes">
        {patients.map((patient) => (
          <PatientCard
            key={patient.id}
            patient={patient}
            expanded={expandedIds.has(patient.id)}
            proceduresState={proceduresMap[patient.id]}
            onToggleExpand={onToggleExpand}
          />
        ))}
      </section>

      <div className="pagination">
        <div id="dpl-page-info" className="pagination-info">
          {`Página ${currentPage} de ${totalPages} • ${totalPatients} pacientes`}
        </div>
        <div className="pagination-actions">
          <button id="dpl-page-prev" className="btn secondary" type="button" onClick={onPrevPage} disabled={currentPage <= 1}>
            Anterior
          </button>
          <button
            id="dpl-page-next"
            className="btn secondary"
            type="button"
            onClick={onNextPage}
            disabled={currentPage >= totalPages}>
            Próxima
          </button>
        </div>
      </div>
    </>
  )
}

