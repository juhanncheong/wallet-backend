import { useEffect, useMemo, useState } from "react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { toast } from "react-hot-toast";

const PAGE_SIZE = 10;
const API_BASE = "https://wallet-backend-pkxi.onrender.com";

const fmt = (v, d = 6) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString(undefined, { maximumFractionDigits: d });
};

const formatDate = (dt) => {
  if (!dt) return "-";
  const t = new Date(dt);
  if (Number.isNaN(t.getTime())) return "-";
  return t.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function SpotAdminPage() {
  const token = localStorage.getItem("token");

  const [tab, setTab] = useState("open");
  const [userId, setUserId] = useState("");
  const [instId, setInstId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const [bulkUserId, setBulkUserId] = useState("");
  const [bulkInstId, setBulkInstId] = useState("");
  const [bulkReason, setBulkReason] = useState("Force-cancel by admin");

  const pages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE));

  const inputClass =
    "h-11 border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500";

  const labelClass = "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300";

  const buildUrl = () => {
    const q = new URLSearchParams();
    q.set("page", String(page));
    q.set("limit", String(PAGE_SIZE));

    if (userId.trim()) q.set("userId", userId.trim());
    if (instId.trim()) q.set("instId", instId.trim().toUpperCase());

    if (tab === "trades") {
      if (from.trim()) q.set("from", from.trim());
      if (to.trim()) q.set("to", to.trim());
      return `${API_BASE}/api/admin/orders/completed?${q.toString()}`;
    }

    return `${API_BASE}/api/admin/orders/open?${q.toString()}`;
  };

  const fetchData = async () => {
    if (!token) return toast.error("Missing admin token");

    setLoading(true);

    try {
      const res = await fetch(buildUrl(), {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Fetch failed");

      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total || 0));
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Error");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page]);

  const onQuery = () => {
    setPage(1);
    fetchData();
  };

  const onReset = () => {
    setUserId("");
    setInstId("");
    setFrom("");
    setTo("");
    setPage(1);
    setTimeout(fetchData, 0);
  };

  const cancelOrder = async (orderId) => {
    if (!token) return toast.error("Missing admin token");
    if (!orderId) return;

    const ok = window.confirm("Cancel this open order and unlock funds?");
    if (!ok) return;

    try {
      const res = await fetch(`${API_BASE}/api/admin/orders/${orderId}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: "Cancelled by admin" }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Cancel failed");

      toast.success("Order cancelled");
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Cancel failed");
    }
  };

  const forceCancelUserOrders = async () => {
    if (!token) return toast.error("Missing admin token");

    const uid = bulkUserId.trim();
    if (!uid) return toast.error("Enter a User ID");

    const ok = window.confirm(
      `Force-cancel ALL open orders for this user${
        bulkInstId.trim() ? ` (instId: ${bulkInstId.trim().toUpperCase()})` : ""
      }?`
    );
    if (!ok) return;

    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${uid}/orders/force-cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          instId: bulkInstId.trim() ? bulkInstId.trim().toUpperCase() : undefined,
          reason: bulkReason || "Force-cancel by admin",
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Force-cancel failed");

      toast.success(`Cancelled ${data.cancelledCount ?? 0} order(s)`);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Force-cancel failed");
    }
  };

  const title = tab === "open" ? "Open Limit Orders" : "Completed Trades";

  const summary = useMemo(() => {
    const byInst = {};
    for (const x of items) {
      const k = x.instId || "-";
      byInst[k] = (byInst[k] || 0) + 1;
    }

    return {
      top: Object.entries(byInst)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4),
    };
  }, [items]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 px-6 py-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div />

        <div className="flex gap-2">
          <Button
            variant={tab === "open" ? "default" : "outline"}
            className={tab === "open" ? "bg-purple-600 text-white hover:bg-purple-700" : ""}
            onClick={() => {
              setTab("open");
              setPage(1);
            }}
          >
            Open Limit Orders
          </Button>

          <Button
            variant={tab === "trades" ? "default" : "outline"}
            className={tab === "trades" ? "bg-purple-600 text-white hover:bg-purple-700" : ""}
            onClick={() => {
              setTab("trades");
              setPage(1);
            }}
          >
            Completed Trades
          </Button>
        </div>
      </div>

      <div className="mb-5 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
          {title} — Filters
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr),minmax(0,1fr),minmax(0,1fr),auto,auto] lg:items-end">
          <div>
            <label className={labelClass}>User ID (optional)</label>
            <Input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="leave empty to show all"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>instId (optional)</label>
            <Input
              value={instId}
              onChange={(e) => setInstId(e.target.value)}
              placeholder='e.g. "XRP-USDT"'
              className={inputClass}
            />
          </div>

          {tab === "trades" ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>From (optional)</label>
                <Input
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  placeholder="2026-01-01"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>To (optional)</label>
                <Input
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="2026-01-26"
                  className={inputClass}
                />
              </div>
            </div>
          ) : (
            <div className="hidden lg:block" />
          )}

          <Button
            className="h-10 bg-purple-600 text-white hover:bg-purple-700 lg:w-24"
            onClick={onQuery}
            disabled={loading}
          >
            {loading ? "..." : "Query"}
          </Button>

          <Button className="h-10 lg:w-24" variant="outline" onClick={onReset} disabled={loading}>
            Reset
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {summary.top.map(([k, v]) => (
            <span
              key={k}
              className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {k}: {v}
            </span>
          ))}
        </div>
      </div>

      {tab === "open" && (
        <div className="mb-5 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
            Force-cancel user OPEN orders
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),minmax(0,1fr),minmax(0,1fr),auto] md:items-end">
            <div>
              <label className={labelClass}>User ID</label>
              <Input
                value={bulkUserId}
                onChange={(e) => setBulkUserId(e.target.value)}
                placeholder="Required userId"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>instId (optional)</label>
              <Input
                value={bulkInstId}
                onChange={(e) => setBulkInstId(e.target.value)}
                placeholder="XRP-USDT"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Reason</label>
              <Input
                value={bulkReason}
                onChange={(e) => setBulkReason(e.target.value)}
                placeholder="Reason (logged)"
                className={inputClass}
              />
            </div>

            <Button variant="destructive" className="h-10" onClick={forceCancelUserOrders}>
              Force Cancel
            </Button>
          </div>

          <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
            Cancels OPEN orders only and unlocks funds.
          </div>
        </div>
      )}

      <div className="w-full rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="w-full overflow-x-auto">
          <table className="min-w-[1200px] text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                <th className="whitespace-nowrap px-5 py-4 text-left">Time</th>
                <th className="whitespace-nowrap px-5 py-4 text-left">User</th>
                <th className="whitespace-nowrap px-5 py-4 text-left">instId</th>
                <th className="whitespace-nowrap px-5 py-4 text-left">Side</th>
                <th className="whitespace-nowrap px-5 py-4 text-left">Type</th>
                <th className="whitespace-nowrap px-5 py-4 text-right">Price</th>
                <th className="whitespace-nowrap px-5 py-4 text-right">
                  {tab === "trades" ? "Base Qty" : "Amount"}
                </th>
                <th className="whitespace-nowrap px-5 py-4 text-right">
                  {tab === "trades" ? "Quote" : "Filled"}
                </th>
                <th className="whitespace-nowrap px-5 py-4 text-left">
                  {tab === "trades" ? "Result" : "Status"}
                </th>
                {tab === "open" && (
                  <th className="whitespace-nowrap px-5 py-4 text-right">Action</th>
                )}
              </tr>
            </thead>

            <tbody>
              {items.length === 0 && (
                <tr>
                  <td
                    colSpan={tab === "open" ? 10 : 9}
                    className="px-5 py-10 text-center text-slate-500 dark:text-slate-400"
                  >
                    {loading ? "Loading..." : "No records found."}
                  </td>
                </tr>
              )}

              {items.map((o) => {
                const userLabel =
                  o?.userId?.email ||
                  o?.userId?.username ||
                  (typeof o.userId === "string" ? o.userId : "-");

                const baseQty = tab === "trades" ? o.amountBase : o.amount;
                const quoteVal = tab === "trades" ? o.netQuote ?? o.grossQuote : o.filledAmount;

                return (
                  <tr
                    key={o._id}
                    className="border-b last:border-0 hover:bg-slate-50/70 dark:border-slate-800 dark:hover:bg-slate-800/40"
                  >
                    <td className="whitespace-nowrap px-5 py-5 align-top text-xs text-slate-600 dark:text-slate-300">
                      {formatDate(o.createdAt)}
                    </td>

                    <td className="px-5 py-5 align-top">
                      <div className="flex flex-col gap-0.5">
                        <span className="whitespace-nowrap text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {userLabel}
                        </span>
                        <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {o._id}
                        </span>
                      </div>
                    </td>

                    <td className="whitespace-nowrap px-5 py-5 align-top text-xs text-slate-700 dark:text-slate-300">
                      {o.instId || "-"}
                    </td>

                    <td className="whitespace-nowrap px-5 py-5 align-top text-xs text-slate-700 dark:text-slate-300">
                      {o.side || "-"}
                    </td>

                    <td className="whitespace-nowrap px-5 py-5 align-top text-xs text-slate-700 dark:text-slate-300">
                      {o.type || "-"}
                    </td>

                    <td className="whitespace-nowrap px-5 py-5 align-top text-right text-xs text-slate-700 dark:text-slate-300">
                      {fmt(o.price, 8)}
                    </td>

                    <td className="whitespace-nowrap px-5 py-5 align-top text-right text-xs text-slate-700 dark:text-slate-300">
                      {fmt(baseQty, 8)}
                    </td>

                    <td className="whitespace-nowrap px-5 py-5 align-top text-right text-xs text-slate-700 dark:text-slate-300">
                      {fmt(quoteVal, 6)}
                    </td>

                    <td className="whitespace-nowrap px-5 py-5 align-top text-xs">
                      {tab === "trades" ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                          filled
                        </span>
                      ) : o.status === "open" ? (
                        <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                          open
                        </span>
                      ) : o.status === "filled" ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                          filled
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {o.status || "-"}
                        </span>
                      )}
                    </td>

                    {tab === "open" && (
                      <td className="whitespace-nowrap px-5 py-5 align-top text-right">
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-8 text-[11px]"
                          onClick={() => cancelOrder(o._id)}
                        >
                          Cancel
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
        <div>
          Page {page} of {pages} • Total {total}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </Button>

          <Button
            variant="outline"
            size="sm"
            disabled={page === pages || loading}
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}