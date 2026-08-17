import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'

export default function Profile() {
  const { user } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false

    async function load() {
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user!.id)
        .single()
      if (cancelled) return
      if (error) setError(error.message)
      else setDisplayName(data?.display_name ?? '')
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [user])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    const trimmed = displayName.trim()
    if (!trimmed) return

    setSaving(true)
    setSaved(false)
    setError(null)
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: trimmed })
      .eq('id', user.id)
    setSaving(false)

    if (error) setError(error.message)
    else {
      setDisplayName(trimmed)
      setSaved(true)
    }
  }

  if (loading) return <div className="page">Loading…</div>

  return (
    <div className="page">
      <p className="eyebrow">Account</p>
      <h1>Your profile</h1>
      <p className="hint">
        This is the name other players see on pool leaderboards and pick history.
      </p>
      <div className="yard-divider" />
      <div className="card">
        <form onSubmit={handleSubmit}>
          <label>
            Display name
            <input
              required
              maxLength={40}
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value)
                setSaved(false)
              }}
            />
          </label>
          <button type="submit" disabled={saving || !displayName.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>
        {saved && <p className="hint">Saved.</p>}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  )
}
