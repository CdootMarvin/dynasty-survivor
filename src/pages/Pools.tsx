import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
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

  async function loadPools() {
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
  }

  useEffect(() => {
    loadPools()
  }, [user])

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
      <h1>Pools</h1>

      {loading ? (
        <p>Loading…</p>
      ) : pools.length === 0 ? (
        <p>No pools yet. Create one below.</p>
      ) : (
        <ul>
          {pools.map((pool) => (
            <li key={pool.id}>
              <Link to={`/pools/${pool.id}`}>
                {pool.name} ({pool.season})
              </Link>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="error">{error}</p>}

      <h2>Create a pool</h2>
      <form onSubmit={handleCreate}>
        <input
          placeholder="Pool name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          placeholder="Sleeper league ID"
          required
          value={leagueId}
          onChange={(e) => setLeagueId(e.target.value)}
        />
        <input
          placeholder="Season"
          required
          value={season}
          onChange={(e) => setSeason(e.target.value)}
        />
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

      <h2>Join a pool</h2>
      <form onSubmit={handleJoin}>
        <input
          placeholder="Invite code"
          required
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
        />
        <button type="submit">Join pool</button>
      </form>
    </div>
  )
}
