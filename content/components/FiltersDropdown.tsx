import filterIconUrl from "url:../../assets/filter.png"
import dropdownArrowUrl from "url:../../assets/dropdown-arrow.svg"

export type DynamicFilterMode = "none" | "no_return" | "next_scheduled" | "today_scheduled"

export type FiltersValue = {
  name: string
  document: string
  dynamicMode: DynamicFilterMode
  absenceYears: string
  absenceMonths: string
  nextConsultWeeks: string
}

type FiltersDropdownProps = {
  value: FiltersValue
  isOpen: boolean
  onToggle: () => void
  onChange: (next: FiltersValue) => void
  onApply: () => void
  onClear: () => void
  disabled?: boolean
}

const numbersOnly = (value: string) => value.replace(/\D/g, "")

const clampWeeks = (value: string) => {
  const parsed = Number.parseInt(numbersOnly(value), 10)
  if (!Number.isFinite(parsed)) return "1"
  return String(Math.min(100, Math.max(1, parsed)))
}

const YEAR_OPTIONS = Array.from({ length: 11 }, (_, index) => String(index))
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index))

export const FiltersDropdown = ({ value, isOpen, onToggle, onChange, onApply, onClear, disabled = false }: FiltersDropdownProps) => {
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

        <p className="filters-section-title">Filtro de agenda</p>
        <div className="filters-grid">
          <label className="field">
            <span className="field-label">Condição</span>
            <select
              id="dpl-filter-dynamic-mode"
              className="field-input"
              value={value.dynamicMode}
              onChange={(event) => {
                const dynamicMode = event.target.value as DynamicFilterMode
                if (dynamicMode === "none") {
                  onChange({
                    ...value,
                    dynamicMode,
                    absenceYears: "0",
                    absenceMonths: "0",
                    nextConsultWeeks: "4",
                  })
                  return
                }

                if (dynamicMode === "next_scheduled") {
                  onChange({
                    ...value,
                    dynamicMode,
                    nextConsultWeeks: clampWeeks(value.nextConsultWeeks || "4"),
                  })
                  return
                }

                if (dynamicMode === "today_scheduled") {
                  onChange({
                    ...value,
                    dynamicMode,
                  })
                  return
                }

                onChange({
                  ...value,
                  dynamicMode,
                  absenceYears: value.absenceYears || "1",
                  absenceMonths: value.absenceMonths || "0",
                })
              }}>
              <option value="none">Sem filtro dinâmico</option>
              <option value="no_return">Não faz retorno há</option>
              <option value="next_scheduled">Próxima consulta agendada para</option>
              <option value="today_scheduled">Retorno marcado para hoje</option>
            </select>
          </label>

          {value.dynamicMode === "next_scheduled" ? (
            <label className="field">
              <span className="field-label">Prazo</span>
              <div className="weeks-inline">
                <span className="weeks-inline-text">Até</span>
                <input
                  id="dpl-filter-next-consult-weeks"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={3}
                  className="field-input weeks-inline-input"
                  value={value.nextConsultWeeks}
                  onChange={(event) => onChange({ ...value, nextConsultWeeks: numbersOnly(event.target.value) })}
                  onBlur={() => onChange({ ...value, nextConsultWeeks: clampWeeks(value.nextConsultWeeks) })}
                />
                <span className="weeks-inline-text">semanas</span>
              </div>
            </label>
          ) : null}
        </div>

        {value.dynamicMode === "no_return" ? (
          <div className="absence-row">
            <label className="field">
              <span className="field-label">Anos</span>
              <select
                id="dpl-filter-absence-years"
                className="field-input"
                value={value.absenceYears}
                onChange={(event) => onChange({ ...value, absenceYears: numbersOnly(event.target.value) || "0" })}>
                {YEAR_OPTIONS.map((year) => (
                  <option key={year} value={year}>
                    {year} ano{year === "1" ? "" : "s"}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">Meses</span>
              <select
                id="dpl-filter-absence-months"
                className="field-input"
                value={value.absenceMonths}
                onChange={(event) => onChange({ ...value, absenceMonths: numbersOnly(event.target.value) || "0" })}>
                {MONTH_OPTIONS.map((month) => (
                  <option key={month} value={month}>
                    {month} {month === "1" ? "mês" : "meses"}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        <div className="filters-actions">
          <button type="button" className="btn secondary" onClick={onClear} disabled={disabled}>
            Limpar
          </button>
          <button type="button" className="btn" onClick={onApply} disabled={disabled}>
            Filtrar
          </button>
        </div>
      </div>
    </section>
  )
}
