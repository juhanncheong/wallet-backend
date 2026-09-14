import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "../components/ui/dialog";

const WithdrawalsPage = () => {
  const token = localStorage.getItem("token");

  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);

  // UI states
  const [statusTab, setStatusTab] = useState("all"); // all | pending | completed | failed
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest"); // newest | oldest | amount_desc | amount_asc
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [methodTab, setMethodTab] = useState("all"); 
  
  // Selection + actions
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [busyIds, setBusyIds] = useState(() => new Set());

  // Modals
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmPayload, setConfirmPayload] = useState(null); // { title, description, onConfirm, tone }
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTx, setDetailTx] = useState(null);

  useEffect(() => {
    fetchWithdrawals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchWithdrawals = async () => {
    try {
      setLoading(true);
      const res = await fetch(
  "https://wallet-backend-pkxi.onrender.com/admin/withdrawals",
  { headers: { Authorization: `Bearer ${token}` } }
);

      const data = await res.json();
      setWithdrawals(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching withdrawals:", err);
      setWithdrawals([]);
      toast.error("Failed to load withdrawals");
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (txId, newStatus) => {
    try {
      setBusyIds((prev) => new Set(prev).add(txId));

      const res = await fetch(
        `https://wallet-backend-pkxi.onrender.com/api/transactions/${txId}/status`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: newStatus }),
        }
      );

      if (!res.ok) {
        toast.error("Failed to update status");
        return;
      }

      toast.success(`Withdrawal ${newStatus}`);
      await fetchWithdrawals();
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(txId);
        return next;
      });
    } catch (err) {
      console.error("Error updating transaction:", err);
      toast.error("Error updating transaction");
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(txId);
        return next;
      });
    }
  };

  // Helpers
  const getUserEmail = (tx) => {
    if (typeof tx?.user === "object" && tx.user?.email) return tx.user.email;
    if (typeof tx?.userId === "object" && tx.userId?.email) return tx.userId.email;
    return tx?.email || "Unknown";
  };

  const getUserId = (tx) => {
    if (typeof tx?.user === "object" && tx.user?._id) return tx.user._id;
    if (typeof tx?.userId === "object" && tx.userId?._id) return tx.userId._id;
    return tx?.userId || tx?.user || "N/A";
  };

  const fmtDate = (d) => {
    if (!d) return "—";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "—";
    return dt.toLocaleString();
  };

  const copyText = async (text, label = "Copied") => {
    try {
      await navigator.clipboard.writeText(String(text));
      toast.success(label);
    } catch {
      toast.error("Copy failed");
    }
  };

  const statusBadge = (status) => {
    const s = String(status || "").toLowerCase();
    const cls =
      s === "pending"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25"
        : s === "completed"
        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25"
        : "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/25";

    return (
      <span
        className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${cls}`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            s === "pending"
              ? "bg-amber-500"
              : s === "completed"
              ? "bg-emerald-500"
              : "bg-rose-500"
          }`}
        />
        {s || "unknown"}
      </span>
    );
  };

  // Filter + sort
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    let list = [...withdrawals];

    if (statusTab !== "all") {
      list = list.filter((tx) => String(tx.status || "").toLowerCase() === statusTab);
    }

    if (methodTab !== "all") {
      list = list.filter((tx) => {
        const method = String(tx.method || "CRYPTO").toUpperCase();
        if (methodTab === "crypto") return method !== "USDT_WIRE";
        if (methodTab === "wire") return method === "USDT_WIRE";
        return true;
      });
    }

    if (q) {
      list = list.filter((tx) => {
        const hay = [
          getUserEmail(tx),
          getUserId(tx),
          tx?.coin,
          tx?.address,
          tx?._id,
          tx?.status,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    const getDate = (tx) => tx?.createdAt || tx?.updatedAt || tx?.timestamp || null;

    list.sort((a, b) => {
      const ad = getDate(a) ? new Date(getDate(a)).getTime() : 0;
      const bd = getDate(b) ? new Date(getDate(b)).getTime() : 0;

      if (sort === "newest") return bd - ad;
      if (sort === "oldest") return ad - bd;

      const aa = Number(a?.amount || 0);
      const ba = Number(b?.amount || 0);
      if (sort === "amount_desc") return ba - aa;
      if (sort === "amount_asc") return aa - ba;
      return 0;
    });

    return list;
  }, [withdrawals, statusTab, methodTab, query, sort]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(filtered.length, startIndex + pageSize);
  const paginated = filtered.slice(startIndex, endIndex);

  useEffect(() => {
    // if filters reduce pages, keep page valid
    if (page > totalPages) setPage(totalPages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPages]);

  // KPIs
  const kpis = useMemo(() => {
    const pending = withdrawals.filter(
      (w) => String(w.status || "").toLowerCase() === "pending"
    );
    const pendingTotal = pending.reduce((sum, w) => sum + Number(w.amount || 0), 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = withdrawals.filter((w) => {
      const d = w?.createdAt || w?.updatedAt;
      if (!d) return false;
      const t = new Date(d);
      return !Number.isNaN(t.getTime()) && t >= today;
    }).length;

    return {
      pendingCount: pending.length,
      pendingTotal,
      todayCount,
      total: withdrawals.length,
    };
  }, [withdrawals]);

  // Selection
  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllOnPage = () => {
    const ids = paginated.map((t) => t._id).filter(Boolean);
    const allSelected = ids.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const openDetails = (tx) => {
    setDetailTx(tx);
    setDetailOpen(true);
  };

  const confirmAction = ({ title, description, onConfirm, tone = "default" }) => {
    setConfirmPayload({ title, description, onConfirm, tone });
    setConfirmOpen(true);
  };

  const bulkUpdate = (newStatus) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    confirmAction({
      title: `Confirm ${newStatus.toUpperCase()} (${ids.length})`,
      description:
        newStatus === "completed"
          ? "This will mark the selected withdrawals as completed."
          : "This will mark the selected withdrawals as failed.",
      tone: newStatus === "completed" ? "success" : "danger",
      onConfirm: async () => {
        // Only update pending ones (safe default)
        const selectedTxs = withdrawals.filter((w) => ids.includes(w._id));
        const pendingOnly = selectedTxs.filter(
          (w) => String(w.status || "").toLowerCase() === "pending"
        );

        if (pendingOnly.length === 0) {
          toast("No pending withdrawals selected");
          return;
        }

        for (const tx of pendingOnly) {
          // sequential to avoid hammering server
          // (still fast in admin use)
          // eslint-disable-next-line no-await-in-loop
          await updateStatus(tx._id, newStatus);
        }
      },
    });
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Review, filter, and process withdrawals with bulk actions and full details.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchWithdrawals} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
          <Button
            className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            onClick={() => {
              setStatusTab("pending");
              setQuery("");
              setPage(1);
            }}
          >
            Focus Pending
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Pending
          </div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
            {kpis.pendingCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Requests needing review
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Pending Total
          </div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
            {kpis.pendingTotal.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Sum of pending amounts
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Today
          </div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
            {kpis.todayCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            New requests today
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Total
          </div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
            {kpis.total}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            All time requests
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center lg:justify-between">

      <div className="flex flex-wrap gap-2 mb-3">
        {["all", "crypto", "wire"].map((m) => {
          const active = methodTab === m;
          return (
            <button
              key={m}
              onClick={() => {
                setMethodTab(m);
                setPage(1);
                setSelectedIds(new Set());
              }}
              className={[
                "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                active
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700",
              ].join(" ")}
            >
              {m.toUpperCase()}
            </button>
          );
        })}
      </div>
      
        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          {["all", "pending", "completed", "failed"].map((t) => {
            const active = statusTab === t;
            return (
              <button
                key={t}
                onClick={() => {
                  setStatusTab(t);
                  setPage(1);
                  setSelectedIds(new Set());
                }}
                className={[
                  "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                  active
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700",
                ].join(" ")}
              >
                {t.toUpperCase()}
              </button>
            );
          })}
        </div>

        {/* Search + Sort */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="w-full sm:w-72">
            <Input
               className="text-sm"
               value={query}
               onChange={(e) => {
                 setQuery(e.target.value);
                 setPage(1);
              }}
             placeholder="Search email, userId, coin, address..."
            />
          </div>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="amount_desc">Amount (high → low)</option>
            <option value="amount_asc">Amount (low → high)</option>
          </select>

          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
              setSelectedIds(new Set());
            }}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
          >
            {[10, 20, 50].map((n) => (
              <option key={n} value={n}>
                {n}/page
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Bulk actions */}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-600 dark:text-slate-300">
          Showing{" "}
          <span className="font-semibold text-slate-900 dark:text-white">
            {filtered.length === 0 ? 0 : startIndex + 1}-{endIndex}
          </span>{" "}
          of{" "}
          <span className="font-semibold text-slate-900 dark:text-white">
            {filtered.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={selectedIds.size === 0}
            onClick={() => bulkUpdate("completed")}
          >
            Bulk Approve
          </Button>
          <Button
            variant="outline"
            disabled={selectedIds.size === 0}
            className="border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/40"
            onClick={() => bulkUpdate("failed")}
          >
            Bulk Reject
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="p-6 text-slate-500">Loading withdrawals...</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-slate-500">No withdrawal requests found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-left dark:bg-slate-950">
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      onChange={toggleSelectAllOnPage}
                      checked={
                        paginated.length > 0 &&
                        paginated.every((t) => selectedIds.has(t._id))
                      }
                    />
                  </th>
                  <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">
                    User
                  </th>
                  <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">
                    Coin
                  </th>
                  <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">
                    Network
                  </th>
                  <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">
                    Amount
                  </th>
                  <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">
                    Address
                  </th>
                  <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">
                    Status
                  </th>
                  <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {paginated.map((tx) => {
                  const id = tx._id;
                  const isBusy = busyIds.has(id);
                  const email = getUserEmail(tx);
                  const uid = getUserId(tx);

                  return (
                    <tr
                      key={id}
                      className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-950/40"
                    >
                      <td className="px-4 py-3 align-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(id)}
                          onChange={() => toggleSelect(id)}
                        />
                      </td>

                      <td className="px-4 py-3 align-top">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {email}
                        </div>
                      
                        <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          {fmtDate(tx.createdAt || tx.updatedAt)}
                        </div>
                      </td>

                      <td className="px-4 py-3 align-center font-semibold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          <span>{String(tx.coin || "").toUpperCase()}</span>

                          {String(tx.method || "").toUpperCase() === "USDT_WIRE" && (
                            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                              WIRE
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3 align-center font-semibold text-slate-900 dark:text-white">
                        {String(tx.method || "").toUpperCase() === "USDT_WIRE"
                          ? "WIRE"
                          : tx.network
                          ? String(tx.network).toUpperCase()
                          : "—"}
                      </td>
                      
                      <td className="px-4 py-3 align-center">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {tx.amount}
                        </div>
                      </td>

                      <td className="px-4 py-3 align-center">
                        <div
                          onDoubleClick={() => {
                            if (tx.address) {
                              copyText(tx.address, "Withdrawal address copied");
                            }
                          }}
                          title="Double click to copy withdrawal address"
                          className="max-w-[360px] cursor-copy break-all rounded-lg px-2 py-1 text-[12px] text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/60"
                        >
                          {tx.address || "N/A"}
                        </div>
                      </td>

                      <td className="px-4 py-3 align-center">{statusBadge(tx.status)}</td>

                      <td className="px-4 py-3 align-center">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            className="h-8 rounded-xl px-3 text-xs"
                            onClick={() => openDetails(tx)}
                          >
                            View
                          </Button>

                          <Button
                            className="h-8 rounded-xl bg-emerald-600 px-3 text-xs text-white hover:bg-emerald-700 disabled:opacity-60"
                            disabled={isBusy || String(tx.status).toLowerCase() !== "pending"}
                            onClick={() =>
                              confirmAction({
                                title: "Approve withdrawal",
                                description: `Mark this withdrawal as completed?\n\n${tx.amount} ${String(
                                  tx.coin || ""
                                ).toUpperCase()} → ${tx.address || "N/A"}`,
                                tone: "success",
                                onConfirm: () => updateStatus(id, "completed"),
                              })
                            }
                          >
                            {isBusy ? "..." : "Approve"}
                          </Button>

                          <Button
                            className="h-8 rounded-xl bg-rose-600 px-3 text-xs text-white hover:bg-rose-700 disabled:opacity-60"
                            disabled={isBusy || String(tx.status).toLowerCase() !== "pending"}
                            onClick={() =>
                              confirmAction({
                                title: "Reject withdrawal",
                                description: `Reject this withdrawal (mark as failed)?\n\n${tx.amount} ${String(
                                  tx.coin || ""
                                ).toUpperCase()} → ${tx.address || "N/A"}`,
                                tone: "danger",
                                onConfirm: () => updateStatus(id, "failed"),
                              })
                            }
                          >
                            {isBusy ? "..." : "Reject"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {filtered.length > 0 && (
        <div className="mt-4 flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <Button
            variant="outline"
            disabled={safePage === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>

          <div className="text-sm text-slate-600 dark:text-slate-300">
            Page{" "}
            <span className="font-semibold text-slate-900 dark:text-white">
              {safePage}
            </span>{" "}
            of{" "}
            <span className="font-semibold text-slate-900 dark:text-white">
              {totalPages}
            </span>
          </div>

          <Button
            variant="outline"
            disabled={safePage === totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      )}

      {/* Confirm modal */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-lg p-0 overflow-hidden rounded-3xl border border-slate-200 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
          <div className="border-b border-slate-200 bg-white/80 px-6 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/70">
            <div className="flex items-start justify-between gap-4">
              <DialogHeader className="space-y-1">
                <DialogTitle className="text-lg font-semibold text-slate-900 dark:text-white">
                  {confirmPayload?.title || "Confirm"}
                </DialogTitle>
                <DialogDescription className="text-sm text-slate-600 dark:text-slate-300">
                  Please review before continuing.
                </DialogDescription>
              </DialogHeader>

              <DialogClose asChild>
                <Button variant="ghost" className="h-9 w-9 rounded-full p-0">
                  ✕
                </Button>
              </DialogClose>
            </div>
          </div>

          <div className="px-6 py-5">
            <div className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">
              {confirmPayload?.description || "Are you sure?"}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              className={
                confirmPayload?.tone === "danger"
                  ? "bg-rose-600 text-white hover:bg-rose-700"
                  : confirmPayload?.tone === "success"
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-slate-900 text-white hover:bg-slate-800"
              }
              onClick={async () => {
                try {
                  await confirmPayload?.onConfirm?.();
                } finally {
                  setConfirmOpen(false);
                }
              }}
            >
              Confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Details modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden rounded-3xl border border-slate-200 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
          <div className="border-b border-slate-200 bg-white/80 px-6 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/70">
            <div className="flex items-start justify-between gap-4">
              <DialogHeader className="space-y-1">
                <DialogTitle className="text-lg font-semibold text-slate-900 dark:text-white">
                  Withdrawal Details
                </DialogTitle>
                <DialogDescription className="text-sm text-slate-600 dark:text-slate-300">
                  Full information + quick copy actions.
                </DialogDescription>
              </DialogHeader>

              <DialogClose asChild>
                <Button variant="ghost" className="h-9 w-9 rounded-full p-0">
                  ✕
                </Button>
              </DialogClose>
            </div>
          </div>
          

          <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                User
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                {detailTx ? getUserEmail(detailTx) : "—"}
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <span className="font-mono">{detailTx ? getUserId(detailTx) : "—"}</span>
                {detailTx && (
                  <Button
                    variant="outline"
                    className="h-7 rounded-xl px-2 text-xs"
                    onClick={() => copyText(getUserId(detailTx), "User ID copied")}
                  >
                    Copy
                  </Button>
                )}
              </div>
            </div>

             {detailTx?.method === "USDT_WIRE" && detailTx?.wireInfo && (
               <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                 <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                   Wire Details
                 </div>
             
                 <div className="mt-3 space-y-1 text-sm text-slate-700 dark:text-slate-200">
                   <div>Bank: {detailTx.wireInfo.bankName}</div>
                   <div>Account Name: {detailTx.wireInfo.accountName}</div>
                   <div>Account Number: {detailTx.wireInfo.accountNumber}</div>
                   <div>SWIFT: {detailTx.wireInfo.swiftCode}</div>
                   <div>Bank Address: {detailTx.wireInfo.bankAddress || "—"}</div>
                 </div>
               </div>
             )}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Status
              </div>
              <div className="mt-2">{detailTx ? statusBadge(detailTx.status) : "—"}</div>
              <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                Created: {detailTx ? fmtDate(detailTx.createdAt || detailTx.updatedAt) : "—"}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Asset
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                {detailTx ? String(detailTx.coin || "").toUpperCase() : "—"}
              </div>
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                Amount:{" "}
                <span className="font-semibold text-slate-900 dark:text-white">
                  {detailTx?.amount ?? "—"}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Address
              </div>
            
              <div
                onDoubleClick={() => {
                  if (detailTx?.address) {
                    copyText(detailTx.address, "Withdrawal address copied");
                  }
                }}
                title="Double click to copy withdrawal address"
                className="mt-2 cursor-copy break-all rounded-lg px-2 py-1 text-xs text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/60"
              >
                {detailTx?.address || "N/A"}
              </div>
            </div>

            <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Transaction ID
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="break-all text-xs text-slate-700 dark:text-slate-200">
                  {detailTx?._id || "—"}
                </span>
                {detailTx?._id && (
                  <Button
                    variant="outline"
                    className="h-8 rounded-xl px-3 text-xs"
                    onClick={() => copyText(detailTx._id, "Transaction ID copied")}
                  >
                    Copy
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
            <Button variant="outline" onClick={() => setDetailOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WithdrawalsPage;
