import { useState, type FormEvent } from 'react'
import { useAuth } from '../lib/useAuth'

export default function Login() {
  const { signInWithEmail } = useAuth()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus('sending')
    const { error } = await signInWithEmail(email)
    if (error) {
      setError(error)
      setStatus('error')
    } else {
      setStatus('sent')
    }
  }

  if (status === 'sent') {
    return (
      <div className="page">
        <p className="eyebrow">Inbox incoming</p>
        <h1>Check your email</h1>
        <div className="card">
          <p>
            We sent a sign-in link to <strong>{email}</strong>. Click it to get in the game.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <p className="eyebrow">Survivor pool</p>
      <h1>Sign in</h1>
      <p className="hint">One pick a week. Survive if your manager wins. Last one standing wins.</p>
      <div className="yard-divider" />
      <div className="card">
        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button type="submit" disabled={status === 'sending'}>
            {status === 'sending' ? 'Sending…' : 'Send magic link'}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  )
}
