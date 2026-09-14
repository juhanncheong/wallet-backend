import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/ui/button";
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from "recharts";
import { useNavigate } from "react-router-dom";

const API_URL = "https://wallet-backend-pkxi.onrender.com/api/admin/stats"; // same endpoint you use now
const COLORS = ["#FF8A00", "#2D9CDB", "#27AE60", "#F2C94C", "#9B51E0", "#EB5757"];

const nf0 = new Intl.NumberFormat("en-US");
const nf2 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function cx(...c) {
  return c.filter(Boolean).join(" ");
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtInt(n) {
  return nf0.format(safeNum(n));
}

function fmtMoneyLike(n) {
  const x = safeNum(n);
  return x >= 1000 ? nf0.format(Math.round(x)) : nf2.format(x);
}

function pct(n) {
  const x = safeNum(n);
  return `${(x * 100).toFixed(1)}%`;
}

function coinShort(label) {
  const k = String(label || "").trim().toUpperCase();
  if (!k) return "—";
  if (k.includes("BITCOIN") || k === "XBT") return "BTC";
  if (k.includes("ETHEREUM")) return "ETH";
  if (k.includes("USD COIN")) return "USDC";
  if (k.includes("TETHER")) return "USDT";
  return k.length > 8 ? k.slice(0, 8) : k;
}

const KpiCard = ({ title, value, sub, tone = "violet", onClick }) => {
  const tones = {
    violet: "from-violet-500/15 to-fuchsia-500/10 border-violet-500/15",
    blue: "from-sky-500/15 to-indigo-500/10 border-sky-500/15",
    amber: "from-amber-500/15 to-orange-500/10 border-amber-500/15",
    green: "from-emerald-500/15 to-lime-500/10 border-emerald-500/15",
    red: "from-rose-500/15 to-red-500/10 border-rose-500/15",
    gray: "from-slate-500/10 to-slate-500/5 border-slate-500/15",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "group text-left rounded-2xl border p-4 shadow-sm transition",
        "bg-white/70 dark:bg-slate-900/40 backdrop-blur",
        "hover:shadow-lg hover:-translate-y-[1px] active:translate-y-0",
        tones[tone] ? `bg-gradient-to-br ${tones[tone]}` : tones.gray
      )}
    >
      <div className="text-sm font-semibold text-slate-700 dark:text-slate-200/90">{title}</div>
      <div className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white">{value}</div>
      {sub ? (
        <div className="mt-2 text-xs font-semibold text-slate-600/80 dark:text-slate-300/70">{sub}</div>
      ) : null}
      <div className="mt-3 h-px w-full bg-slate-900/5 dark:bg-white/10" />
      <div className="mt-3 text-xs font-bold text-violet-700/80 dark:text-violet-200/80">Open →</div>
    </button>
  );
};

const Skeleton = () => (
  <div className="space-y-6">
    <div className="h-10 w-64 rounded-xl bg-slate-200/60 dark:bg-slate-800/60 animate-pulse" />
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="h-[120px] rounded-2xl border border-slate-200/50 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/40 animate-pulse"
        />
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="h-[320px] rounded-2xl border border-slate-200/50 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/40 animate-pulse" />
      <div className="h-[320px] rounded-2xl border border-slate-200/50 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/40 animate-pulse" />
      <div className="h-[320px] rounded-2xl border border-slate-200/50 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/40 animate-pulse" />
    </div>
  </div>
);

