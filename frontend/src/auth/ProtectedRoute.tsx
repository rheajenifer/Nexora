import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

export default function ProtectedRoute() {
  const { user, loading, configured } = useAuth()
  const location = useLocation()
  if (loading) return <div className="grid min-h-screen place-items-center bg-[#f7f8fc] text-sm text-slate-500">Checking your session…</div>
  if (!configured) return <Navigate to="/login" replace state={{ from: location.pathname, configurationMissing: true }} />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}
