import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { useAuth } from '../lib/useAuth'
import { supabase } from '../lib/supabase'
import { ok, fail, queueFrom } from '../test/mockSupabase'
import Profile from './Profile'

vi.mock('../lib/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn() } }))

function setup(results: Parameters<typeof queueFrom>[0]) {
  vi.mocked(useAuth).mockReturnValue({
    session: null,
    user: { id: 'u1' } as User,
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  })
  const { impl, chains } = queueFrom(results)
  vi.mocked(supabase.from).mockImplementation(impl as unknown as typeof supabase.from)
  render(<Profile />)
  return { chains }
}

describe('Profile', () => {
  it('loads and shows the current display name', async () => {
    setup([ok({ display_name: 'cma7g2' })])
    expect(await screen.findByDisplayValue('cma7g2')).toBeInTheDocument()
  })

  it('saves an updated display name', async () => {
    const user = userEvent.setup()
    const { chains } = setup([ok({ display_name: 'cma7g2' }), ok(null)])

    const input = await screen.findByDisplayValue('cma7g2')
    await user.clear(input)
    await user.type(input, 'chris')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    expect(chains[1].update).toHaveBeenCalledWith({ display_name: 'chris' })
    expect(chains[1].eq).toHaveBeenCalledWith('id', 'u1')
  })

  it('shows an error when saving fails', async () => {
    const user = userEvent.setup()
    setup([ok({ display_name: 'cma7g2' }), fail('permission denied')])

    const input = await screen.findByDisplayValue('cma7g2')
    await user.clear(input)
    await user.type(input, 'chris')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('permission denied')).toBeInTheDocument()
    expect(screen.queryByText('Saved.')).not.toBeInTheDocument()
  })

  it('disables saving a blank name', async () => {
    const user = userEvent.setup()
    setup([ok({ display_name: 'cma7g2' })])

    const input = await screen.findByDisplayValue('cma7g2')
    await user.clear(input)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled())
  })
})
