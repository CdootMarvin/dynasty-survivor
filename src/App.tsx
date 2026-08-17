import { Navigate, Route, Routes, Link } from 'react-router-dom'
import { useAuth } from './lib/useAuth'
import Login from './pages/Login'
import Pools from './pages/Pools'
import PoolDetail from './pages/PoolDetail'
import './App.css'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="page">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

function App() {
  const { user, signOut, loading } = useAuth()

  return (
    <>
      <nav className="navbar">
        <Link to="/" className="brand">
          <svg className="brand-icon" viewBox="0 0 48 48" aria-hidden="true">
            <ellipse cx="24" cy="24" rx="22" ry="12.5" fill="currentColor" />
            <g stroke="var(--bg)" strokeWidth="1.8" strokeLinecap="round">
              <line x1="13" y1="24" x2="35" y2="24" />
              <line x1="17.5" y1="20.5" x2="17.5" y2="27.5" />
              <line x1="21.7" y1="20.5" x2="21.7" y2="27.5" />
              <line x1="26.3" y1="20.5" x2="26.3" y2="27.5" />
              <line x1="30.5" y1="20.5" x2="30.5" y2="27.5" />
            </g>
          </svg>
          Dynasty Survivor
        </Link>
        {!loading && (
          <span>
            {user ? (
              <button type="button" onClick={signOut}>
                Sign out
              </button>
            ) : (
              <Link to="/login">Sign in</Link>
            )}
          </span>
        )}
      </nav>

      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Pools />
            </RequireAuth>
          }
        />
        <Route
          path="/pools/:poolId"
          element={
            <RequireAuth>
              <PoolDetail />
            </RequireAuth>
          }
        />
      </Routes>
    </>
  )
}

export default App
