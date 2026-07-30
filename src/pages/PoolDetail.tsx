import { useEffect, useState, type FormEvent } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import {
  getLeagueManagers,
  getMatchups,
  getNflState,
  computeResult,
  type LeagueManager,
} from '../lib/sleeper'
import { getWeekLockAt, isWeekLocked } from '../lib/lock'
import { RESET_WEEK, pickHalf } from '../lib/pickRules'
import Leaderboard from '../components/Leaderboard'
import type { Pick, Pool } from '../types'

export default function PoolDetail() {
  const { poolId } = useParams<{ poolId: string }>()
  const { user } = useAuth()

  // Testing aid: ?week=5 overrides Sleeper's live current week (0 during the pre-season, so
  // picking is otherwise impossible until the real season starts). Never used in normal play.
  const [searchParams] = useSearchParams()
  const weekOverrideParam = searchParams.get('week')
  const weekOverride =
    weekOverrideParam && Number(weekOverrideParam) >= 1 && Number(weekOverrideParam) <= 18
      ? Number(weekOverrideParam)
      : null

  const [pool, setPool] = useState<Pool | null>(null)
  const [managers, setManagers] = useState<LeagueManager[]>([])
  const [currentWeek, setCurrentWeek] = useState<number | null>(null)
  const [myPicks, setMyPicks] = useState<Pick[]>([])
  const [eliminatedPick, setEliminatedPick] = useState<Pick | null>(null)
  const [selectedRoster, setSelectedRoster] = useState<number | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [pickError, setPickError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshToken, setRefreshToken] = useState(0)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [nameField, setNameField] = useState('')
  const [leagueIdField, setLeagueIdField] = useState('')
  const [seasonField, setSeasonField] = useState('')
  const [seasonStartThursdayField, setSeasonStartThursdayField] = useState('')

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
        setCurrentWeek(weekOverride ?? nflState.week)
        const picks = picksRes.data ?? []
        setMyPicks(picks)

        // Elimination isn't stored anywhere — it's derived the same way the leaderboard
        // derives it, by replaying each of this player's own picks against live Sleeper
        // matchup data and finding the earliest loss.
        const weeks = [...new Set(picks.map((p) => p.week))]
        const matchupsByWeek = new Map(
          await Promise.all(
            weeks.map(async (week) => [week, await getMatchups(poolData.sleeper_league_id, week)] as const),
          ),
        )
        const firstLoss = picks
          .slice()
          .sort((a, b) => a.week - b.week)
          .find((pick) => computeResult(matchupsByWeek.get(pick.week) ?? [], pick.sleeper_roster_id) === 'loss')
        setEliminatedPick(firstLoss ?? null)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [poolId, user, weekOverride])

  // A manager can be picked again once the second half of the season starts (see pickRules.ts),
  // so only picks from the same half as the current week block re-selecting that manager.
  const alreadyPickedRosterIds = new Set(
    currentWeek === null
      ? []
      : myPicks
          .filter((p) => pickHalf(p.week) === pickHalf(currentWeek))
          .map((p) => p.sleeper_roster_id),
  )
  const hasPickedThisWeek = currentWeek !== null && myPicks.some((p) => p.week === currentWeek)
  const locked =
    pool !== null && currentWeek !== null && isWeekLocked(currentWeek, pool.season_start_thursday)
  const lockAt =
    pool?.season_start_thursday && currentWeek !== null
      ? getWeekLockAt(currentWeek, pool.season_start_thursday)
      : null

  async function handlePick() {
    if (!poolId || !user || !currentWeek || selectedRoster === '' || locked || eliminatedPick) return
    const manager = managers.find((m) => m.rosterId === selectedRoster)
    if (!manager) return

    setPickError(null)
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
      setPickError(error?.message ?? 'Failed to save pick')
      return
    }

    setMyPicks((prev) => [...prev, data])
    setSelectedRoster('')
    setRefreshToken((n) => n + 1)
  }

  function openSettings() {
    if (!pool) return
    setNameField(pool.name)
    setLeagueIdField(pool.sleeper_league_id)
    setSeasonField(pool.season)
    setSeasonStartThursdayField(pool.season_start_thursday ?? '')
    setSettingsError(null)
    setSettingsOpen(true)
  }

  async function handleSaveSettings(e: FormEvent) {
    e.preventDefault()
    if (!pool) return
    setSettingsSaving(true)
    setSettingsError(null)

    const leagueIdChanged = leagueIdField !== pool.sleeper_league_id

    const { data, error } = await supabase
      .from('pools')
      .update({
        name: nameField,
        sleeper_league_id: leagueIdField,
        season: seasonField,
        season_start_thursday: seasonStartThursdayField || null,
      })
      .eq('id', pool.id)
      .select()
      .single()

    setSettingsSaving(false)

    if (error || !data) {
      setSettingsError(error?.message ?? 'Failed to save settings')
      return
    }

    setPool(data)
    setSettingsOpen(false)
    if (leagueIdChanged) {
      setManagers(await getLeagueManagers(data.sleeper_league_id))
    }
    setRefreshToken((n) => n + 1)
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

      {user?.id === pool.created_by && (
        <div>
          {settingsOpen ? (
            <form onSubmit={handleSaveSettings}>
              <input
                placeholder="Pool name"
                required
                value={nameField}
                onChange={(e) => setNameField(e.target.value)}
              />
              <input
                placeholder="Sleeper league ID"
                required
                value={leagueIdField}
                onChange={(e) => setLeagueIdField(e.target.value)}
              />
              <input
                placeholder="Season"
                required
                value={seasonField}
                onChange={(e) => setSeasonField(e.target.value)}
              />
              <label>
                Week 1 Thursday (kickoff lock day)
                <input
                  type="date"
                  value={seasonStartThursdayField}
                  onChange={(e) => setSeasonStartThursdayField(e.target.value)}
                />
              </label>
              <button type="submit" disabled={settingsSaving}>
                {settingsSaving ? 'Saving…' : 'Save settings'}
              </button>
              <button type="button" onClick={() => setSettingsOpen(false)}>
                Cancel
              </button>
              {settingsError && <p className="error">{settingsError}</p>}
            </form>
          ) : (
            <button type="button" onClick={openSettings}>
              Edit pool settings
            </button>
          )}
        </div>
      )}

      {weekOverride !== null && (
        <p className="hint">Testing mode: viewing week {weekOverride} instead of the live week.</p>
      )}

      <h2>Week {currentWeek}</h2>
      {lockAt && (
        <p className="hint">
          {locked
            ? `Picks locked at ${lockAt.toLocaleString()}.`
            : `Picks lock ${lockAt.toLocaleString()}.`}
        </p>
      )}
      {eliminatedPick ? (
        <p>
          You were eliminated in Week {eliminatedPick.week} — {eliminatedPick.sleeper_manager_name}{' '}
          lost that week's matchup.
        </p>
      ) : hasPickedThisWeek ? (
        <p>You've already picked for this week.</p>
      ) : locked ? (
        <p>Picks are locked for this week — you didn't get a pick in before kickoff.</p>
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
          <p className="hint">
            {currentWeek !== null && currentWeek < RESET_WEEK
              ? `Managers you've already picked are unavailable through week ${RESET_WEEK - 1}, then everyone's available again starting week ${RESET_WEEK}.`
              : `All managers are available again this half — used ones will drop off again as they're repicked.`}
          </p>
          {pickError && <p className="error">{pickError}</p>}
        </div>
      )}

      <h2>Leaderboard</h2>
      <Leaderboard poolId={pool.id} leagueId={pool.sleeper_league_id} refreshToken={refreshToken} />
    </div>
  )
}
