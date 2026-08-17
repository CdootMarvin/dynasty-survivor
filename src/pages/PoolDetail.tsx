import { useEffect, useState, type FormEvent } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
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
  const navigate = useNavigate()

  // Testing aid: ?week=5 overrides the live current week, which is otherwise null until Sleeper
  // reports the regular season has started. Never used in normal play.
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
  const [deleting, setDeleting] = useState(false)
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
        // Sleeper's live week counter advances during the pre-season (e.g. reporting week 2
        // while season_type is still "pre"), so trusting it verbatim would open picking, and
        // skip week 1 entirely, before any real games are played. Only treat it as the current
        // pickable week once the regular season is actually underway.
        const liveWeek = nflState.season_type === 'regular' ? nflState.week : null
        setCurrentWeek(weekOverride ?? liveWeek)
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

  const myPickThisWeek = currentWeek !== null ? myPicks.find((p) => p.week === currentWeek) : undefined

  // Pre-fills the manager dropdown with the current week's pick, if one exists and the player
  // hasn't touched the dropdown yet, so "changing" a pick starts from what's already selected
  // rather than a blank one.
  const effectiveSelectedRoster =
    selectedRoster === '' ? (myPickThisWeek?.sleeper_roster_id ?? '') : selectedRoster

  // A manager can be picked again once the second half of the season starts (see pickRules.ts),
  // so only picks from the same half as the current week block re-selecting that manager. The
  // current week's own pick is excluded so changing your mind doesn't lock you out of the
  // manager you already have selected.
  const alreadyPickedRosterIds = new Set(
    currentWeek === null
      ? []
      : myPicks
          .filter((p) => pickHalf(p.week) === pickHalf(currentWeek) && p.id !== myPickThisWeek?.id)
          .map((p) => p.sleeper_roster_id),
  )
  const hasPickedThisWeek = myPickThisWeek !== undefined
  const locked =
    pool !== null && currentWeek !== null && isWeekLocked(currentWeek, pool.season_start_thursday)
  const lockAt =
    pool?.season_start_thursday && currentWeek !== null
      ? getWeekLockAt(currentWeek, pool.season_start_thursday)
      : null

  async function handlePick() {
    if (!poolId || !user || !currentWeek || effectiveSelectedRoster === '' || locked || eliminatedPick)
      return
    const manager = managers.find((m) => m.rosterId === effectiveSelectedRoster)
    if (!manager) return

    setPickError(null)

    if (myPickThisWeek) {
      const { data, error } = await supabase
        .from('picks')
        .update({
          sleeper_roster_id: manager.rosterId,
          sleeper_manager_name: manager.displayName,
        })
        .eq('id', myPickThisWeek.id)
        .select()
        .single()

      if (error || !data) {
        setPickError(error?.message ?? 'Failed to update pick')
        return
      }

      setMyPicks((prev) => prev.map((p) => (p.id === data.id ? data : p)))
    } else {
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
    }

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

  async function handleDeletePool() {
    if (!pool) return
    if (
      !window.confirm(
        `Delete "${pool.name}"? This permanently removes the pool and every player's picks. This can't be undone.`,
      )
    )
      return

    setSettingsError(null)
    setDeleting(true)
    const { error } = await supabase.from('pools').delete().eq('id', pool.id)
    setDeleting(false)

    if (error) {
      setSettingsError(error.message)
      return
    }

    navigate('/')
  }

  if (loading) return <div className="page">Loading…</div>
  if (error) return <div className="page error">{error}</div>
  if (!pool) return null

  return (
    <div className="page page-wide">
      <p className="eyebrow">Season {pool.season}</p>
      <h1>{pool.name}</h1>
      <p className="hint">
        Invite code: <code className="invite-chip">{pool.invite_code}</code>
      </p>

      {user?.id === pool.created_by && (
        <div>
          {settingsOpen ? (
            <div className="card">
              <form onSubmit={handleSaveSettings}>
                <label>
                  Pool name
                  <input
                    required
                    value={nameField}
                    onChange={(e) => setNameField(e.target.value)}
                  />
                </label>
                <label>
                  Sleeper league ID
                  <input
                    required
                    value={leagueIdField}
                    onChange={(e) => setLeagueIdField(e.target.value)}
                  />
                </label>
                <label>
                  Season
                  <input
                    required
                    value={seasonField}
                    onChange={(e) => setSeasonField(e.target.value)}
                  />
                </label>
                <label>
                  Week 1 Thursday (kickoff lock day)
                  <input
                    type="date"
                    value={seasonStartThursdayField}
                    onChange={(e) => setSeasonStartThursdayField(e.target.value)}
                  />
                </label>
                <div className="btn-row">
                  <button type="submit" disabled={settingsSaving}>
                    {settingsSaving ? 'Saving…' : 'Save settings'}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setSettingsOpen(false)}
                  >
                    Cancel
                  </button>
                </div>
                {settingsError && <p className="error">{settingsError}</p>}
              </form>
            </div>
          ) : (
            <div className="btn-row">
              <button type="button" className="btn-ghost btn-sm" onClick={openSettings}>
                Edit pool settings
              </button>
              <button
                type="button"
                className="btn-danger btn-sm"
                onClick={handleDeletePool}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Delete pool'}
              </button>
              {settingsError && <p className="error">{settingsError}</p>}
            </div>
          )}
        </div>
      )}

      {weekOverride !== null && (
        <p className="hint">Testing mode: viewing week {weekOverride} instead of the live week.</p>
      )}

      <p className="eyebrow">{currentWeek !== null ? `Week ${currentWeek}` : 'Season'}</p>
      <h2>Make your pick</h2>
      {lockAt && (
        <p className="hint">
          {locked
            ? `Picks locked at ${lockAt.toLocaleString()}.`
            : `Picks lock ${lockAt.toLocaleString()}.`}
        </p>
      )}
      {eliminatedPick ? (
        <div className="banner banner-eliminated">
          You were eliminated in Week {eliminatedPick.week} —{' '}
          <strong>{eliminatedPick.sleeper_manager_name}</strong> lost that week's matchup.
        </div>
      ) : currentWeek === null ? (
        <div className="banner banner-info">
          Picks open once the regular season starts.
        </div>
      ) : locked ? (
        <div className={`banner ${hasPickedThisWeek ? 'banner-info' : 'banner-locked'}`}>
          {hasPickedThisWeek ? (
            <>
              Picks are locked for this week — you picked{' '}
              <strong>{myPickThisWeek!.sleeper_manager_name}</strong>.
            </>
          ) : (
            "Picks are locked for this week — you didn't get a pick in before kickoff."
          )}
        </div>
      ) : (
        <div className="card">
          {hasPickedThisWeek && (
            <p className="hint">
              You picked <strong>{myPickThisWeek!.sleeper_manager_name}</strong> for this week.
              You can change it until picks lock.
            </p>
          )}
          <form onSubmit={(e) => e.preventDefault()}>
            <select
              value={effectiveSelectedRoster}
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
            <button type="button" onClick={handlePick} disabled={effectiveSelectedRoster === ''}>
              {hasPickedThisWeek ? 'Update pick' : 'Lock in pick'}
            </button>
          </form>
          <p className="hint">
            {currentWeek !== null && currentWeek < RESET_WEEK
              ? `Managers you've already picked are unavailable through week ${RESET_WEEK - 1}, then everyone's available again starting week ${RESET_WEEK}.`
              : `All managers are available again this half — used ones will drop off again as they're repicked.`}
          </p>
          {pickError && <p className="error">{pickError}</p>}
        </div>
      )}

      <div className="yard-divider" />

      <p className="eyebrow">Standings</p>
      <h2>Leaderboard</h2>
      <Leaderboard poolId={pool.id} leagueId={pool.sleeper_league_id} refreshToken={refreshToken} />
    </div>
  )
}
