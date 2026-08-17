import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { supabase } from '../lib/supabase'
import { getMatchups } from '../lib/sleeper'
import { ok, fail, queueFrom } from '../test/mockSupabase'
import Leaderboard from './Leaderboard'

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../lib/sleeper', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/sleeper')>()
  return { ...actual, getMatchups: vi.fn() }
})

function setup(results: Parameters<typeof queueFrom>[0]) {
  const { impl } = queueFrom(results)
  vi.mocked(supabase.from).mockImplementation(impl as unknown as typeof supabase.from)
  render(<Leaderboard poolId="pool1" leagueId="league1" />)
}

describe('Leaderboard', () => {
  it('shows an empty state when nobody has joined', async () => {
    setup([ok([]), ok([])])
    expect(await screen.findByText('No one has joined this pool yet.')).toBeInTheDocument()
  })

  it('surfaces a load error', async () => {
    setup([fail('boom'), ok([])])
    expect(await screen.findByText('boom')).toBeInTheDocument()
  })

  it('sorts alive players first, then eliminated players most-recent-first', async () => {
    setup([
      ok([
        { user_id: 'alice', profiles: { display_name: 'Alice' } },
        { user_id: 'bob', profiles: { display_name: 'Bob' } },
        { user_id: 'carol', profiles: { display_name: 'Carol' } },
      ]),
      ok([
        { id: 'pk1', pool_id: 'pool1', user_id: 'alice', week: 1, sleeper_roster_id: 10, sleeper_manager_name: 'Mgr10', created_at: '' },
        { id: 'pk2', pool_id: 'pool1', user_id: 'alice', week: 2, sleeper_roster_id: 11, sleeper_manager_name: 'Mgr11', created_at: '' },
        { id: 'pk3', pool_id: 'pool1', user_id: 'bob', week: 1, sleeper_roster_id: 20, sleeper_manager_name: 'Mgr20', created_at: '' },
        { id: 'pk4', pool_id: 'pool1', user_id: 'bob', week: 2, sleeper_roster_id: 21, sleeper_manager_name: 'Mgr21', created_at: '' },
        { id: 'pk5', pool_id: 'pool1', user_id: 'carol', week: 1, sleeper_roster_id: 30, sleeper_manager_name: 'Mgr30', created_at: '' },
      ]),
    ])

    vi.mocked(getMatchups).mockImplementation((_leagueId, week) => {
      if (week === 1) {
        return Promise.resolve([
          { roster_id: 10, matchup_id: 1, points: 100 },
          { roster_id: 99, matchup_id: 1, points: 50 }, // alice wins wk1
          { roster_id: 20, matchup_id: 2, points: 80 },
          { roster_id: 98, matchup_id: 2, points: 70 }, // bob wins wk1
          { roster_id: 30, matchup_id: 3, points: 60 },
          { roster_id: 97, matchup_id: 3, points: 90 }, // carol loses wk1
        ])
      }
      return Promise.resolve([
        { roster_id: 11, matchup_id: 1, points: 100 },
        { roster_id: 96, matchup_id: 1, points: 50 }, // alice wins wk2
        { roster_id: 21, matchup_id: 2, points: 40 },
        { roster_id: 95, matchup_id: 2, points: 60 }, // bob loses wk2
      ])
    })

    expect(await screen.findByText('1 of 3 still alive')).toBeInTheDocument()

    const rows = screen.getAllByRole('row').slice(1) // drop header row
    expect(within(rows[0]).getByText('Alice')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Alive')).toBeInTheDocument()

    expect(within(rows[1]).getByText('Bob')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Wk 2')).toBeInTheDocument()

    expect(within(rows[2]).getByText('Carol')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Wk 1')).toBeInTheDocument()
  })
})
