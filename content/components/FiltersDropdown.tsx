import filterIconUrl from "url:../../assets/filter.png"
import dropdownArrowUrl from "url:../../assets/dropdown-arrow.svg"

type FiltersValue = {
  name: string
  document: string
  absenceYears: string
  absenceMonths: string
}

type FiltersDropdownProps = {
  value: FiltersValue
  isOpen: boolean
  onToggle: () => void
  onChange: (next: FiltersValue) => void
}

const numbersOnly = (value: string) => value.replace(/\D/g, "")

export const FiltersDropdown = ({ value, isOpen, onToggle, onChange }: FiltersDropdownProps) => {
  return (
    <section className="filters-card">
      <button
        id="dpl-filters-toggle"
        className="filters-toggle"
        type="button"
        aria-expanded={isOpen ? "true" : "false"}
        aria-label="Abrir filtros"
        onClick={onToggle}>
        <span className="filters-toggle-left">
          <img src={filterIconUrl} className="filters-toggle-icon" alt="" />
          <span>Filtros</span>
        </span>
        <img src={dropdownArrowUrl} className="filters-toggle-arrow" alt="" />
      </button>

      <div id="dpl-filters-panel" className={`filters-panel${isOpen ? " open" : ""}`}>
        <p className="filters-section-title">Informações pessoais</p>
        <div className="filters-grid">
          <label className="field">
            <span className="field-label">Nome</span>
            <input
              id="dpl-filter-name"
              className="field-input"
              placeholder="Digite o nome do paciente"
              value={value.name}
              onChange={(event) => onChange({ ...value, name: event.target.value })}
            />
          </label>
          <label className="field">
            <span className="field-label">Documento</span>
            <input
              id="dpl-filter-cpf"
              className="field-input"
              placeholder="CPF ou RG"
              value={value.document}
              onChange={(event) => onChange({ ...value, document: event.target.value })}
            />
          </label>
        </div>
        <div className="filters-divider" aria-hidden="true"></div>
        <label className="field">
          <span className="field-label">Tempo ausente</span>
          <div className="absence-row">
            <label className="field">
              <span className="field-label">Ano(s)</span>
              <input
                id="dpl-filter-absence-years"
                className="field-input"
                placeholder="0"
                inputMode="numeric"
                value={value.absenceYears}
                onChange={(event) => onChange({ ...value, absenceYears: numbersOnly(event.target.value) })}
              />
            </label>
            <label className="field">
              <span className="field-label">Mês(es)</span>
              <input
                id="dpl-filter-absence-months"
                className="field-input"
                placeholder="0"
                inputMode="numeric"
                value={value.absenceMonths}
                onChange={(event) => {
                  const digits = numbersOnly(event.target.value)
                  const numeric = digits ? Number.parseInt(digits, 10) : 0
                  onChange({ ...value, absenceMonths: digits ? String(Math.min(Math.max(0, numeric), 12)) : "" })
                }}
              />
            </label>
          </div>
        </label>
      </div>
    </section>
  )
}

