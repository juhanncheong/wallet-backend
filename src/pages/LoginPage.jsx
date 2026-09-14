import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = "https://wallet-backend-pkxi.onrender.com";

const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const decodeJWT = useCallback((token) => {
    try {
      return JSON.parse(atob(token.split(".")[1]));
    } catch {
      return {};
    }
  }, []);

  const setupAutoLogout = useCallback(
    (token) => {
      const decoded = decodeJWT(token);

      if (decoded.exp) {
        const timeout = decoded.exp * 1000 - Date.now();

        if (timeout > 0) {
          setTimeout(() => {
            localStorage.removeItem("token");
            navigate("/");
          }, timeout);
        }
      }
    },
    [decodeJWT, navigate]
  );

  const handleLogin = async (e) => {
    e?.preventDefault();

    if (!username.trim() || !password.trim()) {
      alert("Please enter username and password");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      if (!res.ok) {
        alert("Invalid credentials");
        return;
      }

      const data = await res.json();

      if (!data.token) {
        alert("No token returned");
        return;
      }

      localStorage.setItem("token", data.token);

      setupAutoLogout(data.token);
      navigate("/users");
    } catch (error) {
      console.error(error);
      alert("Error logging in");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      const decoded = decodeJWT(token);

      if (!decoded.exp || decoded.exp * 1000 < Date.now()) {
        localStorage.removeItem("token");
        return;
      }

      setupAutoLogout(token);
      navigate("/users");
    } catch {
      localStorage.removeItem("token");
    }
  }, [decodeJWT, setupAutoLogout, navigate]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#070712] text-white">
      <div className="absolute inset-0">
        <div className="absolute left-[-10%] top-[-20%] h-[520px] w-[520px] rounded-full bg-purple-600/30 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] h-[560px] w-[560px] rounded-full bg-blue-600/25 blur-[130px]" />
        <div className="absolute left-[45%] top-[20%] h-[360px] w-[360px] rounded-full bg-fuchsia-500/10 blur-[100px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] bg-[size:48px_48px]" />
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-10">
        <div className="grid w-full max-w-6xl overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.06] shadow-2xl backdrop-blur-2xl lg:grid-cols-2">
          <div className="hidden min-h-[640px] flex-col justify-between border-r border-white/10 p-10 lg:flex">
            <div>
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-lg font-black text-slate-950">
                  CS
                </div>
                <div>
                  <div className="text-lg font-black tracking-tight">
                    Admin Control Center
                  </div>
                  <div className="text-sm text-white/50">
                    Secure management portal
                  </div>
                </div>
              </div>

              <div className="mt-20">
                <div className="inline-flex rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-bold text-white/70">
                  Protected Admin Access
                </div>

                <h1 className="mt-6 max-w-lg text-5xl font-black leading-tight tracking-tight">
                  Manage users, support, wallets and platform activity.
                </h1>

                <p className="mt-5 max-w-md text-sm leading-6 text-white/55">
                  Sign in to access the admin dashboard, monitor customer conversations,
                  and control sensitive platform operations.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {["Encrypted", "Realtime", "Admin Only"].map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-white/10 bg-white/10 p-4 text-center"
                >
                  <div className="text-xs font-bold text-white/70">{item}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex min-h-[640px] items-center justify-center p-6 sm:p-10">
            <form
              onSubmit={handleLogin}
              className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#0c0c18]/80 p-8 shadow-2xl"
            >
              <div className="mb-8 text-center">
                <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-purple-500 to-blue-500 shadow-lg shadow-purple-500/20">
                  <span className="text-2xl font-black">A</span>
                </div>

                <h2 className="text-3xl font-black tracking-tight">
                  Welcome Back
                </h2>

                <p className="mt-2 text-sm text-white/45">
                  Login to continue to your admin dashboard.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-white/45">
                    Username
                  </label>
                  <input
                    type="text"
                    placeholder="Enter admin username"
                    className="h-14 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-purple-400/60 focus:bg-white/[0.09]"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-white/45">
                    Password
                  </label>

                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter password"
                      className="h-14 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 pr-20 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-purple-400/60 focus:bg-white/[0.09]"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                    />

                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl px-3 py-2 text-xs font-bold text-white/45 transition hover:bg-white/10 hover:text-white"
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-7 h-14 w-full rounded-2xl bg-gradient-to-r from-purple-500 to-blue-500 text-sm font-black text-white shadow-lg shadow-purple-500/20 transition hover:-translate-y-0.5 hover:shadow-purple-500/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>

              <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center text-xs leading-5 text-white/40">
                Forgot password? Contact the system administrator.
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;