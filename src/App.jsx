import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import AdminLayout from './components/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import UserManagement from './pages/admin/UserManagement';
import PDVAssignment from './pages/admin/PDVAssignment';
import ExecutiveHome from './pages/executive/ExecutiveHome';
import ExecutiveRouteMap from './pages/executive/ExecutiveRouteMap';
import VisitDetail from './pages/executive/VisitDetail';
import VisitForm from './pages/executive/VisitForm';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

// Protected Route Component
const ProtectedRoute = ({ children, role }) => {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (role && user.role !== role) {
    // Redirect to their appropriate home if trying to access wrong area
    return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/executive/home'} replace />;
  }

  return children;
};

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Login />} />

            {/* Admin Routes */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute role="admin">
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="users" element={<UserManagement />} />
              <Route path="assignments" element={<PDVAssignment />} />
            </Route>

            {/* Executive Routes */}
            <Route
              path="/executive/home"
              element={
                <ProtectedRoute role="executive">
                  <ExecutiveHome />
                </ProtectedRoute>
              }
            />
            <Route
              path="/executive/map"
              element={
                <ProtectedRoute role="executive">
                  <ExecutiveRouteMap />
                </ProtectedRoute>
              }
            />
            <Route
              path="/executive/visit/:id"
              element={
                <ProtectedRoute role="executive">
                  <VisitDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/executive/visit/:id/form"
              element={
                <ProtectedRoute role="executive">
                  <VisitForm />
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
