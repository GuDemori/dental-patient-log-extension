import type { SidebarPatient, SidebarProcedure } from "../types"
import { formatCurrency, formatDate, formatDocument, formatPhone } from "../utils"
import dropdownArrowUrl from "url:../../assets/dropdown-arrow.svg"

type ProcedureState = {
  status: "loading" | "loaded" | "error"
  data: SidebarProcedure[]
}

type PatientCardProps = {
  patient: SidebarPatient
  expanded: boolean
  proceduresState?: ProcedureState
  onToggleExpand: (patientId: string) => void
}

export const PatientCard = ({ patient, expanded, proceduresState, onToggleExpand }: PatientCardProps) => {
  const documentDisplay = formatDocument(patient.cpf) || "CPF não informado"
  const phoneDisplay = formatPhone(patient.phone) || "Telefone não informado"
  const locationDisplay = (patient.city || patient.address || "").trim()
  const birthDateDisplay = patient.birth_date ? formatDate(patient.birth_date) : ""

  return (
    <article className="patient-card">
      <div className="patient-grid">
        <div className="patient-col">
          <h3 className="patient-name">{patient.name}</h3>
          <p className="patient-meta">{locationDisplay}</p>
        </div>
        <div className="patient-col right">
          <div className="patient-right-layout">
            <div className="patient-right-meta">
              <p className="patient-meta">{documentDisplay}</p>
              <p className="patient-meta">{phoneDisplay}</p>
              <p className="patient-meta">{birthDateDisplay}</p>
            </div>
            <button
              className={`patient-expand${expanded ? " expanded" : ""}`}
              type="button"
              aria-label={expanded ? "Ocultar histórico" : "Mostrar histórico"}
              onClick={() => onToggleExpand(patient.id)}>
              <img className="patient-expand-arrow" src={dropdownArrowUrl} alt="" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <section className="patient-procedures">
          <h4 className="patient-procedures-title">Histórico de Procedimentos</h4>
          {!proceduresState || proceduresState.status === "loading" ? (
            <p className="procedure-empty">Carregando procedimentos...</p>
          ) : proceduresState.status === "error" ? (
            <p className="procedure-empty">Erro ao carregar histórico.</p>
          ) : proceduresState.data.length === 0 ? (
            <p className="procedure-empty">Nenhum procedimento cadastrado ainda.</p>
          ) : (
            <div className="procedure-list">
              {proceduresState.data.map((procedure) => {
                const procedureDate = procedure.date ? formatDate(procedure.date) : ""
                const amount = formatCurrency(procedure.total_value)
                return (
                  <article key={procedure.id} className="procedure-item">
                    <p className="procedure-name">{procedure.name || "Procedimento"}</p>
                    <p className="procedure-meta">
                      {procedureDate}
                      {procedureDate ? " • " : ""}
                      {amount}
                    </p>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      )}
    </article>
  )
}
