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
import { useNavigate } from "react-router-dom";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const SUPPORTED_COINS = [
  "USDT",
  "BTC",
  "ETH",
  "SOL",
  "XRP",
  "BNB",
  "DOGE",
  "ADA",
  "TRX",
  "AVAX",
  "DOT",
  "MATIC",
  "LINK",
  "LTC",
  "BCH",
  "ATOM",
  "TON",
  "XLM",
  "ETC",
  "APT",
  "OP",
  "ARB",
  "SUI",
  "NEAR",
  "FIL",
  "INJ",
  "RNDR",
  "RUNE",
  "AAVE",
  "UNI",
  "IMX",
  "GRT",
  "STX",
  "MKR",
  "ALGO",
  "KAS",
  "TIA",
  "SEI",
  "PEPE",
  "SHIB",
  "WIF",
  "BONK",
  "FLOKI",
  "JUP",
  "JTO",
  "LDO",
  "FET",
  "TAO",
  "QNT",
  "XAUT",
  "USDC",
];

const COIN_DECIMALS = {
  BTC: 8,
  ETH: 8,
  SOL: 6,
  XRP: 6,
  DOGE: 6,
  USDC: 2,
  USDT: 2,
};

const DEFAULT_DECIMALS = 6;

const UsersPage = () => {
  const [smartSearch, setSmartSearch] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [pageSize, setPageSize] = useState(10);

  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(1);

  const [selectedUser, setSelectedUser] = useState(null);
  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newCreditScore, setNewCreditScore] = useState("");

  const [balancesModalUser, setBalancesModalUser] = useState(null);
  const [coinInputs, setCoinInputs] = useState({});
  const [confirmModal, setConfirmModal] = useState(null);

  const [editCoin, setEditCoin] = useState("BTC");
  const [editAmount, setEditAmount] = useState("");
  const [editAction, setEditAction] = useState("add");
  const [adminWalletAddress, setAdminWalletAddress] = useState("");

  const token = localStorage.getItem("token");
  const navigate = useNavigate();

  const ASSET_TO_SYMBOL = {
    BITCOIN: "BTC",
    ETHEREUM: "ETH",
  };

  const normalizeSymbol = (s) => {
    const up = String(s || "")
      .trim()
      .toUpperCase();
    return ASSET_TO_SYMBOL[up] || up;
  };

  const formatLastOnline = (lastOnlineAt) => {
    if (!lastOnlineAt) return { label: "-", isOnline: false };

    const t = new Date(lastOnlineAt).getTime();
    if (!Number.isFinite(t)) return { label: "-", isOnline: false };

    const diffMs = Date.now() - t;
    const isOnline = diffMs >= 0 && diffMs < 2 * 60 * 1000;

    if (isOnline) return { label: "Online", isOnline: true };

    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return { label: `${mins}m ago`, isOnline: false };

    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return { label: `${hrs}h ago`, isOnline: false };

    const days = Math.floor(hrs / 24);
    return { label: `${days}d ago`, isOnline: false };
  };

  const getUserBalances = (user) => {
    const candidates = [user?.balances, user?.balance, user?.coins];
    const src = candidates.find((x) => x && typeof x === "object") || {};

    const normalized = {};
    for (const [k, v] of Object.entries(src)) {
      const sym = normalizeSymbol(k);
      const num = Number(v);
      if (!sym) continue;
      normalized[sym] = Number.isFinite(num) ? num : 0;
    }

    return normalized;
  };

  const formatCoin = (sym, value) => {
    const dec = COIN_DECIMALS[sym] ?? DEFAULT_DECIMALS;
    return Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: dec,
    });
  };

  const fetchUsers = async () => {
    if (!token) return;

    try {
      const res = await fetch(
        "https://wallet-backend-pkxi.onrender.com/api/admin/users",
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to fetch users");
      }

      const data = await res.json();
      const list = Array.isArray(data) ? data : [];

      list.sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime(),
      );

      setUsers(list);
      setPage(1);
    } catch (err) {
      console.error("Error fetching users:", err);
      toast.error(err.message || "Error fetching users");
    }
  };

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchUserBalances = async (userId) => {
    if (!token) return {};

    const res = await fetch(
      `https://wallet-backend-pkxi.onrender.com/api/admin/users/${userId}/balances`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Failed to fetch balances");

    const map = {};
    for (const row of data) {
      map[normalizeSymbol(row.asset)] = Number(row.available || 0);
    }

    return map;
  };

  const visibleUsers = useMemo(() => {
    const q = smartSearch.trim().toLowerCase();

    const searched = users.filter((user) => {
      if (!q) return true;

      const fields = [
        user._id,
        user.email,
        user.username,
        user.createdAt,
        user.lastOnlineAt,
        user.isFrozen ? "frozen" : "active",
        user.isWithdrawLocked ? "withdraw locked" : "withdraw unlocked",
        user.isWithdrawPinLocked ? "pin locked" : "pin ok",
        user.creditScore,
      ];

      return fields.some((field) =>
        String(field || "")
          .toLowerCase()
          .includes(q),
      );
    });

    const sorted = [...searched].sort((a, b) => {
      if (sortBy === "oldest") {
        return (
          new Date(a.createdAt || 0).getTime() -
          new Date(b.createdAt || 0).getTime()
        );
      }

      if (sortBy === "email_az") {
        return String(a.email || "").localeCompare(String(b.email || ""));
      }

      if (sortBy === "email_za") {
        return String(b.email || "").localeCompare(String(a.email || ""));
      }

      if (sortBy === "last_online") {
        return (
          new Date(b.lastOnlineAt || 0).getTime() -
          new Date(a.lastOnlineAt || 0).getTime()
        );
      }

      if (sortBy === "frozen_first") {
        return Number(Boolean(b.isFrozen)) - Number(Boolean(a.isFrozen));
      }

      if (sortBy === "withdraw_locked_first") {
        return (
          Number(Boolean(b.isWithdrawLocked)) -
          Number(Boolean(a.isWithdrawLocked))
        );
      }

      if (sortBy === "pin_locked_first") {
        return (
          Number(Boolean(b.isWithdrawPinLocked)) -
          Number(Boolean(a.isWithdrawPinLocked))
        );
      }

      if (sortBy === "credit_high") {
        return Number(b.creditScore || 0) - Number(a.creditScore || 0);
      }

      if (sortBy === "credit_low") {
        return Number(a.creditScore || 0) - Number(b.creditScore || 0);
      }

      return (
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime()
      );
    });

    return sorted;
  }, [users, smartSearch, sortBy]);

  useEffect(() => {
    setPage(1);
  }, [smartSearch, sortBy, pageSize]);

  const handleRefresh = () => {
    fetchUsers();
  };

  const handleAccountFreezeToggle = async (user) => {
    if (!token) return toast.error("Missing admin token");
    if (!user?._id) return;

    const nextFrozen = !user.isFrozen;

    const ok = window.confirm(
      nextFrozen
        ? "Freeze this user? They will NOT be able to log in."
        : "Unfreeze this user? They WILL be able to log in.",
    );
    if (!ok) return;

    const endpoint = nextFrozen ? "freeze" : "unfreeze";
    const url = `https://wallet-backend-pkxi.onrender.com/api/admin/users/${user._id}/${endpoint}`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || `Failed (${res.status})`);

      toast.success(nextFrozen ? "User frozen" : "User unfrozen");

      setSelectedUser((prev) =>
        prev ? { ...prev, isFrozen: nextFrozen } : prev,
      );

      fetchUsers();
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Something went wrong");
    }
  };

  const handleWithdrawLockToggle = async (userId) => {
    try {
      const res = await fetch(
        "https://wallet-backend-pkxi.onrender.com/api/admin/toggle-withdrawal-lock",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        },
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data.message || "Failed to update withdrawal lock");

      toast.success(data.message || "Updated withdrawal lock");

      setSelectedUser((prev) =>
        prev && prev._id === userId
          ? { ...prev, isWithdrawLocked: !prev.isWithdrawLocked }
          : prev,
      );

      fetchUsers();
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Something went wrong");
    }
  };

  const handleResetWithdrawPinLock = async (userId) => {
    if (!token) return toast.error("Missing admin token");

    const ok = window.confirm(
      "Reset withdrawal PIN attempts and unlock PIN lock for this user?",
    );
    if (!ok) return;

    try {
      const res = await fetch(
        `https://wallet-backend-pkxi.onrender.com/api/admin/users/${userId}/reset-withdrawal-pin-lock`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Failed to reset PIN lock");

      toast.success("PIN lock reset");

      setSelectedUser((prev) =>
        prev && prev._id === userId
          ? {
              ...prev,
              withdrawalPinFailCount: 0,
              isWithdrawPinLocked: false,
            }
          : prev,
      );

      fetchUsers();
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Something went wrong");
    }
  };

  const updateUserField = async (field, value) => {
    if (!token || !selectedUser || !value) return;

    const url = `https://wallet-backend-pkxi.onrender.com/api/admin/users/${selectedUser._id}/${field}`;

    const bodyKey =
      field === "password"
        ? "newPassword"
        : field === "pin"
          ? "newPin"
          : `new${field.charAt(0).toUpperCase() + field.slice(1)}`;

    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ [bodyKey]: value }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || `Failed to update ${field}`);

      toast.success(`${field} updated!`);
      setNewUsername("");
      setNewEmail("");
      setNewPassword("");
      setNewPin("");
      fetchUsers();
    } catch (err) {
      console.error(`${field} update error:`, err);
      toast.error(err.message || `Error updating ${field}`);
    }
  };

  const updateCreditScore = async () => {
    if (!token || !selectedUser) return;

    const scoreNum = Number(newCreditScore);
    if (Number.isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100) {
      return toast.error("Credit score must be between 0 and 100");
    }

    try {
      const res = await fetch(
        `https://wallet-backend-pkxi.onrender.com/api/admin/users/${selectedUser._id}/credit-score`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ creditScore: scoreNum }),
        },
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data.message || "Failed to update credit score");

      toast.success("Credit score updated!");
      setSelectedUser((prev) =>
        prev ? { ...prev, creditScore: scoreNum } : prev,
      );
      fetchUsers();
    } catch (err) {
      console.error("Credit score update error:", err);
      toast.error(err.message || "Error updating credit score");
    }
  };

  const handleCoinInputChange = (userId, coin, value) => {
    setCoinInputs((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] || {}),
        [coin]: value,
      },
    }));
  };

  const doUpdateCoinBalance = async (userId, coin, type) => {
    if (!token) return toast.error("Missing admin token");

    const coinKey = normalizeSymbol(coin);
    const raw =
      coinInputs[userId]?.[coinKey] ?? coinInputs[userId]?.[coin] ?? "";
    const amount = parseFloat(raw);

    if (isNaN(amount) || amount <= 0)
      return toast.error("Enter a valid amount");

    try {
      const res = await fetch(
        `https://wallet-backend-pkxi.onrender.com/api/admin/users/${userId}/coins`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            coin: coinKey,
            amount,
            type,
            ...(type === "add" && adminWalletAddress.trim()
              ? { walletAddress: adminWalletAddress.trim() }
              : {}),
          }),
        },
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data.message || `Failed to ${type} ${coinKey}`);

      toast.success(`${type === "add" ? "Added" : "Removed"} ${coinKey}`);
      setAdminWalletAddress("");

      const updatedRow = data?.balance;
      if (updatedRow?.asset) {
        const sym = normalizeSymbol(updatedRow.asset);
        const nextVal = Number(updatedRow.available || 0);

        setBalancesModalUser((prev) => {
          if (!prev || prev._id !== userId) return prev;

          const prevBalances =
            prev.balances && typeof prev.balances === "object"
              ? prev.balances
              : {};

          const nextBalances = { ...prevBalances };

          if (nextVal <= 0.00000001) {
            delete nextBalances[sym];
          } else {
            nextBalances[sym] = nextVal;
          }

          return {
            ...prev,
            balances: nextBalances,
          };
        });
      }

      setCoinInputs((prev) => ({
        ...prev,
        [userId]: {
          ...(prev[userId] || {}),
          [coinKey]: "",
        },
      }));

      fetchUsers();
    } catch (err) {
      console.error(`${type} coin error:`, err);
      toast.error(err.message || "Error updating coins");
    }
  };

  const totalPages = Math.max(
    1,
    Math.ceil(visibleUsers.length / pageSize || 1),
  );
  const startIndex = (page - 1) * pageSize;
  const paginatedUsers = visibleUsers.slice(startIndex, startIndex + pageSize);

  const balancesForModal = useMemo(() => {
    if (!balancesModalUser) return [];

    const b = getUserBalances(balancesModalUser);

    return Object.entries(b)
      .filter(([, v]) => Number(v) > 0)
      .sort((a, b) => b[1] - a[1]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balancesModalUser]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f3f4f6] px-6 py-6 text-slate-900 dark:bg-[#030712] dark:text-slate-100">
      <div className="mb-5 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#0F172A]">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr),220px,150px,auto] lg:items-end">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Smart Search
            </label>
            <Input
              value={smartSearch}
              onChange={(e) => setSmartSearch(e.target.value)}
              placeholder="Search email, Mongo ID, username, status, credit score..."
              className="h-11 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Sort Users
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="newest">Newest registered</option>
              <option value="oldest">Oldest registered</option>
              <option value="email_az">Email A-Z</option>
              <option value="email_za">Email Z-A</option>
              <option value="last_online">Last online</option>
              <option value="frozen_first">Frozen first</option>
              <option value="withdraw_locked_first">
                Withdraw locked first
              </option>
              <option value="pin_locked_first">PIN locked first</option>
              <option value="credit_high">Credit score high</option>
              <option value="credit_low">Credit score low</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Per Page
            </label>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} users
                </option>
              ))}
            </select>
          </div>

          <Button
            className="h-11 text-xs sm:w-28"
            variant="outline"
            onClick={handleRefresh}
          >
            Refresh
          </Button>
        </div>
      </div>

      <div className="w-full rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-[#0F172A]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:text-slate-200">
          <span>Users ({visibleUsers.length})</span>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Showing {paginatedUsers.length} of {visibleUsers.length}
          </span>
        </div>

        <div className="w-full overflow-hidden">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-[#020617] dark:text-slate-400">
                <th className="w-[24%] px-4 py-4 text-left">User</th>
                <th className="w-[18%] px-4 py-4 text-left">Mongo ID</th>
                <th className="w-[14%] px-4 py-4 text-left">Registered</th>
                <th className="w-[10%] px-4 py-4 text-left">Last Online</th>
                <th className="w-[14%] px-4 py-4 text-left">Withdrawals</th>
                <th className="w-[10%] px-4 py-4 text-left">Balances</th>
                <th className="w-[10%] px-4 py-4 text-center">More</th>
              </tr>
            </thead>

            <tbody>
              {paginatedUsers.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-10 text-center text-slate-500 dark:text-slate-400"
                  >
                    No users found.
                  </td>
                </tr>
              )}

              {paginatedUsers.map((user) => {
                const { label, isOnline } = formatLastOnline(user.lastOnlineAt);

                return (
                  <tr
                    key={user._id}
                    className="border-b last:border-0 hover:bg-slate-50/70 dark:border-slate-800 dark:hover:bg-slate-800/50"
                  >
                    <td className="px-4 py-4 align-center">
                      <div className="min-w-0">
                        <div
                          className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100"
                          title={user.email}
                        >
                          {user.email || "—"}
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-4 align-center">
                      <div
                        className="truncate text-xs text-slate-600 dark:text-slate-300"
                        title={user._id}
                      >
                        {user._id}
                      </div>
                    </td>

                    <td className="whitespace-nowrap px-4 py-4 align-center text-xs text-slate-600 dark:text-slate-300">
                      {user.createdAt
                        ? new Date(user.createdAt).toLocaleString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })
                        : "-"}
                    </td>

                    <td className="whitespace-nowrap px-4 py-4 align-center text-xs text-slate-600 dark:text-slate-300">
                      {label === "-" ? (
                        "-"
                      ) : isOnline ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                          Online
                        </span>
                      ) : (
                        <span>{label}</span>
                      )}
                    </td>

                    <td className="px-4 py-4 align-center">
                      <div className="flex items-center gap-2">
                        {user.isWithdrawLocked ? (
                          <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600 dark:bg-red-500/10 dark:text-red-300">
                            Locked
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                            Unlocked
                          </span>
                        )}

                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-3 text-xs"
                          onClick={() => handleWithdrawLockToggle(user._id)}
                        >
                          {user.isWithdrawLocked ? "Unlock" : "Lock"}
                        </Button>
                      </div>
                    </td>

                    <td className="whitespace-nowrap px-4 py-4 align-center">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-3 text-xs"
                        onClick={async () => {
                          try {
                            const balances = await fetchUserBalances(user._id);

                            setUsers((prev) =>
                              prev.map((u) =>
                                u._id === user._id ? { ...u, balances } : u,
                              ),
                            );

                            setBalancesModalUser({
                              ...user,
                              balances,
                            });

                            setEditCoin("BTC");
                            setEditAmount("");
                            setEditAction("add");
                          } catch (err) {
                            toast.error(
                              err.message || "Failed to load balances",
                            );
                          }
                        }}
                      >
                        View balances
                      </Button>
                    </td>

                    <td className="whitespace-nowrap px-4 py-4 align-center text-center">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-3 text-xs"
                        onClick={() => {
                          setSelectedUser(user);
                          setNewUsername("");
                          setNewEmail("");
                          setNewPassword("");
                          setNewPin("");
                          setNewCreditScore(
                            typeof user.creditScore === "number"
                              ? String(user.creditScore)
                              : "",
                          );
                        }}
                      >
                        More
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600 dark:text-slate-300">
        <div>
          Page {page} of {totalPages} • {pageSize} per page
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage(1)}
          >
            First
          </Button>

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

          <Button
            variant="outline"
            size="sm"
            disabled={page === totalPages}
            onClick={() => setPage(totalPages)}
          >
            Last
          </Button>
        </div>
      </div>

      {selectedUser && (
        <Dialog
          open={!!selectedUser}
          onOpenChange={(open) => {
            if (!open) setSelectedUser(null);
          }}
        >
          <DialogContent className="max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white p-0 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
              <div className="flex items-start justify-between gap-4 px-6 py-4">
                <DialogHeader className="space-y-1">
                  <DialogTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    User Settings
                  </DialogTitle>
                  <DialogDescription className="text-sm text-slate-600 dark:text-slate-300">
                    Manage account data and security for{" "}
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {selectedUser.email}
                    </span>
                  </DialogDescription>
                </DialogHeader>
              </div>
            </div>

            <div className="grid max-h-[75vh] grid-cols-1 gap-5 overflow-hidden px-6 py-5 md:grid-cols-[320px,1fr]">
              <div className="space-y-4 overflow-y-auto md:border-r md:border-slate-100 md:pr-4 dark:md:border-slate-800">
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    User
                  </div>

                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {selectedUser.email}
                  </div>

                  <div className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {selectedUser._id}
                  </div>

                  {typeof selectedUser.creditScore === "number" && (
                    <div className="mt-3 rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                      <div className="text-xs text-slate-600 dark:text-slate-300">
                        Current credit score
                      </div>
                      <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                        {selectedUser.creditScore}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2 rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Account Access
                  </p>

                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    Status:{" "}
                    {selectedUser?.isFrozen ? (
                      <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600 dark:bg-red-500/10 dark:text-red-300">
                        Frozen
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                        Active
                      </span>
                    )}
                  </div>

                  <Button
                    className="w-full"
                    variant={selectedUser?.isFrozen ? "outline" : "destructive"}
                    onClick={() => handleAccountFreezeToggle(selectedUser)}
                  >
                    {selectedUser?.isFrozen
                      ? "Unfreeze account"
                      : "Freeze account"}
                  </Button>
                </div>

                <div className="space-y-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    PIN Security
                  </p>

                  <div className="rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                    <div className="text-xs text-slate-600 dark:text-slate-300">
                      Failed attempts
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {selectedUser.withdrawalPinFailCount ?? 0}{" "}
                      <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                        / tries left{" "}
                        {Math.max(
                          0,
                          3 - (selectedUser.withdrawalPinFailCount ?? 0),
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                    <div className="text-xs text-slate-600 dark:text-slate-300">
                      PIN lock status
                    </div>
                    <div className="mt-2">
                      {selectedUser.isWithdrawPinLocked ? (
                        <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-600 dark:bg-red-500/10 dark:text-red-300">
                          Locked
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                          OK
                        </span>
                      )}
                    </div>
                  </div>

                  <Button
                    className="w-full"
                    variant="outline"
                    disabled={
                      !selectedUser.isWithdrawPinLocked &&
                      (selectedUser.withdrawalPinFailCount ?? 0) === 0
                    }
                    onClick={() => handleResetWithdrawPinLock(selectedUser._id)}
                  >
                    Reset PIN Lock
                  </Button>
                </div>
              </div>

              <div className="space-y-4 overflow-y-auto pr-1">
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    [
                      "Username",
                      "New username",
                      newUsername,
                      setNewUsername,
                      "username",
                      "text",
                    ],
                    [
                      "Email",
                      "New email",
                      newEmail,
                      setNewEmail,
                      "email",
                      "text",
                    ],
                    [
                      "Password",
                      "New password",
                      newPassword,
                      setNewPassword,
                      "password",
                      "password",
                    ],
                    [
                      "Withdrawal PIN",
                      "New PIN",
                      newPin,
                      setNewPin,
                      "pin",
                      "password",
                    ],
                  ].map(([label, placeholder, value, setter, field, type]) => (
                    <div
                      key={field}
                      className="space-y-2 rounded-2xl bg-slate-50 p-4 dark:bg-slate-950"
                    >
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                        {label}
                      </p>
                      <Input
                        placeholder={placeholder}
                        type={type}
                        value={value}
                        onChange={(e) => setter(e.target.value)}
                        className="dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                      <Button
                        className="w-full"
                        size="sm"
                        onClick={() => updateUserField(field, value)}
                      >
                        Save
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="space-y-2 rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Credit Score (0–100)
                  </p>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={newCreditScore}
                    onChange={(e) => setNewCreditScore(e.target.value)}
                    placeholder="Credit score"
                    className="dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                  <Button className="mt-2 w-full" onClick={updateCreditScore}>
                    Save Credit Score
                  </Button>
                </div>

                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedUser(null)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {balancesModalUser && (
        <Dialog
          open={!!balancesModalUser}
          onOpenChange={(open) => {
            if (!open) setBalancesModalUser(null);
          }}
        >
          <DialogContent className="max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white p-0 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 bg-white/80 px-6 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
              <DialogHeader className="space-y-1">
                <DialogTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Balances
                </DialogTitle>
                <DialogDescription className="text-sm text-slate-600 dark:text-slate-300">
                  Showing only coins with balance &gt; 0 for{" "}
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {balancesModalUser.email}
                  </span>
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="space-y-5 px-6 py-5">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                <div className="mb-3 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Current balances
                </div>

                {balancesForModal.length === 0 ? (
                  <div className="text-sm text-slate-600 dark:text-slate-300">
                    No balances yet.
                  </div>
                ) : (
                  <div className="w-full overflow-x-auto rounded-xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
                    <table className="min-w-[720px] text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                        <tr className="border-b dark:border-slate-800">
                          <th className="whitespace-nowrap px-5 py-4 text-left">
                            Coin
                          </th>
                          <th className="whitespace-nowrap px-5 py-4 text-right">
                            Balance
                          </th>
                          <th className="whitespace-nowrap px-5 py-4 text-right">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {balancesForModal.map(([sym, val]) => (
                          <tr
                            key={sym}
                            className="border-b last:border-0 dark:border-slate-800"
                          >
                            <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-900 dark:text-slate-100">
                              {sym}
                            </td>
                            <td className="whitespace-nowrap px-5 py-4 text-right text-slate-700 dark:text-slate-300">
                              {formatCoin(sym, val)}
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex items-center justify-end gap-2">
                                <Input
                                  className="h-9 w-32 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                  placeholder="Amount"
                                  value={
                                    coinInputs[balancesModalUser._id]?.[sym] ||
                                    ""
                                  }
                                  onChange={(e) =>
                                    handleCoinInputChange(
                                      balancesModalUser._id,
                                      sym,
                                      e.target.value,
                                    )
                                  }
                                />
                                <Button
                                  size="sm"
                                  className="h-9 px-3 text-[12px]"
                                  onClick={() => {
                                    setAdminWalletAddress("");
                                    setConfirmModal({
                                      action: "add",
                                      user: balancesModalUser,
                                      coin: sym,
                                    });
                                  }}
                                >
                                  Add
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-9 px-3 text-[12px]"
                                  onClick={() => {
                                    setAdminWalletAddress("");
                                    setConfirmModal({
                                      action: "remove",
                                      user: balancesModalUser,
                                      coin: sym,
                                    });
                                  }}
                                >
                                  Remove
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-100 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-3 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Add / Remove coin
                </div>

                <div className="grid gap-3 sm:grid-cols-[160px,1fr,140px,auto] sm:items-end">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                      Coin
                    </label>
                    <select
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      value={editCoin}
                      onChange={(e) => setEditCoin(e.target.value)}
                    >
                      {SUPPORTED_COINS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                      Amount
                    </label>
                    <Input
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      placeholder="e.g. 100 or 0.25"
                      className="dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                      Type
                    </label>
                    <select
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      value={editAction}
                      onChange={(e) => setEditAction(e.target.value)}
                    >
                      <option value="add">Add</option>
                      <option value="remove">Remove</option>
                    </select>
                  </div>

                  <Button
                    className="h-10"
                    variant={editAction === "add" ? "default" : "destructive"}
                    onClick={() => {
                      if (!balancesModalUser?._id) return;

                      handleCoinInputChange(
                        balancesModalUser._id,
                        editCoin,
                        editAmount,
                      );

                      setAdminWalletAddress("");
                      setConfirmModal({
                        action: editAction,
                        user: balancesModalUser,
                        coin: editCoin,
                      });
                    }}
                  >
                    Continue
                  </Button>
                </div>

                <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                  This will not set balance. It only adds/removes the amount you
                  enter.
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => {
                    const id = balancesModalUser?._id;
                    const email = balancesModalUser?.email;

                    const qs = new URLSearchParams();
                    if (id) qs.set("id", id);
                    if (email) qs.set("email", email);

                    navigate(`/wallets?${qs.toString()}`);
                    setBalancesModalUser(null);
                  }}
                >
                  View Users Wallet
                </Button>

                <Button
                  variant="outline"
                  onClick={() => setBalancesModalUser(null)}
                >
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {confirmModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-slate-100">
              Confirm {confirmModal.action === "add" ? "Add" : "Remove"}
            </h2>

            <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
              Are you sure you want to{" "}
              <span className="font-semibold">{confirmModal.action}</span>{" "}
              <span className="font-semibold">
                {coinInputs[confirmModal.user._id]?.[confirmModal.coin] || "0"}
              </span>{" "}
              <span className="font-semibold">
                {confirmModal.coin.toUpperCase()}
              </span>{" "}
              for{" "}
              <span className="font-semibold">{confirmModal.user.email}</span>?
            </p>

            {confirmModal.action === "add" && (
              <div className="mb-6 space-y-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Wallet address
                </label>
                <Input
                  value={adminWalletAddress}
                  onChange={(e) => setAdminWalletAddress(e.target.value)}
                  placeholder="Enter wallet address used for this deposit"
                  autoComplete="off"
                  className="font-mono text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Optional. If entered, this address is saved to the deposit
                  transaction so it can be shown in the user's history.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setAdminWalletAddress("");
                  setConfirmModal(null);
                }}
              >
                Cancel
              </Button>

              <Button
                variant={
                  confirmModal.action === "add" ? "default" : "destructive"
                }
                onClick={() => {
                  doUpdateCoinBalance(
                    confirmModal.user._id,
                    confirmModal.coin,
                    confirmModal.action,
                  );
                  setConfirmModal(null);
                }}
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;
