import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Link,
  useLocation,
} from "react-router-dom";
import { useEffect, useState } from "react";

import UserDetailsPanel from './pages/UserDetailsPanel';
import Login from './pages/LoginPage';

// Layout with Sidebar + Top Navbar
function AdminLayout({ children }) {
  const location = useLocation();

  const getPageTitle = (path) => {
    switch (path) {
      case "/users":
        return "User Management";
      case "/wallets":
        return "Wallets";
      case "/withdrawals":
        return "Withdrawals";
      case "/settings":
        return "Settings";
      default:
        return "Dashboard";
    }
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-800 text-white p-4">
        <h1 className="text-2xl font-bold mb-6">NEFT Admin</h1>
        <nav className="space-y-4">
          <Link to="/" className="block hover:text-yellow-400">Dashboard</Link>
          <Link to="/users" className="block hover:text-yellow-400">Users</Link>
          <Link to="/wallets" className="block hover:text-yellow-400">Wallets</Link>
          <Link to="/withdrawals" className="block hover:text-yellow-400">Withdrawals</Link>
          <Link to="/settings" className="block hover:text-yellow-400">Settings</Link>
        </nav>
      </aside>

      {/* Top bar + Content */}
      <div className="flex-1 flex flex-col">
        <header className="bg-white shadow-md px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-800">{getPageTitle(location.pathname)}</h2>
          <div className="flex items-center space-x-4">
            <span className="text-gray-600 text-sm">Admin</span>
            <div className="w-9 h-9 rounded-full bg-gray-300 flex items-center justify-center font-bold text-gray-700">A</div>
          </div>
        </header>

        <main className="flex-1 bg-gray-100 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

// Route Guard
const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem("token");
  return token ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <Router>
      <Routes>
        {/* Public route */}
        <Route path="/login" element={<Login />} />

        {/* Protected routes inside layout */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AdminLayout>
                <p>Welcome to the Dashboard</p>
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute>
              <AdminLayout>
                <UserDetailsPanel />
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/wallets"
          element={
            <ProtectedRoute>
              <AdminLayout>
                <p>Wallets Page</p>
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/withdrawals"
          element={
            <ProtectedRoute>
              <AdminLayout>
                <p>Withdrawals Page</p>
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <AdminLayout>
                <p>Settings Page</p>
              </AdminLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
