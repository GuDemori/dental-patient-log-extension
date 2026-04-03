import { useState } from "react"
import eyeClosedUrl from "url:../../assets/eye-closed.svg"
import eyeOpenUrl from "url:../../assets/eye-open.svg"

type LoginFormProps = {
  errorMessage?: string
  onSubmit: (email: string, password: string) => Promise<void>
}

export const LoginForm = ({ errorMessage, onSubmit }: LoginFormProps) => {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState(errorMessage || "")

  const submit = async () => {
    const cleanEmail = email.trim()
    if (!cleanEmail || !password) {
      setMessage("Informe e-mail e senha.")
      return
    }

    setIsSubmitting(true)
    setMessage("Autenticando...")
    try {
      await onSubmit(cleanEmail, password)
    } catch (error) {
      const raw = (error as Error).message || "Falha no login."
      const lower = raw.toLowerCase()

      if (lower.includes("invalid_credentials") || lower.includes("invalid login credentials")) {
        setMessage("E-mail ou senha incorretos. Verifique os dados e tente novamente.")
        return
      }

      try {
        const parsed = JSON.parse(raw) as { error_code?: string; msg?: string }
        if (parsed.error_code === "invalid_credentials") {
          setMessage("E-mail ou senha incorretos. Verifique os dados e tente novamente.")
          return
        }
      } catch {
        // noop
      }

      setMessage("Não foi possível fazer login agora. Tente novamente em instantes.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="login-card">
      <h2 className="login-title">Login</h2>
      <p className="login-sub">Entre com seu e-mail e senha para carregar pacientes.</p>

      <label className="field">
        <span className="field-label">E-mail</span>
        <input
          type="email"
          className="field-input"
          placeholder="seu@email.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>

      <label className="field">
        <span className="field-label">Senha</span>
        <div className="password-wrap">
          <input
            type={passwordVisible ? "text" : "password"}
            className="field-input"
            placeholder="********"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submit()
            }}
          />
          <button
            className="password-toggle"
            type="button"
            aria-label={passwordVisible ? "Ocultar senha" : "Mostrar senha"}
            data-visible={passwordVisible ? "true" : "false"}
            onClick={() => setPasswordVisible((prev) => !prev)}>
            <img className="eye" src={eyeOpenUrl} alt="" aria-hidden="true" />
            <img className="eye-off" src={eyeClosedUrl} alt="" aria-hidden="true" />
          </button>
        </div>
      </label>

      <button id="dpl-login-submit" className="btn" type="button" disabled={isSubmitting} onClick={() => void submit()}>
        Entrar
      </button>
      <div id="dpl-login-state" className="state" style={{ display: message ? "block" : "none" }}>
        {message}
      </div>
    </section>
  )
}
