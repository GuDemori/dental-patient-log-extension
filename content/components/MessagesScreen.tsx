import type { DispatchRunProgress, MessageTemplate } from "../types"
import { useState } from "react"
import deleteBlackUrl from "url:../../assets/black-delete.svg"
import deleteRedUrl from "url:../../assets/red-delete.svg"
import editIconUrl from "url:../../assets/edit.svg"

type MessagesScreenProps = {
  messages: MessageTemplate[]
  loading: boolean
  statusMessage?: string
  onAddMessage: (message: string) => Promise<void>
  onUpdateMessage: (id: string, message: string) => Promise<void>
  onDeleteMessage: (id: string) => Promise<void>
  dispatchTemplateId: string
  onDispatchTemplateChange: (templateId: string) => void
  onStartDispatch: () => Promise<void>
  onPauseDispatch: () => void
  dispatchRunning: boolean
  dispatchBusy: boolean
  dispatchProgress: DispatchRunProgress | null
  dispatchError?: string
}

export const MessagesScreen = ({
  messages,
  loading,
  statusMessage,
  onAddMessage,
  onUpdateMessage,
  onDeleteMessage,
  dispatchTemplateId,
  onDispatchTemplateChange,
  onStartDispatch,
  onPauseDispatch,
  dispatchRunning,
  dispatchBusy,
  dispatchProgress,
  dispatchError,
}: MessagesScreenProps) => {
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MessageTemplate | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleCancel = () => {
    setCreating(false)
    setEditingId(null)
    setDraft("")
  }

  const handleSave = async () => {
    const clean = draft.trim()
    if (!clean) return
    setSaving(true)
    try {
      if (editingId) {
        await onUpdateMessage(editingId, clean)
      } else {
        await onAddMessage(clean)
      }
      setDraft("")
      setCreating(false)
      setEditingId(null)
    } finally {
      setSaving(false)
    }
  }

  const startCreate = () => {
    setEditingId(null)
    setDraft("")
    setCreating(true)
  }

  const startEdit = (message: MessageTemplate) => {
    setEditingId(message.id)
    setDraft(message.content)
    setCreating(true)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await onDeleteMessage(deleteTarget.id)
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="messages-card">
      <div className="dispatch-card">
        <div className="dispatch-header">
          <h4 className="messages-title">Disparo</h4>
          {dispatchRunning ? (
            <button className="btn danger" type="button" onClick={onPauseDispatch} disabled={dispatchBusy}>
              Pausar
            </button>
          ) : (
            <button className="btn" type="button" onClick={() => void onStartDispatch()} disabled={dispatchBusy}>
              Disparar
            </button>
          )}
        </div>
        <div className="field">
          <label className="field-label" htmlFor="dispatch-template-id">
            Mensagem para disparo
          </label>
          <select
            id="dispatch-template-id"
            className="field-input"
            value={dispatchTemplateId}
            onChange={(event) => onDispatchTemplateChange(event.target.value)}>
            <option value="">Selecione...</option>
            {messages.map((template) => (
              <option value={template.id} key={template.id}>
                {template.content.slice(0, 80)}
              </option>
            ))}
          </select>
        </div>
        {dispatchProgress ? (
          <div className="dispatch-progress">
            <span>Total: {dispatchProgress.total}</span>
            <span>Pendentes: {dispatchProgress.pending}</span>
            <span>Enviadas: {dispatchProgress.sent}</span>
            <span>Erro: {dispatchProgress.error}</span>
          </div>
        ) : null}
        {dispatchError ? <p className="messages-empty">{dispatchError}</p> : null}
      </div>

      <div className="messages-header">
        <h3 className="messages-title">Mensagens</h3>
        {!creating ? (
          <button className="btn secondary" type="button" onClick={startCreate}>
            + Nova mensagem
          </button>
        ) : null}
      </div>

      {creating ? (
        <div className="message-editor">
          <textarea
            className="message-textarea"
            placeholder="Digite a mensagem..."
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="message-editor-actions">
            <button className="btn secondary" type="button" onClick={handleCancel}>
              Cancelar
            </button>
            <button className="btn" type="button" onClick={() => void handleSave()} disabled={!draft.trim() || saving}>
              {editingId ? "Atualizar" : "Salvar"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="messages-list">
        {loading ? (
          <p className="messages-empty">Carregando mensagens...</p>
        ) : statusMessage ? (
          <p className="messages-empty">{statusMessage}</p>
        ) : messages.length === 0 ? (
          <p className="messages-empty">Nenhuma mensagem criada.</p>
        ) : (
          messages.map((message) => (
            <article key={message.id} className="message-item">
              <p className="message-item-text">{message.content}</p>
              <div className="message-item-actions">
                <button className="message-action message-action-edit" type="button" onClick={() => startEdit(message)}>
                  <img src={editIconUrl} alt="" aria-hidden="true" />
                  <span>Editar</span>
                </button>
                <button className="message-action message-action-delete" type="button" onClick={() => setDeleteTarget(message)}>
                  <img className="delete-icon-black" src={deleteBlackUrl} alt="" aria-hidden="true" />
                  <img className="delete-icon-red" src={deleteRedUrl} alt="" aria-hidden="true" />
                  <span>Deletar</span>
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      {deleteTarget ? (
        <div className="message-modal-backdrop">
          <div className="message-modal">
            <h4 className="message-modal-title">Confirmar exclusão</h4>
            <p className="message-modal-text">Tem certeza que deseja deletar esta mensagem?</p>
            <div className="message-modal-actions">
              <button className="btn secondary" type="button" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                Cancelar
              </button>
              <button className="btn danger" type="button" onClick={() => void confirmDelete()} disabled={deleting}>
                Deletar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
