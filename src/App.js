import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Link,
  useLocation,
} from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast, { Toaster } from "react-hot-toast";

import UserDetailsPanel from "./pages/UserDetailsPanel";
import Login from "./pages/LoginPage";
import WithdrawalsPage from "./pages/WithdrawalsPage";
import WalletsPage from "./pages/WalletsPage";
import ReferralPage from "./pages/ReferralPage";
import DashboardPage from "./pages/DashboardPage";
import SettingsPage from "./pages/SettingsPage";
import DepositsPage from "./pages/DepositsPage";
import SpotAdminPage from "./pages/SpotAdminPage";
import AdminKycPage from "./pages/AdminKycPage";
import MarketOverridePage from "./pages/MarketOverridePage";
import AdminWireSettingsPage from "./pages/AdminWireSettingsPage";
import AdminChatPage from "./pages/AdminChatPage";

const RECENT_TABS_STORAGE_KEY = "bitx_admin_recent_tabs_v1";
const SESSION_STARTED_AT_KEY = "bitx_admin_session_started_at";

const MAX_RECENT_TABS = 12;
const SESSION_DURATION_MS = 60 * 60 * 1000;
const SESSION_WARNING_MS = 5 * 60 * 1000;

const navGroups = [
  {
    title: "Overview",
    items: [
      {
        to: "/",
        label: "Dashboard",
        icon: "M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z",
      },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        to: "/users",
        label: "Users",
        icon: "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3ZM8 11c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3Zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13Zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5Z",
      },
      {
        to: "/kyc",
        label: "KYC",
        icon: "M12 2 4 5v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V5l-8-3Zm-1 15-4-4 1.41-1.41L11 14.17l5.59-5.59L18 10l-7 7Z",
      },
      {
        to: "/referrals",
        label: "Referrals",
        icon: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4Zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Zm7-2v-2h3V7h-3V4h-3v3h-3v3h3v2h3Z",
      },
    ],
  },
  {
    title: "Finance",
    items: [
      {
        to: "/wallets",
        label: "Wallets",
        icon: "M21 7H3V5h18v2Zm0 2v10H3V9h18Zm-5 3v4h3v-4h-3Z",
      },
      {
        to: "/withdrawals",
        label: "Withdrawals",
        icon: "M12 2 4 7v6c0 4.55 3.07 8.79 8 10 4.93-1.21 8-5.45 8-10V7l-8-5Zm1 5v5h4l-5 6-5-6h4V7h2Z",
      },
      {
        to: "/deposits",
        label: "Deposits",
        icon: "M11 17h2v-5h4l-5-6-5 6h4v5Zm-7 4h16v-2H4v2Z",
      },
      {
        to: "/wire-settings",
        label: "Wire Settings",
        icon: "M4 4h16v4H4V4Zm0 6h16v10H4V10Zm3 3v2h6v-2H7Zm0 4v1h10v-1H7Z",
      },
    ],
  },
  {
    title: "Trading",
    items: [
      {
        to: "/spot",
        label: "Spot",
        icon: "M3 17h2v-7H3v7Zm4 0h2V7H7v10Zm4 0h2v-4h-2v4Zm4 0h2V4h-2v13Zm4 0h2v-9h-2v9Z",
      },
      {
        to: "/market-override",
        label: "Market Override",
        icon: "M4 18h4l10-10-4-4L4 14v4Zm13.7-11.7 1.4-1.4c.4-.4.4-1 0-1.4l-.6-.6c-.4-.4-1-.4-1.4 0l-1.4 1.4 2 2Z",
      },
    ],
  },
  {
    title: "Support",
    items: [
      {
        to: "/chat",
        label: "Chat Support",
        icon: "M4 4h16v12H5.17L4 17.17V4Zm2 2v8h12V6H6Zm1 2h10v2H7V8Zm0 3h7v2H7v-2Z",
      },
    ],
  },
  {
    title: "System",
    items: [
      {
        to: "/settings",
        label: "Airdrop",
        icon: "M12 2 2 7l10 5 10-5-10-5Zm0 7.7L6.5 7 12 4.3 17.5 7 12 9.7ZM2 17l10 5 10-5v-3l-10 5-10-5v3Zm0-5 10 5 10-5V9l-10 5L2 9v3Z",
      },
    ],
  },
];

