import { useEffect, useMemo, useState } from "react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { toast } from "react-hot-toast";
import { useSearchParams } from "react-router-dom";

const API_BASE = "https://wallet-backend-pkxi.onrender.com";
const PURPLE_BTN = "bg-purple-600 text-white hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700";

const NETWORKS = [
  { key: "ERC20", label: "ERC20", hint: "Ethereum / 0x… (EVM)" },
  { key: "BEP20", label: "BEP20", hint: "BSC / 0x… (EVM)" },
  { key: "TRC20", label: "TRC20", hint: "Tron / T… address" },
  { key: "BTC", label: "BTC", hint: "Bitcoin / bc1… or 1…" },
  { key: "SOL", label: "SOL", hint: "Solana / base58 address" },
];

function safeTrim(v) {
  return (v ?? "").toString().trim();
}

function coinFromNetwork(network) {
  const net = String(network || "").toUpperCase();
  if (net === "TRC20") return "usdt";     // backend accepts "usdt"
  // For ERC20/BEP20 we just use "ethereum" to satisfy backend validation
  return "ethereum";
}

function formatDate(v) {
  if (!v) return "";
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString();
  } catch {
    return "";
  }
}

function badgeClass(status) {
  const s = String(status || "").toLowerCase();
  if (s === "available") return "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200";
  if (s === "assigned") return "bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-200";
  if (s === "disabled") return "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-200";
  return "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200";
}

function validateAddressByNetwork(network, address) {
  const v = safeTrim(address);
  if (!v) return { ok: true, message: "" }; 

  const net = String(network || "").toUpperCase();

  if (net === "ERC20" || net === "BEP20") {
    if (!/^0x[a-fA-F0-9]{40}$/.test(v)) {
      return { ok: false, message: `${net} address should look like 0x + 40 hex chars.` };
    }
    return { ok: true, message: "" };
  }

  if (net === "TRC20") {
    const looksTron = /^T[1-9A-HJ-NP-Za-km-z]{25,40}$/.test(v);
    if (!looksTron) {
      return { ok: false, message: "TRC20 (Tron) address looks invalid (usually starts with T...)." };
    }
    return { ok: true, message: "" };
  }

  if (net === "BTC") {
    const btc =
      /^(bc1)[a-zA-HJ-NP-Z0-9]{25,90}$/.test(v) ||
      /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(v);

    if (!btc) {
      return { ok: false, message: "Invalid BTC address format." };
    }
    return { ok: true, message: "" };
  }

  if (net === "SOL") {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)) {
      return { ok: false, message: "Invalid Solana address." };
    }
    return { ok: true, message: "" };
  }

  // unknown network: basic sanity
  if (v.length < 8) return { ok: false, message: "Address looks too short." };
  return { ok: true, message: "" };
}

function PurpleChip({ children }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-900 dark:bg-purple-900/30 dark:text-purple-200">
      {children}
    </span>
  );
}

