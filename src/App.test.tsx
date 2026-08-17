import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { useAuth } from './lib/useAuth'
import App from './App'

vi.mock('./lib/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('./pages/Pools', () => ({ default: () => <div>POOLS_PAGE</div> }))
vi.mock('./pages/PoolDetail', () => ({ default: () => <div>POOL_DETAIL_PAGE</div> }))

function mockAuth(overrides: Partial<ReturnType<typeof useAuth>>) {
  vi.mocked(useAuth).mockReturnValue({
    session: null,
    user: null,
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
    ...overrides,
  })
}

describe('App', () => {
  it('shows nothing but the brand while auth is loading', () => {
    mockAuth({ loading: true })
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.queryByText('Sign in')).not.toBeInTheDocument()
    expect(screen.queryByText('Sign out')).not.toBeInTheDocument()
  })

  it('redirects an unauthenticated visitor from "/" to the login page', () => {
    mockAuth({ user: null })
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByText('Sign in', { selector: 'a' })).toBeInTheDocument()
  })

  it('renders the protected page for an authenticated visitor', () => {
    mockAuth({ user: { id: 'u1' } as User })
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByText('POOLS_PAGE')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('renders the pool detail route for an authenticated visitor', () => {
    mockAuth({ user: { id: 'u1' } as User })
    render(
      <MemoryRouter initialEntries={['/pools/abc']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByText('POOL_DETAIL_PAGE')).toBeInTheDocument()
  })
})