const DashboardPage = () => {
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    registersToday: 0,
    activeToday: 0,
    registersThisWeek: 0,
    activeThisWeek: 0,
    registersThisMonth: 0,
    activeThisMonth: 0,
    pendingWithdrawals: 0,
    withdrawalsToday: 0,
    withdrawalsMonth: 0,
    approvedToday: 0,
    walletDistribution: [],
    referralCodes: 0,
    totalReferred: 0,
    topReferrer: "N/A",
  });

  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const abortRef = useRef(null);

  const fetchStats = async () => {
    try {
      setErrMsg("");
      const token = localStorage.getItem("token");

      if (!token) {
        setErrMsg("Missing admin token. Please login again.");
        setLoading(false);
        return;
      }

      abortRef.current?.abort?.();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const res = await fetch(API_URL, {
        headers: { Authorization: `Bearer ${token}` },
        signal: ctrl.signal,
      });

      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("token");
        setErrMsg("Session expired. Please login again.");
        setLoading(false);
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        setErrMsg(data?.message || "Failed to fetch admin stats.");
        setLoading(false);
        return;
      }

      setStats(data);
      setLastUpdated(new Date());
      setLoading(false);
    } catch (e) {
      if (e?.name === "AbortError") return;
      setErrMsg("Network error: could not load dashboard stats.");
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    return () => abortRef.current?.abort?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => fetchStats(), 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh]);

  const walletData = useMemo(() => {
    const arr = Array.isArray(stats.walletDistribution) ? stats.walletDistribution : [];
    const cleaned = arr
      .map((e) => ({
        coin: coinShort(e.coin),
        rawCoin: e.coin,
        value: safeNum(e.value),
      }))
      .filter((e) => e.value > 0);

    const total = cleaned.reduce((s, e) => s + e.value, 0);
    const sorted = [...cleaned].sort((a, b) => b.value - a.value);

    return { total, sorted };
  }, [stats.walletDistribution]);

  const insights = useMemo(() => {
    const totalUsers = safeNum(stats.totalUsers);
    const activeToday = safeNum(stats.activeToday);
    const activeWeek = safeNum(stats.activeThisWeek);
    const activeMonth = safeNum(stats.activeThisMonth);

    const withdrawalsToday = safeNum(stats.withdrawalsToday);
    const approvedToday = safeNum(stats.approvedToday);

    const dailyActiveRate = totalUsers ? activeToday / totalUsers : 0;
    const weeklyActiveRate = totalUsers ? activeWeek / totalUsers : 0;
    const monthlyActiveRate = totalUsers ? activeMonth / totalUsers : 0;

    const approvalRateToday = withdrawalsToday ? approvedToday / withdrawalsToday : 0;

    const topCoin = walletData.sorted[0]?.coin || "—";

    return {
      dailyActiveRate,
      weeklyActiveRate,
      monthlyActiveRate,
      approvalRateToday,
      topCoin,
    };
  }, [stats, walletData.sorted]);

  const pending = safeNum(stats.pendingWithdrawals);
  const pendingTone = pending >= 10 ? "red" : pending > 0 ? "amber" : "green";

  if (loading) {
    return (
      <div className="p-6 md:p-8">
        <Skeleton />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      {/* Page header */}
      <div className="w-full space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div> 
            <div className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300/80">
              {lastUpdated ? `Last updated: ${lastUpdated.toLocaleTimeString()}` : "—"}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAutoRefresh((v) => !v)}
              className={cx(
                "rounded-xl border px-3 py-2 text-sm font-bold transition",
                "bg-white/70 dark:bg-slate-900/40 backdrop-blur",
                "border-slate-200/60 dark:border-slate-800/60",
                autoRefresh ? "text-emerald-700 dark:text-emerald-200" : "text-slate-700 dark:text-slate-200"
              )}
            >
              {autoRefresh ? "Auto refresh: ON" : "Auto refresh: OFF"}
            </button>

            <Button onClick={fetchStats} className="rounded-xl">
              Refresh
            </Button>

            <Button onClick={() => navigate("/withdrawals")} className="rounded-xl">
              Review Withdrawals
            </Button>
          </div>
        </div>

        {/* Error banner */}
        {errMsg ? (
          <div className="rounded-2xl border border-rose-200/70 dark:border-rose-500/20 bg-rose-50/70 dark:bg-rose-500/10 p-4">
            <div className="font-extrabold text-rose-700 dark:text-rose-200">Dashboard error</div>
            <div className="mt-1 text-sm font-semibold text-rose-700/80 dark:text-rose-200/80">{errMsg}</div>
            <div className="mt-3 flex gap-2">
              <Button onClick={fetchStats} className="rounded-xl">
                Retry
              </Button>
              <Button onClick={() => navigate("/")} className="rounded-xl" variant="secondary">
                Go Home
              </Button>
            </div>
          </div>
        ) : null}

        {/* KPI grid (removed: Active Today, Withdrawals This Month, Referral Codes, Top Referrer) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Total Users"
            value={fmtInt(stats.totalUsers)}
            sub={`Active users: ${fmtInt(stats.activeUsers)}`}
            tone="blue"
            onClick={() => navigate("/users")}
          />

          <KpiCard
            title="Registers Today"
            value={fmtInt(stats.registersToday)}
            sub={`This week: ${fmtInt(stats.registersThisWeek)} • This month: ${fmtInt(stats.registersThisMonth)}`}
            tone="violet"
            onClick={() => navigate("/users")}
          />

          <KpiCard
            title="Pending Withdrawals"
            value={fmtInt(stats.pendingWithdrawals)}
            sub={`Approved today: ${fmtInt(stats.approvedToday)}`}
            tone={pendingTone === "red" ? "red" : pendingTone === "amber" ? "amber" : "green"}
            onClick={() => navigate("/withdrawals")}
          />

          <KpiCard
            title="Withdrawals Today"
            value={fmtInt(stats.withdrawalsToday)}
            sub={`Approval rate: ${pct(insights.approvalRateToday)}`}
            tone="amber"
            onClick={() => navigate("/withdrawals")}
          />
        </div>

        {/* 3-column section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Wallet */}
          <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/70 dark:bg-slate-900/40 backdrop-blur p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Wallet Distribution</div>
                <div className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-300/75">
                  Total: {fmtMoneyLike(walletData.total)}
                </div>
              </div>
              <Button onClick={() => navigate("/wallets")} className="rounded-xl">
                Manage Wallets
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={walletData.sorted}
                      dataKey="value"
                      nameKey="coin"
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={80}
                      paddingAngle={3}
                    >
                      {walletData.sorted.map((entry, idx) => (
                        <Cell key={entry.coin + idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, n) => [fmtMoneyLike(v), n]} />
                    <Legend layout="horizontal" verticalAlign="bottom" align="center" />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-2">
                {walletData.sorted.length ? (
                  walletData.sorted.slice(0, 5).map((e, i) => {
                    const share = walletData.total ? e.value / walletData.total : 0;
                    return (
                      <div
                        key={e.coin + i}
                        className="flex items-center justify-between rounded-xl border border-slate-200/50 dark:border-slate-800/60 bg-white/50 dark:bg-slate-900/30 px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                          <div className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{e.coin}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-black text-slate-900 dark:text-white">{fmtMoneyLike(e.value)}</div>
                          <div className="text-xs font-semibold text-slate-600 dark:text-slate-300/75">{pct(share)}</div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/60 bg-white/50 dark:bg-slate-900/30 p-4 text-sm font-semibold text-slate-600 dark:text-slate-300/75">
                    No wallet balances to display.
                  </div>
                )}

                <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/60 bg-gradient-to-br from-slate-500/10 to-slate-500/5 p-3">
                  <div className="text-xs font-extrabold text-slate-700 dark:text-slate-200">Top coin</div>
                  <div className="mt-1 text-lg font-black text-slate-900 dark:text-white">{insights.topCoin}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Insights */}
          <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/70 dark:bg-slate-900/40 backdrop-blur p-5 shadow-sm">
            <div className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Insights</div>
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-slate-200/50 dark:border-slate-800/60 bg-white/50 dark:bg-slate-900/30 p-3">
                <div className="text-xs font-bold text-slate-600 dark:text-slate-300/75">Weekly active rate</div>
                <div className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{pct(insights.weeklyActiveRate)}</div>
              </div>

              <div className="rounded-xl border border-slate-200/50 dark:border-slate-800/60 bg-white/50 dark:bg-slate-900/30 p-3">
                <div className="text-xs font-bold text-slate-600 dark:text-slate-300/75">Monthly active rate</div>
                <div className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{pct(insights.monthlyActiveRate)}</div>
              </div>

              <div className="rounded-xl border border-slate-200/50 dark:border-slate-800/60 bg-white/50 dark:bg-slate-900/30 p-3">
                <div className="text-xs font-bold text-slate-600 dark:text-slate-300/75">Approval rate today</div>
                <div className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{pct(insights.approvalRateToday)}</div>
                <div className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-300/70">
                  Approved: {fmtInt(stats.approvedToday)} / Total: {fmtInt(stats.withdrawalsToday)}
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={() => navigate("/users")} className="rounded-xl w-full">
                  Users
                </Button>
                <Button onClick={() => navigate("/referrals")} className="rounded-xl w-full">
                  Referrals
                </Button>
              </div>
            </div>
          </div>

          {/* Alerts & Ops */}
          <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/70 dark:bg-slate-900/40 backdrop-blur p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Operations</div>
                <div className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-300/75">Quick checks & alerts</div>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div
                className={cx(
                  "rounded-xl border p-3",
                  pending >= 10
                    ? "border-rose-200/80 dark:border-rose-500/20 bg-rose-50/70 dark:bg-rose-500/10"
                    : pending > 0
                    ? "border-amber-200/80 dark:border-amber-500/20 bg-amber-50/70 dark:bg-amber-500/10"
                    : "border-emerald-200/80 dark:border-emerald-500/20 bg-emerald-50/70 dark:bg-emerald-500/10"
                )}
              >
                <div className="text-xs font-extrabold text-slate-700 dark:text-slate-200">Withdrawal queue</div>
                <div className="mt-1 text-lg font-black text-slate-900 dark:text-white">
                  {pending ? `${fmtInt(pending)} pending` : "No pending withdrawals"}
                </div>
                <div className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-300/75">
                  Tip: keep queue low to improve user trust.
                </div>
              </div>

              <div className="rounded-xl border border-slate-200/50 dark:border-slate-800/60 bg-white/50 dark:bg-slate-900/30 p-3">
                <div className="text-xs font-bold text-slate-600 dark:text-slate-300/75">What to do next</div>
                <ul className="mt-2 space-y-2 text-sm font-semibold text-slate-700 dark:text-slate-200/90">
                  <li className="flex items-center justify-between">
                    <span>Review withdrawals</span>
                    <button onClick={() => navigate("/withdrawals")} className="text-violet-700 dark:text-violet-200 font-extrabold">
                      Open →
                    </button>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Audit wallets</span>
                    <button onClick={() => navigate("/wallets")} className="text-violet-700 dark:text-violet-200 font-extrabold">
                      Open →
                    </button>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Manage referrals</span>
                    <button onClick={() => navigate("/referrals")} className="text-violet-700 dark:text-violet-200 font-extrabold">
                      Open →
                    </button>
                  </li>
                </ul>
              </div>

              <div className="rounded-xl border border-slate-200/50 dark:border-slate-800/60 bg-gradient-to-br from-violet-500/15 to-fuchsia-500/10 p-3">
                <div className="text-xs font-extrabold text-slate-700 dark:text-slate-200">Pro tip</div>
                <div className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200/90">
                  Add “withdrawal SLA” on the backend later (avg approval time). This dashboard is ready to display it.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
