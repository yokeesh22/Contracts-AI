import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Navbar from './components/Navbar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import PlaybookManager from './pages/PlaybookManager'
import ContractReviews from './pages/ContractReviews'
import ReviewDetail from './pages/ReviewDetail'
import UserManagement from './pages/UserManagement'

function ProtectedLayout() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1">
        <Routes>
          <Route path="/"             element={<Dashboard />} />
          <Route path="/playbook"     element={<PlaybookManager />} />
          <Route path="/reviews"      element={<ContractReviews />} />
          <Route path="/reviews/:id"  element={<ReviewDetail />} />
          <Route path="/users"        element={<UserManagement />} />
          {/* Legacy paths from the deviation-analyzer layout this replaced */}
          <Route path="/specifications" element={<Navigate to="/playbook" replace />} />
          <Route path="/analysis"       element={<Navigate to="/reviews" replace />} />
          <Route path="/analysis/:id"   element={<Navigate to="/reviews" replace />} />
          <Route path="*"               element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <Login />}
      />
      <Route path="/*" element={<ProtectedLayout />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
