import type { MessageTemplate } from "../types"
import { useState } from "react"

type MessagesScreenProps = {
  messages: MessageTemplate[]
  loading: boolean
  statusMessage?: string
  onAddMessage: (message: string) => Promise<void>
}

export const MessagesScreen = ({ messages, loading, statusMessage, onAddMessage }: MessagesScreenProps) => {
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)

  const handleCancel = () => {
    setCreating(false)
    setDraft("")
  }

  const handleSave = async () => {
    const clean = draft.trim()
    if (!clean) return
    setSaving(true)
    try {
      await onAddMessage(clean)
      setDraft("")
      setCreating(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="messages-card">
      <div className="messages-header">
        <h3 className="messages-title">Mensagens</h3>
        {!creating ? (
          <button className="btn secondary" type="button" onClick={() => setCreating(true)}>
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
              Salvar
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
            </article>
          ))
        )}
      </div>
    </section>
  )
}