const navItems = navGroups.flatMap((group) => group.items);

const TAB_LABELS = navItems.reduce((acc, item) => {
  acc[item.to] = item.label;
  return acc;
}, {});

const PAGE_TITLES = {
  "/": "Dashboard",
  "/users": "User Management",
  "/kyc": "KYC Verification",
  "/wallets": "Wallets",
  "/withdrawals": "Withdrawals",
  "/deposits": "Deposits",
  "/spot": "Spot Trading",
  "/market-override": "Market Override",
  "/settings": "Airdrop Management",
  "/chat": "Customer Support",
  "/wire-settings": "Wire Settings",
  "/referrals": "Referrals",
};

function Icon({ path }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 fill-current">
      <path d={path} />
    </svg>
  );
}

function isTrackableAdminPath(pathname) {
  return pathname !== "/login";
}

function getTabLabel(pathname) {
  return TAB_LABELS[pathname] || PAGE_TITLES[pathname] || "Page";
}

function loadRecentTabs() {
  try {
    const raw = localStorage.getItem(RECENT_TABS_STORAGE_KEY);
    const parsed = JSON.parse(raw || "[]");

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((tab) => tab && typeof tab.path === "string")
      .filter((tab) => isTrackableAdminPath(tab.path))
      .map((tab) => ({
        path: tab.path,
        label: TAB_LABELS[tab.path] || tab.label || getTabLabel(tab.path),
      }))
      .slice(0, MAX_RECENT_TABS);
  } catch {
    return [];
  }
}

function saveRecentTabs(tabs) {
  try {
    localStorage.setItem(RECENT_TABS_STORAGE_KEY, JSON.stringify(tabs));
  } catch {
    // ignore localStorage errors
  }
}

