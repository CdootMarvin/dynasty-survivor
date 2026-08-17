import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../lib/useAuth'
import { supabase } from '../lib/supabase'
import { getLeagueManagers, getMatchups, getNflState } from '../lib/sleeper'
import { ok, fail, queueFrom, type QueryResult } from '../test/mockSupabase'
import type { LeagueManager } from '../lib/sleeper'
import type { Pick, Pool, SleeperMatchup } from '../types'
import PoolDetail from './PoolDetail'

vi.mock('../lib/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../lib/sleeper', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/sleeper')>()
  return { ...actual, getLeagueManagers: vi.fn(), getMatchups: vi.fn(), getNflState: vi.fn() }
})
vi.mock('../components/Leaderboard', () => ({ default: () => <div>LEADERBOARD</div> }))

const BASE_POOL: Pool = {
  id: 'p1',
  name: 'Test Pool',
  sleeper_league_id: 'L1',
  season: '2026',
  invite_code: 'abc123',
  created_by: 'creator-id',
  created_at: '',
  season_start_thursday: null,
}

const BASE_MANAGERS: LeagueManager[] = [
  { rosterId: 1, displayName: 'Mgr A', avatar: null },
  { rosterId: 2, displayName: 'Mgr B', avatar: null },
]

function renderPoolDetail(options: {
  route?: string
  pool?: Partial<Pool>
  picks?: Pick[]
  managers?: LeagueManager[]
  nflWeek?: number
  matchupsByWeek?: Record<number, SleeperMatchup[]>
  extraFromResults?: QueryResult[]
  userId?: string
  seasonType?: 'pre' | 'regular' | 'post'
}) {
  const {
    route = '/pools/p1',
    pool = {},
    picks = [],
    managers = BASE_MANAGERS,
    nflWeek = 5,
    matchupsByWeek = {},
    extraFromResults = [],
    userId = 'u1',
    seasonType = 'regular',
  } = options

  vi.mocked(useAuth).mockReturnValue({
    session: null,
    user: { id: userId } as User,
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  })
  vi.mocked(getLeagueManagers).mockResolvedValue(managers)
  vi.mocked(getNflState).mockResolvedValue({ week: nflWeek, season: '2026', season_type: seasonType })
  vi.mocked(getMatchups).mockImplementation((_league, week) =>
    Promise.resolve(matchupsByWeek[week] ?? []),
  )

  const { impl, chains } = queueFrom([ok({ ...BASE_POOL, ...pool }), ok(picks), ...extraFromResults])
  vi.mocked(supabase.from).mockImplementation(impl as unknown as typeof supabase.from)

  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/" element={<div>HOME</div>} />
        <Route path="/pools/:poolId" element={<PoolDetail />} />
      </Routes>
    </MemoryRouter>,
  )
  return { chains }
}

