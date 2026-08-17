import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import type { Pool } from '../types'

export default function Pools() {
  const { user } = useAuth()
  const [pools, setPools] = useState<Pool[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [leagueId, setLeagueId] = useState('')
  const [season, setSeason] = useState(String(new Date().getFullYear()))
  const [seasonStartThursday, setSeasonStartThursday] = useState('')
  const [inviteCode, setInviteCode] = useState('')

  const loadPools = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data, error } = await supabase
      .from('pool_members')
      .select('pools(*)')
      .eq('user_id', user.id)
      .order('created_at', { foreignTable: 'pools', ascending: false })
    if (error) setError(error.message)
    else setPools((data ?? []).map((row) => row.pools as unknown as Pool).filter(Boolean))
    setLoading(false)
  }, [user])

  useEffect(() => {
    loadPools()
  }, [loadPools])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setError(null)

    const { data: pool, error: poolError } = await supabase
      .from('pools')
      .insert({
        name,
        sleeper_league_id: leagueId,
        season,
        season_start_thursday: seasonStartThursday || null,
        created_by: user.id,
      })
      .select()
      .single()

    if (poolError || !pool) {
      setError(poolError?.message ?? 'Failed to create pool')
      return
    }

    const { error: memberError } = await supabase
      .from('pool_members')
      .insert({ pool_id: pool.id, user_id: user.id })
    if (memberError) setError(memberError.message)

    setName('')
    setLeagueId('')
    setSeasonStartThursday('')
    loadPools()
  }

  async function handleJoin(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setError(null)

    const { data: pool, error: poolError } = await supabase
      .from('pools')
      .select('id')
      .eq('invite_code', inviteCode.trim())
      .single()

    if (poolError || !pool) {
      setError('No pool found with that invite code')
      return
    }

    const { error: memberError } = await supabase
      .from('pool_members')
      .insert({ pool_id: pool.id, user_id: user.id })
    if (memberError) setError(memberError.message)

    setInviteCode('')
    loadPools()
  }

  return (
    <div className="page">
      <p className="eyebrow">Your pools</p>
      <h1>Pools</h1>

      {loading ? (
        <p className="hint">Loading…</p>
      ) : pools.length === 0 ? (
        <p className="hint">No pools yet. Create or join one below.</p>
      ) : (
        <ul className="pool-list">
          {pools.map((pool) => (
            <li key={pool.id}>
              <Link to={`/pools/${pool.id}`} className="pool-card">
                <span className="pool-card-name">{pool.name}</span>
                <span className="pool-card-season">SEASON {pool.season}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="error">{error}</p>}

      <div className="yard-divider" />

      <h2>Create a pool</h2>
      <div className="card">
        <form onSubmit={handleCreate}>
          <label>
            Pool name
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Sleeper league ID
            <input required value={leagueId} onChange={(e) => setLeagueId(e.target.value)} />
          </label>
          <label>
            Season
            <input required value={season} onChange={(e) => setSeason(e.target.value)} />
          </label>
          <label>
            Week 1 Thursday (kickoff lock day)
            <input
              type="date"
              value={seasonStartThursday}
              onChange={(e) => setSeasonStartThursday(e.target.value)}
            />
          </label>
          <button type="submit">Create pool</button>
        </form>
        <p className="hint">
          Picks lock every week at 7:00 PM Central on that Thursday, plus 7 days per week. Leave
          blank to disable pick locking for this pool.
        </p>
      </div>

      <h2>Join a pool</h2>
      <div className="card">
        <form onSubmit={handleJoin}>
          <label>
            Invite code
            <input
              required
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
            />
          </label>
          <button type="submit">Join pool</button>
        </form>
      </div>
    </div>
  )
}
