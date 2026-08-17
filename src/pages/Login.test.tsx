import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { useAuth } from '../lib/useAuth'
import Login from './Login'

vi.mock('../lib/useAuth', () => ({ useAuth: vi.fn() }))

function mockAuth(signInWithEmail: (email: string) => Promise<{ error: string | null }>) {
  vi.mocked(useAuth).mockReturnValue({
    session: null,
    user: null,
    loading: false,
    signInWithEmail,
    signOut: vi.fn(),
  })
}

describe('Login', () => {
  it('sends a magic link and shows the confirmation screen', async () => {
    const user = userEvent.setup()
    const signInWithEmail = vi.fn().mockResolvedValue({ error: null })
    mockAuth(signInWithEmail)

    render(<Login />)

    await user.type(screen.getByLabelText('Email'), 'player@example.com')
    await user.click(screen.getByRole('button', { name: 'Send magic link' }))

    expect(signInWithEmail).toHaveBeenCalledWith('player@example.com')
    expect(await screen.findByText('Check your email')).toBeInTheDocument()
    expect(screen.getByText('player@example.com')).toBeInTheDocument()
  })

  it('shows an error message and stays on the form when sign-in fails', async () => {
    const user = userEvent.setup()
    const signInWithEmail = vi.fn().mockResolvedValue({ error: 'Rate limit exceeded' })
    mockAuth(signInWithEmail)

    render(<Login />)

    await user.type(screen.getByLabelText('Email'), 'player@example.com')
    await user.click(screen.getByRole('button', { name: 'Send magic link' }))

    expect(await screen.findByText('Rate limit exceeded')).toBeInTheDocument()
    expect(screen.queryByText('Check your email')).not.toBeInTheDocument()
  })

  it('disables the submit button while the request is in flight', async () => {
    const user = userEvent.setup()
    let resolveSignIn: (r: { error: string | null }) => void
    const signInWithEmail = vi.fn(
      () => new Promise<{ error: string | null }>((resolve) => (resolveSignIn = resolve)),
    )
    mockAuth(signInWithEmail)

    render(<Login />)
    await user.type(screen.getByLabelText('Email'), 'player@example.com')
    await user.click(screen.getByRole('button', { name: 'Send magic link' }))

    const button = await screen.findByRole('button', { name: 'Sending…' })
    expect(button).toBeDisabled()

    resolveSignIn!({ error: null })
    await waitFor(() => expect(screen.getByText('Check your email')).toBeInTheDocument())
  })
})