function moveTab(list, fromIndex, toIndex) {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= list.length ||
    toIndex >= list.length ||
    fromIndex === toIndex
  ) {
    return list;
  }

  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function formatTimeLeft(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0"
  )}`;
}

function AdminLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [recentTabs, setRecentTabs] = useState(() => loadRecentTabs());
  const [draggingPath, setDraggingPath] = useState(null);
  const [dragOverPath, setDragOverPath] = useState(null);

  const [routeLoading, setRouteLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const [timeLeft, setTimeLeft] = useState(SESSION_DURATION_MS);
  const [sessionWarningShown, setSessionWarningShown] = useState(false);

  const dragMovedRef = useRef(false);
  const progressTimerOneRef = useRef(null);
  const progressTimerTwoRef = useRef(null);
  const progressTimerThreeRef = useRef(null);

  const isSessionWarning = timeLeft <= SESSION_WARNING_MS;

  const clearSessionAndGoLogin = useCallback(
    (message) => {
      localStorage.removeItem("token");
      localStorage.removeItem(SESSION_STARTED_AT_KEY);

      if (message) {
        toast.error(message);
      }

      navigate("/login");
    },
    [navigate]
  );

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem(SESSION_STARTED_AT_KEY);
    toast.success("Logged out successfully");
    navigate("/login");
  };

  function extendSession() {
    localStorage.setItem(SESSION_STARTED_AT_KEY, String(Date.now()));
    setTimeLeft(SESSION_DURATION_MS);
    setSessionWarningShown(false);
    toast.success("Session extended");
  }

  useEffect(() => {
    if (!isTrackableAdminPath(location.pathname)) return;

    const newTab = {
      path: location.pathname,
      label: getTabLabel(location.pathname),
    };

    setRecentTabs((prev) => {
      const alreadyExists = prev.some((tab) => tab.path === newTab.path);

      if (alreadyExists) {
        return prev;
      }

      const nextTabs = [...prev, newTab].slice(0, MAX_RECENT_TABS);
      saveRecentTabs(nextTabs);
      return nextTabs;
    });
  }, [location.pathname]);

  useEffect(() => {
    function onStorage(e) {
      if (!e || e.key === RECENT_TABS_STORAGE_KEY) {
        setRecentTabs(loadRecentTabs());
      }
    }

    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    setRouteLoading(true);
    setProgress(25);

    if (progressTimerOneRef.current) clearTimeout(progressTimerOneRef.current);
    if (progressTimerTwoRef.current) clearTimeout(progressTimerTwoRef.current);
    if (progressTimerThreeRef.current)
      clearTimeout(progressTimerThreeRef.current);

    progressTimerOneRef.current = setTimeout(() => {
      setProgress(65);
    }, 120);

    progressTimerTwoRef.current = setTimeout(() => {
      setProgress(100);
    }, 260);

    progressTimerThreeRef.current = setTimeout(() => {
      setRouteLoading(false);
      setProgress(0);
    }, 520);

    return () => {
      if (progressTimerOneRef.current)
        clearTimeout(progressTimerOneRef.current);
      if (progressTimerTwoRef.current)
        clearTimeout(progressTimerTwoRef.current);
      if (progressTimerThreeRef.current)
        clearTimeout(progressTimerThreeRef.current);
    };
  }, [location.pathname]);

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token || location.pathname === "/login") {
      return;
    }

    let startedAt = Number(localStorage.getItem(SESSION_STARTED_AT_KEY));

    if (!startedAt || Number.isNaN(startedAt)) {
      startedAt = Date.now();
      localStorage.setItem(SESSION_STARTED_AT_KEY, String(startedAt));
    }

    function updateSessionTimer() {
      const currentStartedAt = Number(
        localStorage.getItem(SESSION_STARTED_AT_KEY)
      );

      const safeStartedAt =
        currentStartedAt && !Number.isNaN(currentStartedAt)
          ? currentStartedAt
          : Date.now();

      const expiresAt = safeStartedAt + SESSION_DURATION_MS;
      const remaining = expiresAt - Date.now();

      setTimeLeft(Math.max(0, remaining));

      if (remaining <= 0) {
        clearSessionAndGoLogin("Session expired. Please login again.");
        return;
      }

      if (remaining <= SESSION_WARNING_MS && !sessionWarningShown) {
        setSessionWarningShown(true);
        toast.error("Admin session expires soon");
      }
    }

    updateSessionTimer();

    const timer = setInterval(updateSessionTimer, 1000);

    return () => clearInterval(timer);
  }, [location.pathname, sessionWarningShown, clearSessionAndGoLogin]);

  function handleTabClick(path) {
    if (dragMovedRef.current) {
      dragMovedRef.current = false;
      return;
    }

    if (path !== location.pathname) {
      navigate(path);
    }
  }

  function closeTab(path, e) {
    e.stopPropagation();

    setRecentTabs((prev) => {
      const closingIndex = prev.findIndex((tab) => tab.path === path);
      const nextTabs = prev.filter((tab) => tab.path !== path);

      saveRecentTabs(nextTabs);

      if (location.pathname === path) {
        const leftTab = closingIndex > 0 ? prev[closingIndex - 1] : null;
        const rightTab =
          closingIndex >= 0 && closingIndex < prev.length - 1
            ? prev[closingIndex + 1]
            : null;

        const fallbackPath = leftTab?.path || rightTab?.path || "/";
        navigate(fallbackPath);
      }

      return nextTabs;
    });
  }

  function handleTabDragStart(path) {
    setDraggingPath(path);
    setDragOverPath(path);
    dragMovedRef.current = false;
  }

  function handleTabDragOver(targetPath, e) {
    e.preventDefault();

    if (!draggingPath || draggingPath === targetPath) {
      setDragOverPath(targetPath);
      return;
    }

    setRecentTabs((prev) => {
      const fromIndex = prev.findIndex((tab) => tab.path === draggingPath);
      const toIndex = prev.findIndex((tab) => tab.path === targetPath);

      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
        return prev;
      }

      dragMovedRef.current = true;

      const nextTabs = moveTab(prev, fromIndex, toIndex);
      saveRecentTabs(nextTabs);
      return nextTabs;
    });

    setDragOverPath(targetPath);
  }

  function handleTabDrop(e) {
    e.preventDefault();
    setDraggingPath(null);
    setDragOverPath(null);
  }

  function handleTabDragEnd() {
    setTimeout(() => {
      dragMovedRef.current = false;
      setDraggingPath(null);
      setDragOverPath(null);
    }, 0);
  }

  return (
    <div className="flex min-h-screen overflow-x-hidden bg-gray-100 text-black transition-colors duration-300 dark:bg-gray-950 dark:text-white">
      <style>
        {`
          .bitx-sidebar-scroll,
          .bitx-tabs-scroll {
            scrollbar-width: none;
            -ms-overflow-style: none;
            overflow-x: hidden;
          }

          .bitx-sidebar-scroll::-webkit-scrollbar,
          .bitx-tabs-scroll::-webkit-scrollbar {
            display: none;
            width: 0;
            height: 0;
          }
        `}
      </style>

      {routeLoading && (
        <div className="fixed left-0 top-0 z-[1000] h-1 w-full bg-transparent">
          <div
            className="h-full bg-purple-500 transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <aside className="group fixed bottom-4 left-4 top-4 z-50 flex w-[76px] flex-col overflow-hidden rounded-[28px] border border-white/20 bg-gradient-to-b from-purple-500 via-purple-600 to-indigo-700 text-white shadow-[0_24px_80px_rgba(88,28,135,0.35)] ring-1 ring-black/5 backdrop-blur-xl transition-all duration-300 hover:w-64 dark:border-slate-800 dark:bg-[#020617] dark:bg-none dark:shadow-[0_24px_90px_rgba(0,0,0,0.55)]">
        <div className="flex h-20 items-center gap-3 px-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 shadow-inner ring-1 ring-white/20">
            <div className="h-5 w-8 rounded-full bg-white shadow-sm" />
          </div>

          <div className="whitespace-nowrap text-lg font-bold opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            BitX Admin
          </div>
        </div>

        <nav className="bitx-sidebar-scroll flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-3 py-2">
          {navGroups.map((group, groupIndex) => (
            <div
              key={group.title}
              className={groupIndex === 0 ? "space-y-1" : "space-y-1 pt-2"}
            >
              {group.items.map((item) => {
                const active = location.pathname === item.to;

                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`flex h-12 items-center gap-4 rounded-2xl px-4 text-sm font-medium transition ${
                      active
                        ? "bg-white text-purple-600 shadow-lg shadow-black/10 dark:bg-purple-600 dark:text-white dark:shadow-purple-950/40"
                        : "text-white/85 hover:bg-white/15 hover:text-white dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                    }`}
                    title={item.label}
                  >
                    <Icon path={item.icon} />

                    <span className="whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="px-3 pb-4 pt-2">
          <button
            onClick={() => setShowLogoutModal(true)}
            className="flex h-12 w-full items-center gap-4 rounded-2xl px-4 text-sm font-medium text-white/85 transition hover:bg-white/15 hover:text-white"
          >
            <Icon path="M10 17v-3H3v-4h7V7l5 5-5 5Zm3 4v-2h6V5h-6V3h8v18h-8Z" />

            <span className="whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              Logout
            </span>
          </button>
        </div>
      </aside>

      <div className="ml-[108px] flex min-h-screen min-w-0 flex-1 flex-col pr-4">
        <header className="sticky top-0 z-40 border-b border-gray-200 bg-[#f3f4f6] px-6 py-4 shadow-sm backdrop-blur-xl dark:border-gray-800 dark:bg-[#030712]">
          <div className="flex min-w-0 items-center gap-4">
            <div className="bitx-tabs-scroll flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
              {recentTabs.length > 0 &&
                recentTabs.map((tab) => {
                  const isActive = location.pathname === tab.path;
                  const isDragging = draggingPath === tab.path;
                  const isDragOver =
                    dragOverPath === tab.path && draggingPath !== tab.path;

                  return (
                    <button
                      key={tab.path}
                      type="button"
                      draggable
                      onDragStart={() => handleTabDragStart(tab.path)}
                      onDragOver={(e) => handleTabDragOver(tab.path, e)}
                      onDrop={handleTabDrop}
                      onDragEnd={handleTabDragEnd}
                      onClick={() => handleTabClick(tab.path)}
                      className={`group inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl border px-4 text-sm transition ${
                        isActive
                          ? "border-purple-200 bg-white text-purple-700 shadow-md shadow-purple-100 dark:border-purple-500/40 dark:bg-purple-600 dark:text-white dark:shadow-purple-950/40"
                          : "border-slate-200 bg-white/70 text-slate-600 hover:border-slate-300 hover:bg-white hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800 dark:hover:text-white"
                      } ${isDragging ? "opacity-50" : ""} ${
                        isDragOver
                          ? "ring-2 ring-purple-300 dark:ring-purple-500/40"
                          : ""
                      }`}
                      title="Drag to move tab"
                    >
                      <span className="cursor-grab select-none text-xs opacity-50 active:cursor-grabbing">
                        ⋮⋮
                      </span>

                      <span className="max-w-[180px] truncate font-medium">
                        {tab.label}
                      </span>

                      <span
                        onClick={(e) => closeTab(tab.path, e)}
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-base leading-none transition hover:bg-black/5 dark:hover:bg-black/5"
                        title={`Close ${tab.label}`}
                      >
                        ×
                      </span>
                    </button>
                  );
                })}
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <div
                className={`hidden items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold md:flex ${
                  isSessionWarning
                    ? "bg-red-100 text-red-700 dark:bg-red-100 dark:text-red-700"
                    : "bg-purple-100 text-purple-700 dark:bg-purple-100 dark:text-purple-700"
                }`}
                title="Admin session timer"
              >
                <span className="h-2.5 w-2.5 rounded-full bg-current" />
                <span>Session {formatTimeLeft(timeLeft)}</span>

                {isSessionWarning && (
                  <button
                    type="button"
                    onClick={extendSession}
                    className="ml-1 rounded-lg bg-white/70 px-2 py-1 text-xs hover:bg-white"
                  >
                    Extend
                  </button>
                )}
              </div>

              <button
                onClick={() => {
                  document.documentElement.classList.toggle("dark");
                  localStorage.setItem(
                    "theme",
                    document.documentElement.classList.contains("dark")
                      ? "dark"
                      : "light"
                  );
                }}
                className="h-10 shrink-0 rounded-2xl bg-gray-200 px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-300 dark:border dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Toggle Dark
              </button>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-x-hidden bg-gray-100 dark:bg-gray-950">
          {children}
        </main>
      </div>

      {showLogoutModal && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl dark:bg-gray-900">
            <h3 className="mb-2 text-lg font-semibold text-gray-800 dark:text-white">
              Confirm Logout
            </h3>

            <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
              Are you sure you want to log out?
            </p>

            <div className="flex justify-center gap-4">
              <button
                onClick={handleLogout}
                className="rounded-xl bg-red-600 px-4 py-2 text-white hover:bg-red-700"
              >
                Yes, Logout
              </button>

              <button
                onClick={() => setShowLogoutModal(false)}
                className="rounded-xl bg-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem("token");
  return token ? children : <Navigate to="/login" />;
};

function App() {
  useEffect(() => {
    const theme = localStorage.getItem("theme");

    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  return (
    <>
      <Toaster position="top-right" />

      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AdminLayout>
                  <DashboardPage />
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
                  <WalletsPage />
                </AdminLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <AdminLayout>
                  <SettingsPage />
                </AdminLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/spot"
            element={
              <ProtectedRoute>
                <AdminLayout>
                  <SpotAdminPage />
                </AdminLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/market-override"
            element={
              <ProtectedRoute>
                <AdminLayout>
                  <MarketOverridePage />
                </AdminLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/withdrawals"
            element={
              <ProtectedRoute>
                <AdminLayout>
                  <WithdrawalsPage />
                </AdminLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/deposits"
            element={
              <ProtectedRoute>
                <AdminLayout>
                  <DepositsPage />
                </AdminLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/referrals"
            element={
              <ProtectedRoute>
                <AdminLayout>
                  <ReferralPage />
                </AdminLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/wire-settings"
            element={
              <ProtectedRoute>
                <AdminLayout>
                  <AdminWireSettingsPage />
                </AdminLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/kyc"
            element={
              <ProtectedRoute>
                <AdminLayout>
                  <AdminKycPage />
                </AdminLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <AdminLayout>
                  <AdminChatPage />
                </AdminLayout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </Router>
    </>
  );
}

export default App;