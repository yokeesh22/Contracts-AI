import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Navbar from './components/Navbar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import SpecificationManager from './pages/SpecificationManager'
import DeviationAnalyzer from './pages/DeviationAnalyzer'
import AnalysisDetail from './pages/AnalysisDetail'
import UserManagement from './pages/UserManagement'

function ProtectedLayout() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1">
        <Routes>
          <Route path="/"               element={<Dashboard />} />
          <Route path="/specifications" element={<SpecificationManager />} />
          <Route path="/analysis"       element={<DeviationAnalyzer />} />
          <Route path="/analysis/:id"   element={<AnalysisDetail />} />
          <Route path="/users"          element={<UserManagement />} />
          {/* Legacy paths from the old 3-page layout */}
          <Route path="/analyze"        element={<Navigate to="/analysis" replace />} />
          <Route path="/transactions"   element={<Navigate to="/analysis" replace />} />
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
