import type {
  PickResult,
  SleeperMatchup,
  SleeperNflState,
  SleeperRoster,
  SleeperUser,
} from '../types'

// Thin wrapper around the public, read-only, key-less Sleeper API.
// Docs: https://docs.sleeper.com/

const SLEEPER_BASE_URL = 'https://api.sleeper.app/v1'

async function sleeperGet<T>(path: string): Promise<T> {
  const res = await fetch(`${SLEEPER_BASE_URL}${path}`)
  if (!res.ok) {
    throw new Error(`Sleeper API request failed (${res.status}): ${path}`)
  }
  return res.json() as Promise<T>
}

export function getNflState(): Promise<SleeperNflState> {
  return sleeperGet<SleeperNflState>('/state/nfl')
}

export function getLeagueUsers(leagueId: string): Promise<SleeperUser[]> {
  return sleeperGet<SleeperUser[]>(`/league/${leagueId}/users`)
}

export function getLeagueRosters(leagueId: string): Promise<SleeperRoster[]> {
  return sleeperGet<SleeperRoster[]>(`/league/${leagueId}/rosters`)
}

export function getMatchups(leagueId: string, week: number): Promise<SleeperMatchup[]> {
  return sleeperGet<SleeperMatchup[]>(`/league/${leagueId}/matchups/${week}`)
}

export interface LeagueManager {
  rosterId: number
  displayName: string
  avatar: string | null
}

/** Joins rosters + users into a flat list of pickable managers for a league. */
export async function getLeagueManagers(leagueId: string): Promise<LeagueManager[]> {
  const [rosters, users] = await Promise.all([
    getLeagueRosters(leagueId),
    getLeagueUsers(leagueId),
  ])
  const usersById = new Map(users.map((user) => [user.user_id, user]))

  return rosters.map((roster) => {
    const owner = roster.owner_id ? usersById.get(roster.owner_id) : undefined
    return {
      rosterId: roster.roster_id,
      displayName: owner?.display_name ?? `Roster ${roster.roster_id}`,
      avatar: owner?.avatar ?? null,
    }
  })
}

/**
 * Determines whether a roster won, lost, or is still pending for a given week's
 * matchups, by comparing its points against the opponent sharing its matchup_id.
 * Equal points score as a loss for pick purposes (a tie doesn't keep you alive)
 * — adjust here if your pool rules should treat ties differently.
 */
export function computeResult(matchups: SleeperMatchup[], rosterId: number): PickResult {
  const mine = matchups.find((m) => m.roster_id === rosterId)
  if (!mine || mine.matchup_id === null) return 'pending'

  const opponent = matchups.find(
    (m) => m.matchup_id === mine.matchup_id && m.roster_id !== rosterId,
  )
  if (!opponent) return 'pending'

  // Sleeper reports 0 points for games that haven't started/been scored yet.
  if (mine.points === 0 && opponent.points === 0) return 'pending'

  return mine.points > opponent.points ? 'win' : 'loss'
}
