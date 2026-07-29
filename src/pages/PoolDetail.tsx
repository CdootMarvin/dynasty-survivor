import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { getLeagueManagers, getMatchups, getNflState, computeResult, type LeagueManager } from '../lib/sleeper'
import type { Pick, PickResult, Pool } from '../types'

export default function PoolDetail() {
  const { poolId } = useParams<{ poolId: string }>()
  const { user } = useAuth()

  const [pool, setPool] = useState<Pool | null>(null)
  const [managers, setManagers] = useState<LeagueManager[]>([])
  const [currentWeek, setCurrentWeek] = useState<number | null>(null)
  const [myPicks, setMyPicks] = useState<Pick[]>([])
  const [results, setResults] = useState<Record<number, PickResult>>({})
  const [selectedRoster, setSelectedRoster] = useState<number | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!poolId || !user) return

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const { data: poolData, error: poolError } = await supabase
          .from('pools')
          .select('*')
          .eq('id', poolId)
          .single()
        if (poolError || !poolData) throw new Error(poolError?.message ?? 'Pool not found')
        setPool(poolData)

        const [leagueManagers, nflState, picksRes] = await Promise.all([
          getLeagueManagers(poolData.sleeper_league_id),
          getNflState(),
          supabase
            .from('picks')
            .select('*')
            .eq('pool_id', poolId)
            .eq('user_id', user!.id)
            .order('week', { ascending: true }),
        ])

        setManagers(leagueManagers)
        setCurrentWeek(nflState.week)
        const picks = picksRes.data ?? []
        setMyPicks(picks)

        const resultsByWeek: Record<number, PickResult> = {}
        for (const pick of picks) {
          const matchups = await getMatchups(poolData.sleeper_league_id, pick.week)
          resultsByWeek[pick.week] = computeResult(matchups, pick.sleeper_roster_id)
        }
        setResults(resultsByWeek)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [poolId, user])

  const alreadyPickedRosterIds = new Set(myPicks.map((p) => p.sleeper_roster_id))
  const hasPickedThisWeek = currentWeek !== null && myPicks.some((p) => p.week === currentWeek)

  async function handlePick() {
    if (!poolId || !user || !currentWeek || selectedRoster === '') return
    const manager = managers.find((m) => m.rosterId === selectedRoster)
    if (!manager) return

    setError(null)
    const { data, error } = await supabase
      .from('picks')
      .insert({
        pool_id: poolId,
        user_id: user.id,
        week: currentWeek,
        sleeper_roster_id: manager.rosterId,
        sleeper_manager_name: manager.displayName,
      })
      .select()
      .single()

    if (error || !data) {
      setError(error?.message ?? 'Failed to save pick')
      return
    }

    setMyPicks((prev) => [...prev, data])
    setSelectedRoster('')
  }

  if (loading) return <div className="page">Loading…</div>
  if (error) return <div className="page error">{error}</div>
  if (!pool) return null

  return (
    <div className="page">
      <h1>{pool.name}</h1>
      <p>
        Season {pool.season} · Invite code: <code>{pool.invite_code}</code>
      </p>

      <h2>Week {currentWeek}</h2>
      {hasPickedThisWeek ? (
        <p>You've already picked for this week.</p>
      ) : (
        <div>
          <select
            value={selectedRoster}
            onChange={(e) => setSelectedRoster(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Select a manager…</option>
            {managers
              .filter((m) => !alreadyPickedRosterIds.has(m.rosterId))
              .map((m) => (
                <option key={m.rosterId} value={m.rosterId}>
                  {m.displayName}
                </option>
              ))}
          </select>
          <button type="button" onClick={handlePick} disabled={selectedRoster === ''}>
            Lock in pick
          </button>
        </div>
      )}

      <h2>Your picks</h2>
      <ul>
        {myPicks.map((pick) => (
          <li key={pick.id}>
            Week {pick.week}: {pick.sleeper_manager_name} — {results[pick.week] ?? 'pending'}
          </li>
        ))}
      </ul>
    </div>
  )
}
