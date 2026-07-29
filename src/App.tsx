import { Navigate, Route, Routes, Link } from 'react-router-dom'
import { useAuth } from './lib/auth'
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
