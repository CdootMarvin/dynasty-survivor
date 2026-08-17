import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { useAuth } from '../lib/useAuth'
import { supabase } from '../lib/supabase'
import { ok, fail, queueFrom } from '../test/mockSupabase'
import Pools from './Pools'

vi.mock('../lib/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn() } }))

const USER = { id: 'u1' } as User

function setup(results: Parameters<typeof queueFrom>[0]) {
  vi.mocked(useAuth).mockReturnValue({
    session: null,
    user: USER,
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  })
  const { impl, chains } = queueFrom(results)
  vi.mocked(supabase.from).mockImplementation(impl as unknown as typeof supabase.from)
  render(
    <MemoryRouter>
      <Pools />
    </MemoryRouter>,
  )
  return { chains }
}

describe('Pools', () => {
  it('shows an empty state when the player has no pools', async () => {
    setup([ok([])])
    expect(await screen.findByText('No pools yet. Create or join one below.')).toBeInTheDocument()
  })

  it('lists the player\'s pools linking to their detail pages', async () => {
    setup([
      ok([
        { pools: { id: 'p1', name: 'Dynasty Duel', season: '2026' } },
        { pools: { id: 'p2', name: 'League of Doom', season: '2025' } },
      ]),
    ])

    expect(await screen.findByText('Dynasty Duel')).toBeInTheDocument()
    expect(screen.getByText('League of Doom')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Dynasty Duel/ })).toHaveAttribute(
      'href',
      '/pools/p1',
    )
  })

  it('surfaces a load error', async () => {
    setup([fail('network error')])
    expect(await screen.findByText('network error')).toBeInTheDocument()
  })

  it('creates a pool, joins the creator to it, and reloads the list', async () => {
    const user = userEvent.setup()
    const { chains } = setup([
      ok([]), // initial load
      ok({ id: 'p1' }), // pools insert
      ok(null), // pool_members insert
      ok([{ pools: { id: 'p1', name: 'New Pool', season: '2026' } }]), // reload
    ])

    await screen.findByText('No pools yet. Create or join one below.')

    await user.type(screen.getByLabelText('Pool name'), 'New Pool')
    await user.type(screen.getByLabelText('Sleeper league ID'), '12345')
    await user.click(screen.getByRole('button', { name: 'Create pool' }))

    await waitFor(() => expect(screen.getByText('New Pool')).toBeInTheDocument())

    expect(chains[1].insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'New Pool',
        sleeper_league_id: '12345',
        season_start_thursday: null,
        created_by: 'u1',
      }),
    )
    expect(chains[2].insert).toHaveBeenCalledWith({ pool_id: 'p1', user_id: 'u1' })
  })

  it('joins an existing pool by invite code', async () => {
    const user = userEvent.setup()
    const { chains } = setup([
      ok([]), // initial load
      ok({ id: 'p1' }), // invite code lookup
      ok(null), // pool_members insert
      ok([{ pools: { id: 'p1', name: 'Joined Pool', season: '2026' } }]), // reload
    ])

    await screen.findByText('No pools yet. Create or join one below.')

    await user.type(screen.getByLabelText('Invite code'), 'abc123')
    await user.click(screen.getByRole('button', { name: 'Join pool' }))

    await waitFor(() => expect(screen.getByText('Joined Pool')).toBeInTheDocument())

    expect(chains[1].eq).toHaveBeenCalledWith('invite_code', 'abc123')
    expect(chains[2].insert).toHaveBeenCalledWith({ pool_id: 'p1', user_id: 'u1' })
  })

  it('shows an error when the invite code does not match a pool', async () => {
    const user = userEvent.setup()
    setup([ok([]), fail('not found')])

    await screen.findByText('No pools yet. Create or join one below.')
    await user.type(screen.getByLabelText('Invite code'), 'bogus')
    await user.click(screen.getByRole('button', { name: 'Join pool' }))

    expect(await screen.findByText('No pool found with that invite code')).toBeInTheDocument()
  })
})