function SectionCard({ title, subtitle, right, children }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shadow-sm">
      <div className="p-5 border-b border-gray-100 dark:border-gray-900 flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">{title}</div>
          {subtitle ? <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{subtitle}</div> : null}
        </div>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export default function WalletsPage() {

  const [searchParams] = useSearchParams();

  const initialId = safeTrim(searchParams.get("id"));
  const initialEmail = safeTrim(searchParams.get("email"));

  // Tabs
  const [tab, setTab] = useState("user"); // "user" | "pool"

  // Auth
  const token = useMemo(() => localStorage.getItem("token"), []);

  // ----------------------------
  // USER NETWORK OVERRIDE SECTION
  // ----------------------------
  const [userId, setUserId] = useState(initialId);
  const [email, setEmail] = useState(initialEmail);
  const [user, setUser] = useState(null);

  const [wallets, setWallets] = useState(null);
  const [originalWallets, setOriginalWallets] = useState(null);
  const [editing, setEditing] = useState({});
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [pendingNetwork, setPendingNetwork] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const queryValue = useMemo(() => safeTrim(email) || safeTrim(userId), [email, userId]);

  useEffect(() => {
    if (initialId || initialEmail) {
      setTab("user"); // make sure we're on "User Network Override"
      handleSearch(); // auto search
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetUserSection = () => {
    setUserId("");
    setEmail("");
    setUser(null);
    setWallets(null);
    setOriginalWallets(null);
    setEditing({});
    setPendingNetwork(null);
    setShowModal(false);
  };

  const handleSearch = async () => {
    if (!token) return toast.error("Missing admin token. Please login again.");
    if (!queryValue) return toast.error("Please enter email or user ID");

    setIsSearching(true);
    setUser(null);
    setWallets(null);
    setOriginalWallets(null);
    setEditing({});

    try {
      const query = safeTrim(userId)
        ? `id=${encodeURIComponent(safeTrim(userId))}`
        : `email=${encodeURIComponent(safeTrim(email))}`;

      const url = `${API_BASE}/api/admin/user?${query}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error(data?.message || "Request failed");

      const userData = data?.user || data;
      if (!userData?._id) return toast.error("User not found");

      // ✅ New scheme: wallets.erc20 / wallets.bep20 / wallets.trc20
      // ✅ Fallback (won’t crash if user still has old fields)
      const nextWallets = {
       ERC20: userData.wallets?.ERC20 || "",
       BEP20: userData.wallets?.BEP20 || "",
       TRC20: userData.wallets?.TRC20 || "",
       BTC:   userData.wallets?.BTC   || "",
       SOL:   userData.wallets?.SOL   || "",
     };

      setUser(userData);
      setWallets(nextWallets);
      setOriginalWallets(nextWallets);
      toast.success("User loaded");
    } catch (err) {
      console.error("Search error:", err);
      toast.error("Error searching user");
    } finally {
      setIsSearching(false);
    }
  };

  const openConfirmSave = (networkKey) => {
    const v = wallets?.[networkKey] ?? "";
    const check = validateAddressByNetwork(networkKey, v);
    if (!check.ok) return toast.error(check.message);

    setPendingNetwork(networkKey);
    setShowModal(true);
  };

  const handleUpdate = async () => {
    if (!pendingNetwork || !user?._id || !wallets) return setShowModal(false);
    if (!token) {
      toast.error("Missing admin token. Please login again.");
      return setShowModal(false);
    }

    const network = pendingNetwork;
    const address = safeTrim(wallets[network]);

    setIsSaving(true);
    setShowModal(false);

    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${user._id}/wallet`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          network,
          address,

          // If your backend STILL requires coin, uncomment and map it here:
          // coin: network === "TRC20" ? "usdt" : "ethereum",
        }),
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result?.message || `${network} update failed`);

      toast.success(`${network} updated`);
      setOriginalWallets((prev) => ({ ...(prev || {}), [network]: address }));
      setEditing((prev) => ({ ...prev, [network]: false }));
    } catch (err) {
      console.error("Update error:", err);
      toast.error(err.message || "Update failed");
    } finally {
      setIsSaving(false);
      setPendingNetwork(null);
    }
  };

  const handleCopy = async (text) => {
    const v = safeTrim(text);
    if (!v) return toast.error("Nothing to copy");
    try {
      await navigator.clipboard.writeText(v);
      toast.success("Copied!");
    } catch {
      toast.error("Copy failed (permission blocked)");
    }
  };

  const handleCancelNetwork = (networkKey) => {
    setWallets((prev) => ({ ...(prev || {}), [networkKey]: originalWallets?.[networkKey] || "" }));
    setEditing((prev) => ({ ...prev, [networkKey]: false }));
  };

  // ----------------------------
  // ADDRESS POOL SECTION (NETWORKS)
  // ----------------------------
  const [poolNetwork, setPoolNetwork] = useState("ERC20");
  const [poolStatus, setPoolStatus] = useState(""); // "", "available", "assigned", "disabled"
  const [poolPage, setPoolPage] = useState(1);
  const [poolLimit, setPoolLimit] = useState(10);

  const [poolCounts, setPoolCounts] = useState({});
  const [poolTotal, setPoolTotal] = useState(0);
  const [poolItems, setPoolItems] = useState([]);
  const [poolLoading, setPoolLoading] = useState(false);

  const [newAddress, setNewAddress] = useState("");
  const [newNotes, setNewNotes] = useState("");

  const DEFAULT_BULK_TEMPLATE = `ERC20,
BEP20,
TRC20,
BTC,
SOL,`;

  const [bulkText, setBulkText] = useState(() => {
    return localStorage.getItem("wallet_pool_bulk_template") || DEFAULT_BULK_TEMPLATE;
  });

  useEffect(() => {
    localStorage.setItem("wallet_pool_bulk_template", bulkText);
  }, [bulkText]);

  const poolQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (poolNetwork) params.set("network", poolNetwork);
    if (poolStatus) params.set("status", poolStatus);
    params.set("page", String(poolPage));
    params.set("limit", String(poolLimit));
    return params.toString();
  }, [poolNetwork, poolStatus, poolPage, poolLimit]);

  const fetchPool = async () => {
    if (!token) return toast.error("Missing admin token. Please login again.");
    setPoolLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/address-pool?${poolQueryString}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Failed to load pool");

      setPoolItems(Array.isArray(data?.items) ? data.items : []);
      setPoolTotal(Number(data?.total || 0));
      setPoolCounts(data?.counts || {});
    } catch (err) {
      console.error("Pool fetch error:", err);
      toast.error(err.message || "Failed to load pool");
    } finally {
      setPoolLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "pool") fetchPool();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, poolQueryString]);

  const poolPages = useMemo(() => {
    const totalPages = Math.ceil((poolTotal || 0) / (poolLimit || 20));
    return Math.max(totalPages, 1);
  }, [poolTotal, poolLimit]);

  const handleAddPoolAddress = async () => {
    if (!token) return toast.error("Missing admin token. Please login again.");

    const addr = safeTrim(newAddress);
    if (!addr) return toast.error("Address is required");

    const check = validateAddressByNetwork(poolNetwork, addr);
    if (!check.ok) return toast.error(check.message);

    try {
      const res = await fetch(`${API_BASE}/api/admin/address-pool`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          address: addr,
          network: poolNetwork,
          coin: coinFromNetwork(poolNetwork),
          notes: safeTrim(newNotes),

          // If backend still requires coin, uncomment:
          // coin: poolNetwork === "TRC20" ? "usdt" : "ethereum",
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Failed to add address");

      toast.success("Address added to pool");
      setNewAddress("");
      setNewNotes("");
      setPoolPage(1);
      await fetchPool();
    } catch (err) {
      console.error("Add pool address error:", err);
      toast.error(err.message || "Failed to add address");
    }
  };

  const parseBulkLines = () => {
    const lines = bulkText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const items = [];

    for (const line of lines) {
      // network,address
      if (line.includes(",")) {
        const parts = line.split(",").map((p) => p.trim());
        if (parts.length >= 2) {
          const [networkRaw, ...rest] = parts;
          const network = String(networkRaw || "").toUpperCase();
          const address = rest.join(",").trim();
          items.push({ network, address, coin: coinFromNetwork(network) });
          continue;
        }
      }

      // address only => uses selected poolNetwork
      items.push({ network: poolNetwork, address: line, coin: coinFromNetwork(poolNetwork) });
    }

    return items;
  };

  const handleBulkAdd = async () => {
    if (!token) return toast.error("Missing admin token. Please login again.");

    const items = parseBulkLines();
    if (!items.length) return toast.error("Paste at least 1 line");

    for (const it of items) {
      const addr = safeTrim(it.address);
      const net = String(it.network || "").toUpperCase();
      if (!addr) return toast.error("One or more lines have empty address");
      if (!net) return toast.error("One or more lines have empty network");
      const check = validateAddressByNetwork(net, addr);
      if (!check.ok) return toast.error(`Bulk invalid: ${net} - ${check.message}`);
    }

    try {
      const res = await fetch(`${API_BASE}/api/admin/address-pool/bulk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ items }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 207) throw new Error(data?.message || "Bulk add failed");

      if (res.status === 207) {
        toast.success(`Bulk added (partial). Inserted: ${data?.insertedCount ?? "?"}`);
      } else {
        toast.success(`Bulk added. Inserted: ${data?.insertedCount ?? items.length}`);
      }

      setBulkText("");
      setPoolPage(1);
      await fetchPool();
    } catch (err) {
      console.error("Bulk add error:", err);
      toast.error(err.message || "Bulk add failed");
    }
  };

  const handleDisableEnable = async (id, mode) => {
    if (!token) return toast.error("Missing admin token. Please login again.");
    try {
      const res = await fetch(`${API_BASE}/api/admin/address-pool/${id}/${mode}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Action failed");
      toast.success(mode === "disable" ? "Disabled" : "Enabled");
      await fetchPool();
    } catch (err) {
      console.error("Disable/enable error:", err);
      toast.error(err.message || "Action failed");
    }
  };

  // ----------------------------
  // UI
  // ----------------------------
  return (
    <div className="p-6 space-y-6">
      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => setTab("user")}
          className={tab === "user" ? "{PURPLE_BTN}" : ""}
          variant={tab === "user" ? "default" : "outline"}
        >
          User Network Override
        </Button>

        <Button
          onClick={() => setTab("pool")}
          className={tab === "pool" ? "{PURPLE_BTN}" : ""}
          variant={tab === "pool" ? "default" : "outline"}
        >
          Address Pool (Networks)
        </Button>

        <Button
          variant="outline"
          onClick={() => {
            if (tab === "user") resetUserSection();
            if (tab === "pool") {
              setPoolNetwork("ERC20");
              setPoolStatus("");
              setPoolPage(1);
              setPoolLimit(20);
              setNewAddress("");
              setNewNotes("");
              setBulkText("");
              toast.success("Pool reset");
            }
          }}
        >
          Reset
        </Button>
      </div>

      {/* ---------------- USER TAB ---------------- */}
      {tab === "user" && (
        <div className="space-y-6">
          <SectionCard
            title="Find User"
            subtitle="Search by email or user ID, then edit stored network addresses."
            right={
              <div className="flex items-center gap-2">
                <PurpleChip>Admin</PurpleChip>
              </div>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-4">
                <label className="text-sm text-gray-600 dark:text-gray-300">User ID</label>
                <Input
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="Enter User ID"
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
              </div>

              <div className="md:col-span-4">
                <label className="text-sm text-gray-600 dark:text-gray-300">Email</label>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter Email"
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
              </div>

              <div className="md:col-span-4 flex gap-2">
                <Button
                  className="w-full {PURPLE_BTN}"
                  onClick={handleSearch}
                  disabled={isSearching || !queryValue}
                >
                  {isSearching ? "Searching..." : "Search"}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setUser(null);
                    setWallets(null);
                    setOriginalWallets(null);
                    setEditing({});
                    setPendingNetwork(null);
                    setShowModal(false);
                  }}
                  disabled={isSearching || isSaving}
                >
                  Clear Result
                </Button>
              </div>
            </div>
          </SectionCard>

          {user && (
            <SectionCard
              title="User Loaded"
              subtitle="Make sure you’re editing the correct user."
              right={
                <Button variant="outline" onClick={() => handleCopy(user?._id)}>
                  Copy User ID
                </Button>
              }
            >
              <div className="flex flex-col gap-2">
                <div className="text-sm text-gray-500 dark:text-gray-400">Email</div>
                <div className="text-base font-semibold">{user.email}</div>

                <div className="text-sm text-gray-500 dark:text-gray-400 mt-2">User ID</div>
                <div className="font-mono text-sm break-all">{user._id}</div>
              </div>
            </SectionCard>
          )}

          {user && wallets && (
            <SectionCard
              title="Network Deposit Addresses"
              subtitle="Edit per network, save one-by-one with confirmation."
              right={
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Status: {isSaving ? "Saving..." : "Ready"}
                </div>
              }
            >
              <div className="space-y-3">
                {NETWORKS.map((n) => {
                  const value = wallets?.[n.key] ?? "";
                  const base = originalWallets?.[n.key] ?? "";
                  const dirty = safeTrim(value) !== safeTrim(base);
                  const isEdit = !!editing?.[n.key];
                  const validation = isEdit ? validateAddressByNetwork(n.key, value) : { ok: true, message: "" };

                  return (
                    <div
                      key={n.key}
                      className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4"
                    >
                      <div className="flex flex-col md:flex-row md:items-center gap-3">
                        <div className="md:w-[240px]">
                          <div className="font-semibold">{n.label} Address</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{n.hint}</div>
                          {dirty ? (
                            <div className="mt-2 inline-flex text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
                              Unsaved changes
                            </div>
                          ) : null}
                        </div>

                        <div className="flex-1">
                          <Input
                            value={value}
                            readOnly={!isEdit}
                            onChange={(e) => setWallets((prev) => ({ ...(prev || {}), [n.key]: e.target.value }))}
                            className={`h-11 font-mono ${!isEdit ? "bg-gray-50 dark:bg-gray-900" : "bg-white dark:bg-gray-950"}`}
                          />
                          {isEdit && !validation.ok ? (
                            <div className="mt-1 text-xs text-red-500">{validation.message}</div>
                          ) : null}
                        </div>

                        <div className="flex gap-2 md:w-[320px] md:justify-end">
                          {!isEdit ? (
                            <>
                              <Button
                                className={PURPLE_BTN}
                                onClick={() => setEditing((prev) => ({ ...prev, [n.key]: true }))}
                                disabled={isSearching || isSaving}
                              >
                                Edit
                              </Button>
                              <Button variant="outline" onClick={() => handleCopy(value)} disabled={isSearching || isSaving}>
                                Copy
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                className="bg-emerald-600 text-white hover:bg-emerald-700"
                                onClick={() => openConfirmSave(n.key)}
                                disabled={isSaving || !dirty}
                              >
                                Save
                              </Button>
                              <Button variant="outline" onClick={() => handleCancelNetwork(n.key)} disabled={isSaving}>
                                Cancel
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}

          {/* Confirm Modal */}
          {showModal && pendingNetwork && (
            <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
              <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 p-5">
                <div className="text-lg font-semibold">Confirm Save</div>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                  You’re about to update{" "}
                  <span className="font-semibold">{pendingNetwork}</span> for{" "}
                  <span className="font-semibold">{user?.email}</span>.
                </p>

                <div className="mt-4 space-y-2">
                  <div className="text-xs text-gray-500 dark:text-gray-400">New address</div>
                  <div className="rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-3 font-mono text-xs break-all">
                    {safeTrim(wallets?.[pendingNetwork]) || "(empty)"}
                  </div>
                </div>

                <div className="mt-5 flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setShowModal(false)} disabled={isSaving}>
                    Cancel
                  </Button>
                  <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={handleUpdate} disabled={isSaving}>
                    {isSaving ? "Saving..." : "Yes, Save"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------------- POOL TAB ---------------- */}
      {tab === "pool" && (
        <div className="space-y-6">
          <SectionCard
            title="Address Pool Overview"
            subtitle="Manage the preloaded deposit addresses used for auto-assignment on signup."
            right={
              <div className="flex items-center gap-2">
                <PurpleChip>Available: {poolCounts?.available ?? 0}</PurpleChip>
                <PurpleChip>Assigned: {poolCounts?.assigned ?? 0}</PurpleChip>
                <PurpleChip>Disabled: {poolCounts?.disabled ?? 0}</PurpleChip>
              </div>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-3">
                <label className="text-sm text-gray-600 dark:text-gray-300">Network</label>
                <select
                  value={poolNetwork}
                  onChange={(e) => {
                    setPoolNetwork(e.target.value);
                    setPoolPage(1);
                  }}
                  className="w-full h-11 rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 text-sm"
                >
                  {NETWORKS.map((n) => (
                    <option key={n.key} value={n.key}>{n.key}</option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-3">
                <label className="text-sm text-gray-600 dark:text-gray-300">Status</label>
                <select
                  value={poolStatus}
                  onChange={(e) => {
                    setPoolStatus(e.target.value);
                    setPoolPage(1);
                  }}
                  className="w-full h-11 rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 text-sm"
                >
                  <option value="">All</option>
                  <option value="available">Available</option>
                  <option value="assigned">Assigned</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>

              <div className="md:col-span-3 flex gap-2">
                <Button
                  className="w-full {PURPLE_BTN}"
                  onClick={() => fetchPool()}
                  disabled={poolLoading}
                >
                  {poolLoading ? "Loading..." : "Refresh"}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setPoolPage(1);
                    setPoolLimit(20);
                  }}
                  disabled={poolLoading}
                >
                  Default Page
                </Button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Add single */}
              <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4">
                <div className="font-semibold">Add Address (Single)</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Adds one address into the pool as <span className="font-semibold">available</span>.
                </div>

                <div className="mt-3 space-y-2">
                  <Input
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    placeholder="Paste address here"
                    className="font-mono"
                  />
                  <Input
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder="Notes (optional)"
                  />
                  <Button className="w-full bg-emerald-600 text-white hover:bg-emerald-700" onClick={handleAddPoolAddress}>
                    Add to Pool
                  </Button>
                </div>
              </div>

              {/* Bulk */}
              <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4">
                <div className="font-semibold">Bulk Add</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  One per line. Either:
                  <div className="mt-1 font-mono text-[11px]">
                    address <span className="text-gray-400">(uses selected network)</span>
                    <br />
                    network,address
                  </div>
                </div>

                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  rows={6}
                  className="mt-3 w-full rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-3 text-sm font-mono"
                  placeholder={`Example:\n0xabc...\nERC20,0xabc...\nTRC20,Txxxx...`}
                />
                <Button className="w-full mt-2 bg-emerald-600 text-white hover:bg-emerald-700" onClick={handleBulkAdd}>
                  Bulk Add
                </Button>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Pool List"
            subtitle={`Showing ${poolItems.length} of ${poolTotal}`}
            right={
              <div className="flex items-center gap-2">
                <div className="text-xs text-gray-500 dark:text-gray-400">Rows</div>
                <select
                  value={poolLimit}
                  onChange={(e) => {
                    setPoolLimit(Number(e.target.value));
                    setPoolPage(1);
                  }}
                  className="h-9 rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 text-sm"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 dark:text-gray-400">
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Network</th>
                    <th className="py-2 pr-4">Address</th>
                    <th className="py-2 pr-4">Assigned To</th>
                    <th className="py-2 pr-4">Assigned At</th>
                    <th className="py-2 pr-0 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {poolLoading ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-gray-500 dark:text-gray-400">
                        Loading...
                      </td>
                    </tr>
                  ) : poolItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-gray-500 dark:text-gray-400">
                        No rows found for current filters.
                      </td>
                    </tr>
                  ) : (
                    poolItems.map((it) => {
                      const status = it.status || "available";
                      const network = (it.network || it.chain || "-").toString().toUpperCase();
                      return (
                        <tr key={it._id} className="border-t border-gray-100 dark:border-gray-900">
                          <td className="py-3 pr-4">
                            <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${badgeClass(status)}`}>
                              {String(status).toUpperCase()}
                            </span>
                          </td>
                          <td className="py-3 pr-4">{network}</td>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs break-all">{it.address}</span>
                              <Button variant="outline" className="h-8 px-3" onClick={() => handleCopy(it.address)}>
                                Copy
                              </Button>
                            </div>
                          </td>
                          <td className="py-3 pr-4">
                            <span className="font-mono text-xs break-all">{it.assignedTo || "-"}</span>
                          </td>
                          <td className="py-3 pr-4">{formatDate(it.assignedAt) || "-"}</td>
                          <td className="py-3 pr-0">
                            <div className="flex justify-end gap-2">
                              {String(status).toLowerCase() === "disabled" ? (
                                <Button
                                  className="h-8 px-3 bg-emerald-600 text-white hover:bg-emerald-700"
                                  onClick={() => handleDisableEnable(it._id, "enable")}
                                >
                                  Enable
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  className="h-8 px-3"
                                  onClick={() => handleDisableEnable(it._id, "disable")}
                                  disabled={String(status).toLowerCase() === "assigned"}
                                  title={String(status).toLowerCase() === "assigned" ? "Assigned addresses cannot be disabled" : "Disable"}
                                >
                                  Disable
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Page <span className="font-semibold">{poolPage}</span> of <span className="font-semibold">{poolPages}</span>
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setPoolPage((p) => Math.max(p - 1, 1))}
                  disabled={poolPage <= 1 || poolLoading}
                >
                  Prev
                </Button>
                <Button
                  className={PURPLE_BTN}
                  onClick={() => setPoolPage((p) => Math.min(p + 1, poolPages))}
                  disabled={poolPage >= poolPages || poolLoading}
                >
                  Next
                </Button>
              </div>
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