describe('PoolDetail', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the pick form when no pick has been made and nothing is locked', async () => {
    renderPoolDetail({})

    expect(await screen.findByRole('heading', { name: 'Test Pool' })).toBeInTheDocument()
    expect(screen.getByText('Week 5')).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Mgr A' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Mgr B' })).toBeInTheDocument()
    expect(screen.queryByText("You've already picked for this week.")).not.toBeInTheDocument()
    expect(screen.queryByText('Edit pool settings')).not.toBeInTheDocument()
  })

  it('shows an editable, pre-filled pick when a pick already exists for the current week', async () => {
    renderPoolDetail({
      picks: [
        {
          id: 'pk1',
          pool_id: 'p1',
          user_id: 'u1',
          week: 5,
          sleeper_roster_id: 1,
          sleeper_manager_name: 'Mgr A',
          created_at: '',
        },
      ],
    })

    expect(
      await screen.findByText((_, el) => el?.textContent === 'You picked Mgr A for this week. You can change it until picks lock.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveValue('1')
    expect(screen.getByRole('button', { name: 'Update pick' })).toBeInTheDocument()
    // The manager already picked this week must remain selectable (not filtered out).
    expect(screen.getByRole('option', { name: 'Mgr A' })).toBeInTheDocument()
  })

  it('excludes managers used in other weeks this half, but not the current week\'s own pick', async () => {
    renderPoolDetail({
      managers: [
        { rosterId: 1, displayName: 'Mgr A', avatar: null },
        { rosterId: 2, displayName: 'Mgr B', avatar: null },
        { rosterId: 3, displayName: 'Mgr C', avatar: null },
      ],
      picks: [
        {
          id: 'pk1',
          pool_id: 'p1',
          user_id: 'u1',
          week: 5,
          sleeper_roster_id: 1,
          sleeper_manager_name: 'Mgr A',
          created_at: '',
        },
        {
          id: 'pk2',
          pool_id: 'p1',
          user_id: 'u1',
          week: 4,
          sleeper_roster_id: 2,
          sleeper_manager_name: 'Mgr B',
          created_at: '',
        },
      ],
    })

    await screen.findByRole('combobox')
    expect(screen.getByRole('option', { name: 'Mgr A' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Mgr B' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Mgr C' })).toBeInTheDocument()
  })

  it('shows the eliminated banner once a past pick lost its matchup', async () => {
    renderPoolDetail({
      picks: [
        {
          id: 'pk1',
          pool_id: 'p1',
          user_id: 'u1',
          week: 1,
          sleeper_roster_id: 99,
          sleeper_manager_name: 'Doomed Manager',
          created_at: '',
        },
      ],
      matchupsByWeek: {
        1: [
          { roster_id: 99, matchup_id: 1, points: 10 },
          { roster_id: 100, matchup_id: 1, points: 50 },
        ],
      },
    })

    expect(
      await screen.findByText((_, el) => el?.textContent === 'You were eliminated in Week 1 — Doomed Manager lost that week\'s matchup.'),
    ).toBeInTheDocument()
  })

  it('shows the locked banner once the week\'s pick deadline has passed', async () => {
    renderPoolDetail({
      pool: { season_start_thursday: '2020-01-02' }, // week 1 lock is long in the past
      nflWeek: 1,
    })

    expect(
      await screen.findByText("Picks are locked for this week — you didn't get a pick in before kickoff."),
    ).toBeInTheDocument()
  })

  it('shows what you picked, not an editable form, once locked with a pick already in', async () => {
    renderPoolDetail({
      pool: { season_start_thursday: '2020-01-02' }, // week 1 lock is long in the past
      nflWeek: 1,
      picks: [
        {
          id: 'pk1',
          pool_id: 'p1',
          user_id: 'u1',
          week: 1,
          sleeper_roster_id: 1,
          sleeper_manager_name: 'Mgr A',
          created_at: '',
        },
      ],
    })

    expect(
      await screen.findByText((_, el) => el?.textContent === 'Picks are locked for this week — you picked Mgr A.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('honors the ?week= override and shows the testing-mode hint', async () => {
    renderPoolDetail({ route: '/pools/p1?week=3', nflWeek: 0 })

    expect(await screen.findByText('Week 3')).toBeInTheDocument()
    expect(
      screen.getByText('Testing mode: viewing week 3 instead of the live week.'),
    ).toBeInTheDocument()
  })

  it('does not open picking during the pre-season, even if Sleeper reports a non-zero week', async () => {
    // Regression: Sleeper's /state/nfl can report e.g. week: 2 while season_type is still "pre",
    // which would otherwise open picking (and skip week 1 entirely) before the season starts.
    renderPoolDetail({ nflWeek: 2, seasonType: 'pre' })

    expect(await screen.findByText('Picks open once the regular season starts.')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByText('Week 2')).not.toBeInTheDocument()
  })

  it('shows settings/delete controls only to the pool creator', async () => {
    renderPoolDetail({ pool: { created_by: 'u1' }, userId: 'u1' })
    expect(await screen.findByText('Edit pool settings')).toBeInTheDocument()
    expect(screen.getByText('Delete pool')).toBeInTheDocument()
  })

  it('deletes the pool after confirmation and navigates home', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const { chains } = renderPoolDetail({
      pool: { created_by: 'u1' },
      userId: 'u1',
      extraFromResults: [ok(null)], // pools delete
    })

    await user.click(await screen.findByText('Delete pool'))

    expect(window.confirm).toHaveBeenCalled()
    await waitFor(() => expect(screen.getByText('HOME')).toBeInTheDocument())
    expect(chains[2].delete).toHaveBeenCalled()
    expect(chains[2].eq).toHaveBeenCalledWith('id', 'p1')
  })

  it('submits a new pick and switches the form into edit mode', async () => {
    const user = userEvent.setup()
    const { chains } = renderPoolDetail({
      extraFromResults: [
        ok({
          id: 'newpick',
          pool_id: 'p1',
          user_id: 'u1',
          week: 5,
          sleeper_roster_id: 1,
          sleeper_manager_name: 'Mgr A',
          created_at: '',
        }),
      ],
    })

    await screen.findByRole('combobox')
    const select = screen.getByRole('combobox')
    await user.selectOptions(select, '1')
    await user.click(screen.getByRole('button', { name: 'Lock in pick' }))

    expect(await screen.findByRole('button', { name: 'Update pick' })).toBeInTheDocument()
    expect(select).toHaveValue('1')
    expect(chains[2].insert).toHaveBeenCalledWith(
      expect.objectContaining({
        pool_id: 'p1',
        user_id: 'u1',
        week: 5,
        sleeper_roster_id: 1,
        sleeper_manager_name: 'Mgr A',
      }),
    )
  })

  it('updates an existing pick before lock instead of inserting a new one', async () => {
    const user = userEvent.setup()
    const { chains } = renderPoolDetail({
      picks: [
        {
          id: 'pk1',
          pool_id: 'p1',
          user_id: 'u1',
          week: 5,
          sleeper_roster_id: 1,
          sleeper_manager_name: 'Mgr A',
          created_at: '',
        },
      ],
      extraFromResults: [
        ok({
          id: 'pk1',
          pool_id: 'p1',
          user_id: 'u1',
          week: 5,
          sleeper_roster_id: 2,
          sleeper_manager_name: 'Mgr B',
          created_at: '',
        }),
      ],
    })

    const select = await screen.findByRole('combobox')
    expect(select).toHaveValue('1')
    await user.selectOptions(select, '2')
    await user.click(screen.getByRole('button', { name: 'Update pick' }))

    expect(
      await screen.findByText((_, el) => el?.textContent === 'You picked Mgr B for this week. You can change it until picks lock.'),
    ).toBeInTheDocument()
    expect(chains[2].update).toHaveBeenCalledWith({
      sleeper_roster_id: 2,
      sleeper_manager_name: 'Mgr B',
    })
    expect(chains[2].eq).toHaveBeenCalledWith('id', 'pk1')
  })

  it('saves edited pool settings and reflects them in the UI', async () => {
    const user = userEvent.setup()
    const { chains } = renderPoolDetail({
      pool: { created_by: 'u1' },
      userId: 'u1',
      extraFromResults: [
        ok({
          ...BASE_POOL,
          created_by: 'u1',
          name: 'Updated Pool Name',
          season_start_thursday: '2026-09-03',
        }),
      ],
    })

    await user.click(await screen.findByText('Edit pool settings'))

    const nameInput = screen.getByLabelText('Pool name')
    expect(nameInput).toHaveValue('Test Pool')
    await user.clear(nameInput)
    await user.type(nameInput, 'Updated Pool Name')

    const lockDayInput = screen.getByLabelText('Week 1 Thursday (kickoff lock day)')
    fireEvent.change(lockDayInput, { target: { value: '2026-09-03' } })

    await user.click(screen.getByRole('button', { name: 'Save settings' }))

    expect(chains[2].update).toHaveBeenCalledWith({
      name: 'Updated Pool Name',
      sleeper_league_id: 'L1',
      season: '2026',
      season_start_thursday: '2026-09-03',
    })
    expect(chains[2].eq).toHaveBeenCalledWith('id', 'p1')

    expect(await screen.findByRole('heading', { name: 'Updated Pool Name' })).toBeInTheDocument()
    expect(screen.getByText('Edit pool settings')).toBeInTheDocument()
    expect(screen.queryByLabelText('Pool name')).not.toBeInTheDocument()
  })

  it('shows an error and keeps the form open when saving settings fails', async () => {
    const user = userEvent.setup()
    renderPoolDetail({
      pool: { created_by: 'u1' },
      userId: 'u1',
      extraFromResults: [fail('permission denied')],
    })

    await user.click(await screen.findByText('Edit pool settings'))
    await user.click(screen.getByRole('button', { name: 'Save settings' }))

    expect(await screen.findByText('permission denied')).toBeInTheDocument()
    expect(screen.getByLabelText('Pool name')).toBeInTheDocument()
  })
})
