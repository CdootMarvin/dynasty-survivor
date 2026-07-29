import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getMatchups, computeResult } from '../lib/sleeper'
import type { Pick, PickResult } from '../types'

interface LeaderboardProps {
  poolId: string
  leagueId: string
  /** Bump this to force a refetch, e.g. after the current user submits a new pick. */
  refreshToken?: unknown
}

interface MemberRow {
  userId: string
  displayName: string
  picks: (Pick & { result: PickResult })[]
  eliminatedWeek: number | null
}

// Shape returned by embedding `profiles` via the pool_members.user_id -> profiles.id FK.
interface PoolMemberProfileRow {
  user_id: string
  profiles: { display_name: string } | null
}

export default function Leaderboard({ poolId, leagueId, refreshToken }: LeaderboardProps) {
  const [rows, setRows] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [membersRes, picksRes] = await Promise.all([
          supabase
            .from('pool_members')
            .select('user_id, profiles(display_name)')
            .eq('pool_id', poolId),
          supabase
            .from('picks')
            .select('*')
            .eq('pool_id', poolId)
            .order('week', { ascending: true }),
        ])

        if (membersRes.error) throw new Error(membersRes.error.message)
        if (picksRes.error) throw new Error(picksRes.error.message)

        const members = (membersRes.data ?? []) as unknown as PoolMemberProfileRow[]
        const picks = picksRes.data ?? []

        // Fetch each week's matchups once and reuse it across every player's pick for that week.
        const weeks = [...new Set(picks.map((p) => p.week))]
        const matchupsByWeek = new Map(
          await Promise.all(
            weeks.map(async (week) => [week, await getMatchups(leagueId, week)] as const),
          ),
        )

        const picksByUser = new Map<string, (Pick & { result: PickResult })[]>()
        for (const pick of picks) {
          const matchups = matchupsByWeek.get(pick.week) ?? []
          const result = computeResult(matchups, pick.sleeper_roster_id)
          const list = picksByUser.get(pick.user_id) ?? []
          list.push({ ...pick, result })
          picksByUser.set(pick.user_id, list)
        }

        const memberRows: MemberRow[] = members.map((member) => {
          const memberPicks = (picksByUser.get(member.user_id) ?? []).sort(
            (a, b) => a.week - b.week,
          )
          const firstLoss = memberPicks.find((p) => p.result === 'loss')
          return {
            userId: member.user_id,
            displayName: member.profiles?.display_name ?? 'Unknown player',
            picks: memberPicks,
            eliminatedWeek: firstLoss?.week ?? null,
          }
        })

        // Alive players first (alphabetical), then eliminated players, most recently out first.
        memberRows.sort((a, b) => {
          const aAlive = a.eliminatedWeek === null
          const bAlive = b.eliminatedWeek === null
          if (aAlive !== bAlive) return aAlive ? -1 : 1
          if (!aAlive) return (b.eliminatedWeek as number) - (a.eliminatedWeek as number)
          return a.displayName.localeCompare(b.displayName)
        })

        if (!cancelled) setRows(memberRows)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [poolId, leagueId, refreshToken])

  if (loading) return <p>Loading leaderboard…</p>
  if (error) return <p className="error">{error}</p>
  if (rows.length === 0) return <p>No one has joined this pool yet.</p>

  const aliveCount = rows.filter((r) => r.eliminatedWeek === null).length

  return (
    <div>
      <p>
        {aliveCount} of {rows.length} still alive
      </p>
      <table className="leaderboard">
        <thead>
          <tr>
            <th>Player</th>
            <th>Status</th>
            <th>Picks</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.userId} className={row.eliminatedWeek !== null ? 'eliminated' : ''}>
              <td>{row.displayName}</td>
              <td>
                {row.eliminatedWeek !== null ? `Eliminated Wk ${row.eliminatedWeek}` : 'Alive'}
              </td>
              <td>
                {row.picks.length === 0
                  ? '—'
                  : row.picks
                      .map((p) => `Wk${p.week}: ${p.sleeper_manager_name} (${p.result})`)
                      .join(', ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
