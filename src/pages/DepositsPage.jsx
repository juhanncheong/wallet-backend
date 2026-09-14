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

/**
 * DepositsPage (Admin Viewer)
 * - World-class viewer UI: KPIs, tabs, search, sorting, pagination
 * - Read-only: no approve/reject/bulk actions
 * - Fetch strategy:
 *    1) GET /admin/deposits (preferred)
 *    2) fallback GET /admin/transactions?type=deposit
 *
 * Update BASE_URL if needed to match your env pattern.
 */
const DepositsPage = () => {
  const token = localStorage.getItem("token");

  const BASE_URL = "https://wallet-backend-pkxi.onrender.com";

  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(true);

  // UI states
  const [statusTab, setStatusTab] = useState("all"); // all | pending | completed | failed
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest"); // newest | oldest | amount_desc | amount_asc
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Details modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTx, setDetailTx] = useState(null);

  useEffect(() => {
    fetchDeposits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

const fetchJson = async (url) => {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, data };
};

  const normalizeList = (data) => {
    // Accept either:
    //  - array directly
    //  - { transactions: [...] }
    //  - { data: [...] }
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.transactions)) return data.transactions;
    if (Array.isArray(data?.data)) return data.data;
    return [];
  };

const fetchDeposits = async () => {
  try {
    setLoading(true);

    const a = await fetchJson(`${BASE_URL}/api/transactions/all-deposits`);
    if (a.ok) {
      setDeposits(normalizeList(a.data));
      return;
    }

    setDeposits([]);
    toast.error("Failed to load deposits (check endpoint)");
  } catch (err) {
    console.error("Error fetching deposits:", err);
    setDeposits([]);
    toast.error("Failed to load deposits");
  } finally {
    setLoading(false);
  }
};

  // Helpers (mirrors your WithdrawalsPage patterns)
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
        : s
        ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/25"
        : "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/25";

    const dot =
      s === "pending"
        ? "bg-amber-500"
        : s === "completed"
        ? "bg-emerald-500"
        : s
        ? "bg-rose-500"
        : "bg-slate-500";

    return (
      <span
        className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${cls}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        {s || "unknown"}
      </span>
    );
  };

  const openDetails = (tx) => {
    setDetailTx(tx);
    setDetailOpen(true);
  };

  // Filter + sort
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = [...deposits];

    if (statusTab !== "all") {
      list = list.filter((tx) => String(tx.status || "").toLowerCase() === statusTab);
    }

    if (q) {
      list = list.filter((tx) => {
        const hay = [
          getUserEmail(tx),
          getUserId(tx),
          tx?.coin,
          tx?.network,
          tx?.txHash,
          tx?.hash,
          tx?._id,
          tx?.type,
          tx?.status,
          tx?.note,
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
  }, [deposits, statusTab, query, sort]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(filtered.length, startIndex + pageSize);
  const paginated = filtered.slice(startIndex, endIndex);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPages]);

  // KPIs
  const kpis = useMemo(() => {
    const totalAmount = deposits.reduce((sum, d) => sum + Number(d.amount || 0), 0);

    const pending = deposits.filter(
      (d) => String(d.status || "").toLowerCase() === "pending"
    );
    const pendingAmount = pending.reduce((sum, d) => sum + Number(d.amount || 0), 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayList = deposits.filter((d) => {
      const dd = d?.createdAt || d?.updatedAt;
      if (!dd) return false;
      const t = new Date(dd);
      return !Number.isNaN(t.getTime()) && t >= today;
    });

    const todayAmount = todayList.reduce((sum, d) => sum + Number(d.amount || 0), 0);

    return {
      total: deposits.length,
      totalAmount,
      pendingCount: pending.length,
      pendingAmount,
      todayCount: todayList.length,
      todayAmount,
    };
  }, [deposits]);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Search and review deposit history. (Viewer only — deposits are created via admin
            balance add.)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchDeposits} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </Button>

          <Button
            className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            onClick={() => {
              setStatusTab("all");
              setQuery("");
              setSort("newest");
              setPage(1);
            }}
          >
            Reset View
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Total Deposits
          </div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
            {kpis.total}
          </div>
          <div className="mt-1 text-xs text-slate-500">All time records</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Total Amount
          </div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
            {kpis.totalAmount.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-slate-500">Sum of deposit amounts</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Today
          </div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
            {kpis.todayCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Today amount: {kpis.todayAmount.toLocaleString()}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Pending
          </div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
            {kpis.pendingCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Pending amount: {kpis.pendingAmount.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center lg:justify-between">
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
              placeholder="Search email, userId, coin, txHash..."
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

      {/* Count row */}
      <div className="mb-3 flex items-center justify-between">
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
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="p-6 text-slate-500">Loading deposits...</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-slate-500">No deposits found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-left dark:bg-slate-950">
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">
                    User
                  </th>
                  <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">
                    Coin
                  </th>
                  <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">
                    Amount
                  </th>
                  <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">
                    Tx Hash
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
                  const id = tx._id || tx.id || `${getUserId(tx)}-${tx.createdAt || ""}`;
                  const email = getUserEmail(tx);
                  const uid = getUserId(tx);

                  const coin = String(tx.coin || tx.asset || "").toUpperCase() || "—";
                  const hash = tx.txHash || tx.hash || tx.transactionHash || "—";
                  const date = fmtDate(tx.createdAt || tx.updatedAt || tx.timestamp);

                  return (
                    <tr
                      key={id}
                      className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-950/40"
                    >
                      <td className="px-4 py-3 align-top">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {email}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                          <span className="font-mono">{uid}</span>
                          <button
                            className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800"
                            onClick={() => copyText(uid, "User ID copied")}
                          >
                            Copy
                          </button>
                        </div>
                      </td>

                      <td className="px-4 py-3 align-top font-semibold text-slate-900 dark:text-white">
                        {coin}
                      </td>

                      <td className="px-4 py-3 align-top">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {tx.amount ?? "—"}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">{date}</div>
                      </td>

                      <td className="px-4 py-3 align-top">
                        <div className="max-w-[360px] break-all font-mono text-[12px] text-slate-700 dark:text-slate-200">
                          {hash}
                        </div>
                        {hash !== "—" && (
                          <button
                            className="mt-1 inline-flex rounded-md border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                            onClick={() => copyText(hash, "Tx hash copied")}
                          >
                            Copy hash
                          </button>
                        )}
                      </td>

                      <td className="px-4 py-3 align-top">{statusBadge(tx.status)}</td>

                      <td className="px-4 py-3 align-top">
                        <Button
                          variant="outline"
                          className="h-8 rounded-xl px-3 text-xs"
                          onClick={() => openDetails(tx)}
                        >
                          View
                        </Button>
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
            <span className="font-semibold text-slate-900 dark:text-white">{safePage}</span>{" "}
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

      {/* Details modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden rounded-3xl border border-slate-200 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
          <div className="border-b border-slate-200 bg-white/80 px-6 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/70">
            <div className="flex items-start justify-between gap-4">
              <DialogHeader className="space-y-1">
                <DialogTitle className="text-lg font-semibold text-slate-900 dark:text-white">
                  Deposit Details
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

            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Status
              </div>
              <div className="mt-2">{detailTx ? statusBadge(detailTx.status) : "—"}</div>
              <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                Created:{" "}
                {detailTx ? fmtDate(detailTx.createdAt || detailTx.updatedAt) : "—"}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Asset
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                {detailTx ? String(detailTx.coin || detailTx.asset || "").toUpperCase() : "—"}
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
                Tx Hash
              </div>
              <div className="mt-2 break-all font-mono text-xs text-slate-700 dark:text-slate-200">
                {detailTx?.txHash || detailTx?.hash || detailTx?.transactionHash || "—"}
              </div>
              {(detailTx?.txHash || detailTx?.hash || detailTx?.transactionHash) && (
                <div className="mt-2">
                  <Button
                    variant="outline"
                    className="h-8 rounded-xl px-3 text-xs"
                    onClick={() =>
                      copyText(
                        detailTx?.txHash || detailTx?.hash || detailTx?.transactionHash,
                        "Tx hash copied"
                      )
                    }
                  >
                    Copy hash
                  </Button>
                </div>
              )}
            </div>

            <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Record ID
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="break-all font-mono text-xs text-slate-700 dark:text-slate-200">
                  {detailTx?._id || "—"}
                </span>
                {detailTx?._id && (
                  <Button
                    variant="outline"
                    className="h-8 rounded-xl px-3 text-xs"
                    onClick={() => copyText(detailTx._id, "Record ID copied")}
                  >
                    Copy
                  </Button>
                )}
              </div>
            </div>

            {detailTx?.note && (
              <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Note
                </div>
                <div className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                  {String(detailTx.note)}
                </div>
              </div>
            )}
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

export default DepositsPage;
