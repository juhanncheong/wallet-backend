import { useEffect, useMemo, useState } from "react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { toast } from "react-hot-toast";

const PAGE_SIZE = 10;
const API_BASE = "https://wallet-backend-pkxi.onrender.com";
const COINS = ["bitcoin", "ethereum", "usdc", "usdt"];
const STATUSES = ["draft", "active", "redeemed", "cancelled"];

function fmtDate(v) {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
}

function StatusBadge({ status }) {
  const map = {
    draft:
      "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700",
    active:
      "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/20",
    redeemed:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20",
    cancelled:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20",
  };

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        map[status] || map.draft,
      ].join(" ")}
    >
      {status || "unknown"}
    </span>
  );
}

const RewardGrantsPage = () => {
  const token = localStorage.getItem("token");

  const [userId, setUserId] = useState("");
  const [coin, setCoin] = useState("usdt");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const [filterUserId, setFilterUserId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCoin, setFilterCoin] = useState("");

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE));

  const [kpis, setKpis] = useState({
    draft: 0,
    active: 0,
    redeemed: 0,
    cancelled: 0,
  });

  const [selected, setSelected] = useState(null);

  const inputClass =
    "h-10 border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500";

  const selectClass =
    "h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-slate-700";

  const labelClass = "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300";

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(PAGE_SIZE));
    if (filterStatus) params.set("status", filterStatus);
    if (filterCoin) params.set("coin", filterCoin);
    if (filterUserId.trim()) params.set("userId", filterUserId.trim());
    return params.toString();
  }, [page, filterStatus, filterCoin, filterUserId]);

  const authHeaders = useMemo(() => {
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }, [token]);

  const fetchGrants = async () => {
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE}/api/admin/reward-grants?${queryString}`, {
        headers: authHeaders,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Failed to fetch reward grants");

      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total || 0));
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to load grants");
    }
  };

  const fetchKpis = async () => {
    if (!token) return;

    try {
      const requests = STATUSES.map(async (s) => {
        const res = await fetch(
          `${API_BASE}/api/admin/reward-grants?status=${encodeURIComponent(s)}&page=1&limit=1`,
          { headers: authHeaders }
        );

        const data = await res.json().catch(() => ({}));
        if (!res.ok) return [s, 0];
        return [s, Number(data.total || 0)];
      });

      const results = await Promise.all(requests);
      const next = { draft: 0, active: 0, redeemed: 0, cancelled: 0 };

      results.forEach(([s, n]) => {
        next[s] = n;
      });

      setKpis(next);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchGrants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  useEffect(() => {
    fetchKpis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetCreate = () => {
    setUserId("");
    setCoin("usdt");
    setAmount("");
    setNote("");
  };

  const createGrant = async (autoActivate = false) => {
    if (!token) return toast.error("Missing admin token");

    const uid = userId.trim();
    const amt = Number(amount);

    if (!uid) return toast.error("User ID is required");
    if (!COINS.includes(coin)) return toast.error("Invalid coin");
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Enter a valid positive amount");

    try {
      const res = await fetch(`${API_BASE}/api/admin/reward-grants`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({ userId: uid, coin, amount: amt, note }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Failed to create grant");

      toast.success("Reward created");
      resetCreate();

      const grant = data.grant;
      setSelected(grant);

      if (autoActivate && grant?._id) {
        await activateGrant(grant._id, { silentToast: true });
        toast.success("Activated");
      }

      fetchGrants();
      fetchKpis();
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Create failed");
    }
  };

  const activateGrant = async (id, opts = {}) => {
    if (!token) return toast.error("Missing admin token");

    try {
      const res = await fetch(`${API_BASE}/api/admin/reward-grants/${id}/activate`, {
        method: "PATCH",
        headers: { ...authHeaders },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Failed to activate");

      if (!opts.silentToast) toast.success("Activated");
      setSelected((prev) => (prev?._id === id ? data.grant : prev));

      fetchGrants();
      fetchKpis();
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Activate failed");
    }
  };

  const cancelGrant = async (id) => {
    if (!token) return toast.error("Missing admin token");

    const ok = window.confirm("Cancel this grant? User will not be able to claim it.");
    if (!ok) return;

    try {
      const res = await fetch(`${API_BASE}/api/admin/reward-grants/${id}/cancel`, {
        method: "PATCH",
        headers: { ...authHeaders },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Failed to cancel");

      toast.success("Cancelled");
      setSelected((prev) => (prev?._id === id ? data.grant : prev));

      fetchGrants();
      fetchKpis();
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Cancel failed");
    }
  };

  const applyFilters = () => {
    setPage(1);
    fetchGrants();
  };

  const resetFilters = () => {
    setFilterUserId("");
    setFilterStatus("");
    setFilterCoin("");
    setPage(1);
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f3f4f6] px-6 py-6 text-slate-900 dark:bg-[#030712] dark:text-slate-100">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Create one-time claimable rewards, activate, cancel, and track redemption.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              fetchGrants();
              fetchKpis();
            }}
          >
            Refresh
          </Button>
        </div>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Draft", value: kpis.draft, status: "draft" },
          { label: "Active", value: kpis.active, status: "active" },
          { label: "Redeemed", value: kpis.redeemed, status: "redeemed" },
          { label: "Cancelled", value: kpis.cancelled, status: "cancelled" },
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#0F172A]"
          >
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {c.label}
              </div>
              <StatusBadge status={c.status} />
            </div>

            <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
              {Number(c.value || 0).toLocaleString()}
            </div>

            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Total records
            </div>
          </div>
        ))}
      </div>

      <div className="mb-5 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Create Reward Grant
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Draft = created. Activate to make it appear for the user.
          </p>
        </div>

        <div className="grid items-end gap-3 lg:grid-cols-[minmax(0,2fr),minmax(0,1fr),minmax(0,1fr),minmax(0,2fr),auto,auto]">
          <div>
            <label className={labelClass}>User ID</label>
            <Input
              className={inputClass}
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Mongo ObjectId of user"
            />
          </div>

          <div>
            <label className={labelClass}>Coin</label>
            <select className={selectClass} value={coin} onChange={(e) => setCoin(e.target.value)}>
              {COINS.map((c) => (
                <option key={c} value={c}>
                  {c.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Amount</label>
            <Input
              className={inputClass}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 25"
            />
          </div>

          <div>
            <label className={labelClass}>Note</label>
            <Input
              className={inputClass}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Internal note"
            />
          </div>

          <Button className="h-10 bg-purple-600 text-white hover:bg-purple-700" onClick={() => createGrant(false)}>
            Create Draft
          </Button>

          <Button className="h-10" variant="outline" onClick={() => createGrant(true)}>
            Create & Show
          </Button>
        </div>
      </div>

      <div className="mb-5 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,2fr),minmax(0,1fr),minmax(0,1fr),auto,auto]">
          <div>
            <label className={labelClass}>Filter by User ID</label>
            <Input
              className={inputClass}
              value={filterUserId}
              onChange={(e) => setFilterUserId(e.target.value)}
              placeholder="User ObjectId"
            />
          </div>

          <div>
            <label className={labelClass}>Status</label>
            <select
              className={selectClass}
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">All</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Coin</label>
            <select
              className={selectClass}
              value={filterCoin}
              onChange={(e) => setFilterCoin(e.target.value)}
            >
              <option value="">All</option>
              {COINS.map((c) => (
                <option key={c} value={c}>
                  {c.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <Button className="h-10 bg-purple-600 text-white hover:bg-purple-700" onClick={applyFilters}>
            Apply
          </Button>

          <Button className="h-10" variant="outline" onClick={resetFilters}>
            Reset
          </Button>
        </div>
      </div>

      <div className="w-full rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-[#0F172A]">
        <div className="w-full overflow-x-auto">
          <table className="w-full table-auto text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-[#020617] dark:text-slate-400">
                <th className="whitespace-nowrap px-5 py-4 text-left">Created</th>
                <th className="whitespace-nowrap px-5 py-4 text-left">User</th>
                <th className="whitespace-nowrap px-5 py-4 text-left">Reward</th>
                <th className="whitespace-nowrap px-5 py-4 text-left">Status</th>
                <th className="whitespace-nowrap px-5 py-4 text-left">Lifecycle</th>
                <th className="whitespace-nowrap px-5 py-4 text-right">Actions</th>
              </tr>
            </thead>

            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-slate-500 dark:text-slate-400">
                    No reward grants found.
                  </td>
                </tr>
              )}

              {items.map((g) => (
                <tr
                  key={g._id}
                  className="border-b last:border-0 hover:bg-slate-50/70 dark:border-slate-800 dark:hover:bg-slate-800/40"
                >
                  <td className="whitespace-nowrap px-5 py-5 align-top text-xs text-slate-600 dark:text-slate-300">
                    {fmtDate(g.createdAt)}
                    <div className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {g._id}
                    </div>
                  </td>

                  <td className="px-5 py-5 align-top">
                    <div className="flex flex-col gap-0.5">
                      <span className="whitespace-nowrap text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {g.userId?.email || "—"}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {g.userId?._id || g.userId || "—"}
                      </span>
                    </div>
                  </td>

                  <td className="px-5 py-5 align-top">
                    <div className="whitespace-nowrap text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {Number(g.amount || 0).toLocaleString()} {String(g.coin || "").toUpperCase()}
                    </div>
                    {g.note ? (
                      <div className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                        {g.note}
                      </div>
                    ) : (
                      <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                        No note
                      </div>
                    )}
                  </td>

                  <td className="whitespace-nowrap px-5 py-5 align-top">
                    <StatusBadge status={g.status} />
                  </td>

                  <td className="whitespace-nowrap px-5 py-5 align-top text-xs text-slate-600 dark:text-slate-300">
                    <div>Activated: {fmtDate(g.activatedAt)}</div>
                    <div>Redeemed: {fmtDate(g.redeemedAt)}</div>
                    <div>Cancelled: {fmtDate(g.cancelledAt)}</div>
                  </td>

                  <td className="whitespace-nowrap px-5 py-5 align-top text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setSelected(g)}>
                        View
                      </Button>

                      {g.status === "draft" && (
                        <Button
                          size="sm"
                          className="bg-purple-600 text-white hover:bg-purple-700"
                          onClick={() => activateGrant(g._id)}
                        >
                          Show
                        </Button>
                      )}

                      {(g.status === "draft" || g.status === "active") && (
                        <Button size="sm" variant="destructive" onClick={() => cancelGrant(g._id)}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
        <div>
          Page {page} of {totalPages} • Total {Number(total || 0).toLocaleString()}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </Button>

          <Button
            variant="outline"
            size="sm"
            disabled={page === totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      </div>

      {selected && (
        <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
          <DialogContent className="max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white p-0 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
              <div className="flex items-start justify-between gap-4 px-6 py-4">
                <DialogHeader className="space-y-1">
                  <DialogTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Reward Grant Details
                  </DialogTitle>
                  <DialogDescription className="text-sm text-slate-600 dark:text-slate-300">
                    ID:{" "}
                    <span className="font-mono text-slate-900 dark:text-slate-100">
                      {selected._id}
                    </span>
                  </DialogDescription>
                </DialogHeader>
              </div>
            </div>

            <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  User
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {selected.userId?.email || "—"}
                </div>
                <div className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {selected.userId?._id || selected.userId || "—"}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Reward
                  </div>
                  <StatusBadge status={selected.status} />
                </div>

                <div className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
                  {Number(selected.amount || 0).toLocaleString()}{" "}
                  {String(selected.coin || "").toUpperCase()}
                </div>

                <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                  Created: {fmtDate(selected.createdAt)}
                </div>

                {selected.note ? (
                  <div className="mt-3 rounded-xl border border-slate-100 bg-white p-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                    {selected.note}
                  </div>
                ) : (
                  <div className="mt-3 text-xs text-slate-400 dark:text-slate-500">
                    No note
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950 md:col-span-2">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Actions
                </div>

                <div className="flex flex-wrap gap-2">
                  {selected.status === "draft" && (
                    <Button
                      className="bg-purple-600 text-white hover:bg-purple-700"
                      onClick={() => activateGrant(selected._id)}
                    >
                      Show
                    </Button>
                  )}

                  {(selected.status === "draft" || selected.status === "active") && (
                    <Button variant="destructive" onClick={() => cancelGrant(selected._id)}>
                      Cancel
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard?.writeText(selected._id);
                      toast.success("Copied grant ID");
                    }}
                  >
                    Copy Grant ID
                  </Button>
                </div>

                <div className="mt-4 grid gap-2 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-3">
                  <div>Activated: {fmtDate(selected.activatedAt)}</div>
                  <div>Redeemed: {fmtDate(selected.redeemedAt)}</div>
                  <div>Cancelled: {fmtDate(selected.cancelledAt)}</div>
                </div>
              </div>
            </div>

            <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-950">
              <Button variant="outline" onClick={() => setSelected(null)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default RewardGrantsPage;