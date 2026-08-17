import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SleeperMatchup, SleeperRoster, SleeperUser } from '../types'
import { computeResult, getLeagueManagers, getMatchups } from './sleeper'

describe('computeResult', () => {
  it('is a win when the picked roster scores more than its opponent', () => {
    const matchups: SleeperMatchup[] = [
      { roster_id: 1, matchup_id: 1, points: 120.5 },
      { roster_id: 2, matchup_id: 1, points: 99.2 },
    ]
    expect(computeResult(matchups, 1)).toBe('win')
  })

  it('is a loss when the picked roster scores less than its opponent', () => {
    const matchups: SleeperMatchup[] = [
      { roster_id: 1, matchup_id: 1, points: 90 },
      { roster_id: 2, matchup_id: 1, points: 100 },
    ]
    expect(computeResult(matchups, 1)).toBe('loss')
  })

  it('counts an exact tie as a loss for the picker', () => {
    const matchups: SleeperMatchup[] = [
      { roster_id: 1, matchup_id: 1, points: 87 },
      { roster_id: 2, matchup_id: 1, points: 87 },
    ]
    expect(computeResult(matchups, 1)).toBe('loss')
  })

  it('is pending when both scores are still zero (game not started/scored)', () => {
    const matchups: SleeperMatchup[] = [
      { roster_id: 1, matchup_id: 1, points: 0 },
      { roster_id: 2, matchup_id: 1, points: 0 },
    ]
    expect(computeResult(matchups, 1)).toBe('pending')
  })

  it('is pending when the roster is not in this week\'s matchups', () => {
    const matchups: SleeperMatchup[] = [
      { roster_id: 2, matchup_id: 1, points: 50 },
      { roster_id: 3, matchup_id: 1, points: 20 },
    ]
    expect(computeResult(matchups, 1)).toBe('pending')
  })

  it('is pending when the roster has no matchup_id (bye or no matchup yet)', () => {
    const matchups: SleeperMatchup[] = [{ roster_id: 1, matchup_id: null, points: 0 }]
    expect(computeResult(matchups, 1)).toBe('pending')
  })

  it('is pending when no opponent shares the matchup_id', () => {
    const matchups: SleeperMatchup[] = [{ roster_id: 1, matchup_id: 1, points: 40 }]
    expect(computeResult(matchups, 1)).toBe('pending')
  })
})

describe('getLeagueManagers', () => {
  const rosters: SleeperRoster[] = [
    { roster_id: 1, owner_id: 'u1' },
    { roster_id: 2, owner_id: 'u2' },
    { roster_id: 3, owner_id: null },
    { roster_id: 4, owner_id: 'u-missing' },
  ]
  const users: SleeperUser[] = [
    { user_id: 'u1', display_name: 'Alice', avatar: 'a1' },
    { user_id: 'u2', display_name: 'Bob', avatar: null },
  ]

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('joins rosters to their owning user', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/rosters')) return jsonResponse(rosters)
      if (url.includes('/users')) return jsonResponse(users)
      throw new Error(`unexpected url: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const managers = await getLeagueManagers('league1')

    expect(managers).toEqual([
      { rosterId: 1, displayName: 'Alice', avatar: 'a1' },
      { rosterId: 2, displayName: 'Bob', avatar: null },
      { rosterId: 3, displayName: 'Roster 3', avatar: null },
      { rosterId: 4, displayName: 'Roster 4', avatar: null },
    ])
  })
})

describe('sleeperGet (via getMatchups)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('throws with status and path when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 404 } as Response)),
    )

    await expect(getMatchups('league1', 3)).rejects.toThrow(
      'Sleeper API request failed (404): /league/league1/matchups/3',
    )
  })

  it('returns parsed JSON on success', async () => {
    const matchups: SleeperMatchup[] = [{ roster_id: 1, matchup_id: 1, points: 10 }]
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse(matchups)))

    await expect(getMatchups('league1', 3)).resolves.toEqual(matchups)
  })
})

function jsonResponse(body: unknown): Promise<Response> {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response)
}
