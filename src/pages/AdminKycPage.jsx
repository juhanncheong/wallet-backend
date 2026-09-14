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
const STATUSES = ["ALL", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED"];
const API_BASE = "https://wallet-backend-pkxi.onrender.com";

function fmtDate(d) {
  if (!d) return "-";
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return "-";

  return t.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function fetchImageBlobUrl(url, token) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Failed to load image (${res.status})`);
  }

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export default function AdminKycPage() {
  const token = localStorage.getItem("token");

  const [status, setStatus] = useState("ALL");
  const [searchUserId, setSearchUserId] = useState("");

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState(null);

  const [imgFront, setImgFront] = useState(null);
  const [imgBack, setImgBack] = useState(null);
  const [imgSelfie, setImgSelfie] = useState(null);
  const [loadingImgs, setLoadingImgs] = useState(false);

  const [rejectReason, setRejectReason] = useState("");

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil((total || 0) / PAGE_SIZE));
  }, [total]);

  const buildQuery = () => {
    const qs = new URLSearchParams();

    if (status && status !== "ALL") qs.set("status", status);
    if (searchUserId.trim()) qs.set("userId", searchUserId.trim());

    qs.set("page", String(page));
    qs.set("limit", String(PAGE_SIZE));

    return qs.toString();
  };

  const fetchKyc = async () => {
    if (!token) return toast.error("Missing admin token");

    try {
      const res = await fetch(`${API_BASE}/api/admin/kyc?${buildQuery()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Failed to fetch KYC list");

      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total || 0));
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Error fetching KYC list");
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchKyc();
    }, 350);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status, searchUserId]);

  useEffect(() => {
    setPage(1);
  }, [status, searchUserId]);

  const handleRefresh = () => {
    fetchKyc();
  };

  const cleanupBlobUrls = () => {
    if (imgFront) URL.revokeObjectURL(imgFront);
    if (imgBack) URL.revokeObjectURL(imgBack);
    if (imgSelfie) URL.revokeObjectURL(imgSelfie);

    setImgFront(null);
    setImgBack(null);
    setImgSelfie(null);
  };

  const openSubmission = async (row) => {
    setSelected(row);
    setRejectReason(row.rejectReason || "");
    cleanupBlobUrls();

    setLoadingImgs(true);

    try {
      const [front, back, selfie] = await Promise.all([
        fetchImageBlobUrl(`${API_BASE}/api/admin/kyc/${row._id}/file/idFront`, token),
        fetchImageBlobUrl(`${API_BASE}/api/admin/kyc/${row._id}/file/idBack`, token),
        fetchImageBlobUrl(`${API_BASE}/api/admin/kyc/${row._id}/file/selfie`, token),
      ]);

      setImgFront(front);
      setImgBack(back);
      setImgSelfie(selfie);
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to load one or more images");
    } finally {
      setLoadingImgs(false);
    }
  };

  const closeModal = () => {
    setSelected(null);
    setRejectReason("");
    cleanupBlobUrls();
  };

  const callAction = async (id, action, body) => {
    if (!token) return toast.error("Missing admin token");

    try {
      const res = await fetch(`${API_BASE}/api/admin/kyc/${id}/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || `Action failed (${res.status})`);

      toast.success(data.message || "Updated");
      await fetchKyc();

      if (selected?._id === id && data.kyc) {
        setSelected(data.kyc);
        setRejectReason(data.kyc.rejectReason || "");
      }
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Something went wrong");
    }
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f3f4f6] px-6 py-6 text-slate-900 dark:bg-[#030712] dark:text-slate-100">
      <div className="mb-5 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#0F172A]">
        <div className="grid gap-4 sm:grid-cols-[180px,minmax(0,1fr),auto] sm:items-end">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Status
            </label>

            <select
              className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === "ALL" ? "All statuses" : s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Smart Search: User ID
            </label>

            <Input
              value={searchUserId}
              onChange={(e) => setSearchUserId(e.target.value)}
              placeholder="Type user ID..."
              className="h-11 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <Button className="h-11 sm:w-28" variant="outline" onClick={handleRefresh}>
            Refresh
          </Button>
        </div>

        <div className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
          Tip: Type a user ID and it searches automatically.
        </div>
      </div>

      <div className="mb-5 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#0F172A]">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:text-slate-200">
          KYC Submissions ({total})
        </div>

        <div className="w-full overflow-hidden">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-[#020617] dark:text-slate-400">
                <th className="w-[17%] px-4 py-4 text-left">
                  User ID
                </th>
            
                <th className="w-[24%] px-4 py-4 text-left">
                  Name
                </th>
            
                <th className="w-[10%] px-4 py-4 text-left">
                  DOB
                </th>
            
                <th className="w-[12%] px-4 py-4 text-left">
                  Country
                </th>
            
                <th className="w-[12%] px-4 py-4 text-left">
                  Status
                </th>
            
                <th className="w-[12%] px-4 py-4 text-left">
                  Submitted
                </th>
            
                <th className="w-[13%] px-4 py-4 text-center">
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              {items.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-10 text-center text-slate-500 dark:text-slate-400"
                  >
                    No KYC submissions found.
                  </td>
                </tr>
              )}

              {items.map((row, idx) => (
                <tr
                  key={row._id}
                  className="border-b last:border-0 hover:bg-slate-50/70 dark:border-slate-800 dark:hover:bg-slate-800/50"
                >
                  <td className="px-4 py-4 align-top">
                    <div className="max-w-full truncate font-mono text-[11px] text-slate-700 dark:text-slate-300">
                      {row.userId}
                    </div>
                    <div className="max-w-full truncate font-mono text-[10px] text-slate-400 dark:text-slate-500">
                      {row._id}
                    </div>
                  </td>

                  <td className="px-5 py-5 align-top">
                    <div className="truncate font-semibold text-slate-900 dark:text-slate-100">
                      {row.fullName || "-"}
                    </div>
                  </td>

                  <td className="whitespace-nowrap px-5 py-5 align-top text-xs text-slate-600 dark:text-slate-300">
                    {row.dob ? new Date(row.dob).toLocaleDateString("en-US") : "-"}
                  </td>

                  <td className="whitespace-nowrap px-5 py-5 align-top text-xs text-slate-600 dark:text-slate-300">
                    {row.country || "-"}
                  </td>

                  <td className="whitespace-nowrap px-5 py-5 align-top">
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {row.status}
                    </span>
                  </td>

                  <td className="whitespace-nowrap px-5 py-5 align-top text-xs text-slate-600 dark:text-slate-300">
                    {fmtDate(row.submittedAt)}
                  </td>

                  <td className="px-4 py-4 align-top text-center">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-3 text-xs"
                      onClick={() => openSubmission(row)}
                    >
                      Review
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
        <div>
          Page {page} of {totalPages} • Total {total}
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
        <Dialog open={!!selected} onOpenChange={(open) => !open && closeModal()}>
          <DialogContent className="max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white p-0 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 px-6 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
              <DialogHeader className="space-y-1">
                <DialogTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  KYC Review
                </DialogTitle>

                <DialogDescription className="text-sm text-slate-600 dark:text-slate-300">
                  Status:{" "}
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {selected.status}
                  </span>{" "}
                  • Submitted: {fmtDate(selected.submittedAt)}
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="grid gap-5 px-6 py-5 md:grid-cols-[320px,1fr]">
              <div className="space-y-4 md:border-r md:border-slate-100 md:pr-4 dark:md:border-slate-800">
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    User
                  </div>

                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    User ID
                  </div>
                  <div className="text-[11px] text-slate-800 dark:text-slate-100">
                    {selected.userId}
                  </div>

                  <div className="mt-3 text-xs text-slate-600 dark:text-slate-300">
                    Full name
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {selected.fullName || "-"}
                  </div>

                  <div className="mt-3 text-xs text-slate-600 dark:text-slate-300">
                    DOB
                  </div>
                  <div className="text-sm text-slate-900 dark:text-slate-100">
                    {selected.dob
                      ? new Date(selected.dob).toLocaleDateString("en-US")
                      : "-"}
                  </div>

                  <div className="mt-3 text-xs text-slate-600 dark:text-slate-300">
                    Country
                  </div>
                  <div className="text-sm text-slate-900 dark:text-slate-100">
                    {selected.country || "-"}
                  </div>

                  {selected.rejectReason && (
                    <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 dark:border-red-500/20 dark:bg-red-500/10">
                      <div className="text-xs font-semibold text-red-700 dark:text-red-300">
                        Reject reason
                      </div>
                      <div className="mt-1 text-sm text-red-700 dark:text-red-300">
                        {selected.rejectReason}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2 rounded-2xl border border-slate-100 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Actions
                  </div>

                  <Button
                    className="w-full"
                    variant="outline"
                    disabled={selected.status !== "SUBMITTED"}
                    onClick={() => callAction(selected._id, "under-review")}
                  >
                    Mark UNDER_REVIEW
                  </Button>

                  <Button
                    className="w-full"
                    disabled={selected.status !== "UNDER_REVIEW"}
                    onClick={() => callAction(selected._id, "approve")}
                  >
                    Approve
                  </Button>

                  <div className="pt-2">
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                      Reject reason
                    </label>

                    <Input
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="e.g. selfie unclear, ID unreadable"
                      className="dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <Button
                    className="w-full"
                    variant="destructive"
                    disabled={selected.status !== "UNDER_REVIEW" || !rejectReason.trim()}
                    onClick={() =>
                      callAction(selected._id, "reject", {
                        reason: rejectReason.trim(),
                      })
                    }
                  >
                    Reject
                  </Button>

                  <Button className="w-full" variant="outline" onClick={closeModal}>
                    Close
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Documents
                </div>

                {loadingImgs && (
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                    Loading images…
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                    <div className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                      ID Front
                    </div>

                    {imgFront ? (
                      <img
                        src={imgFront}
                        alt="ID Front"
                        className="max-h-[340px] w-full rounded-xl border border-slate-100 object-contain dark:border-slate-800"
                      />
                    ) : (
                      <div className="text-sm text-slate-500 dark:text-slate-400">
                        No image
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                    <div className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                      ID Back
                    </div>

                    {imgBack ? (
                      <img
                        src={imgBack}
                        alt="ID Back"
                        className="max-h-[340px] w-full rounded-xl border border-slate-100 object-contain dark:border-slate-800"
                      />
                    ) : (
                      <div className="text-sm text-slate-500 dark:text-slate-400">
                        No image
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                  <div className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Selfie
                  </div>

                  {imgSelfie ? (
                    <img
                      src={imgSelfie}
                      alt="Selfie"
                      className="max-h-[420px] w-full rounded-xl border border-slate-100 object-contain dark:border-slate-800"
                    />
                  ) : (
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      No image
                    </div>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}