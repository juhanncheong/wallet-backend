import React, { useMemo, useState } from "react";
import toast from "react-hot-toast";

const API_BASE = "https://wallet-backend-pkxi.onrender.com";

function cx(...c) {
  return c.filter(Boolean).join(" ");
}

function fmtDate(d) {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return "—";
  }
}

function maskEmail(email) {
  const s = String(email || "");
  if (!s.includes("@")) return s || "—";
  const [a, b] = s.split("@");
  if (!a) return `***@${b}`;
  if (a.length <= 2) return `${a[0]}*@${b}`;
  return `${a.slice(0, 2)}***@${b}`;
}

async function apiFetch(path, opts = {}) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg =
      data?.message ||
      (res.status === 401 || res.status === 403
        ? "Session expired. Please login again."
        : "Request failed.");
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

const Pill = ({ tone = "slate", children }) => {
  const tones = {
    slate: "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-200",
    green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
    red: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200",
    violet: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-200",
    blue: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200",
  };
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-extrabold", tones[tone])}>
      {children}
    </span>
  );
};

const Card = ({ title, sub, right, children }) => (
  <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/70 dark:bg-slate-900/40 backdrop-blur p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-extrabold text-slate-900 dark:text-white">{title}</div>
        {sub ? <div className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-300/75">{sub}</div> : null}
      </div>
      {right ? <div>{right}</div> : null}
    </div>
    <div className="mt-4">{children}</div>
  </div>
);

const Input = (props) => (
  <input
    {...props}
    className={cx(
      "w-full rounded-xl border px-3 py-2.5 text-sm font-semibold outline-none transition",
      "border-slate-200/70 bg-white dark:bg-slate-900/50 dark:border-slate-800/70 dark:text-white",
      "focus:ring-2 focus:ring-violet-500/25 focus:border-violet-400",
      props.className
    )}
  />
);

const PrimaryBtn = ({ className, ...props }) => (
  <button
    {...props}
    className={cx(
      "rounded-xl px-4 py-2.5 text-sm font-extrabold transition",
      "bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white",
      "hover:brightness-110 active:brightness-95 disabled:opacity-60 disabled:cursor-not-allowed",
      className
    )}
  />
);

const GhostBtn = ({ className, ...props }) => (
  <button
    {...props}
    className={cx(
      "rounded-xl px-4 py-2.5 text-sm font-extrabold transition",
      "border border-slate-200/70 dark:border-slate-800/70",
      "bg-white/70 dark:bg-slate-900/40 text-slate-800 dark:text-slate-100",
      "hover:bg-slate-50 dark:hover:bg-slate-900/60 active:scale-[0.99]",
      className
    )}
  />
);

const DangerBtn = ({ className, ...props }) => (
  <button
    {...props}
    className={cx(
      "rounded-xl px-4 py-2.5 text-sm font-extrabold transition",
      "bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-600 disabled:opacity-60 disabled:cursor-not-allowed",
      className
    )}
  />
);

export default function ReferralPage() {
  const [tab, setTab] = useState("user"); // "user" | "code" | "generate"

  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [generateEmail, setGenerateEmail] = useState("");

  const [codeOwner, setCodeOwner] = useState(null);
  const [userReferralInfo, setUserReferralInfo] = useState(null);

  const [loadingCode, setLoadingCode] = useState(false);
  const [loadingUser, setLoadingUser] = useState(false);
  const [loadingGen, setLoadingGen] = useState(false);
  const [loadingDelete, setLoadingDelete] = useState(false);

  const [invitedFilter, setInvitedFilter] = useState("");
  const [sortNewestFirst, setSortNewestFirst] = useState(true);

  const invitedList = useMemo(() => {
    const list = Array.isArray(userReferralInfo?.invited) ? userReferralInfo.invited : [];
    const q = invitedFilter.trim().toLowerCase();

    const filtered = q
      ? list.filter((u) => {
          const e = String(u.email || "").toLowerCase();
          const un = String(u.username || "").toLowerCase();
          return e.includes(q) || un.includes(q);
        })
      : list;

    const sorted = [...filtered].sort((a, b) => {
      const da = new Date(a.joined).getTime() || 0;
      const db = new Date(b.joined).getTime() || 0;
      return sortNewestFirst ? db - da : da - db;
    });

    return sorted;
  }, [userReferralInfo, invitedFilter, sortNewestFirst]);

  const kpis = useMemo(() => {
    const invited = Array.isArray(userReferralInfo?.invited) ? userReferralInfo.invited.length : 0;
    const refCode = userReferralInfo?.code || "—";
    const hasCode = !!userReferralInfo?.code;

    return {
      invited,
      refCode,
      hasCode,
    };
  }, [userReferralInfo]);

  async function handleCodeSearch() {
    const v = code.trim();
    if (!v) return toast.error("Enter a referral code.");

    try {
      setLoadingCode(true);
      setCodeOwner(null);

      const data = await apiFetch(`/api/admin/referral/lookup/${encodeURIComponent(v)}`);
      if (data?.success) {
        setCodeOwner(data.user);
        toast.success("Code found.");
      } else {
        toast.error("Code not found");
      }
    } catch (e) {
      toast.error(e.message || "Failed to fetch code info");
    } finally {
      setLoadingCode(false);
    }
  }

  async function handleEmailSearch() {
    const v = email.trim().toLowerCase();
    if (!v || !v.includes("@")) return toast.error("Enter a valid email.");

    try {
      setLoadingUser(true);
      setUserReferralInfo(null);
      setInvitedFilter("");

      const data = await apiFetch(`/api/admin/referral/user/${encodeURIComponent(v)}`);
      if (data?.success) {
        setUserReferralInfo(data);
        toast.success("User referral loaded.");
      } else {
        toast.error("User not found");
      }
    } catch (e) {
      toast.error(e.message || "Failed to fetch referral info");
    } finally {
      setLoadingUser(false);
    }
  }

  async function handleGenerateCode() {
    const v = generateEmail.trim().toLowerCase();
    if (!v || !v.includes("@")) return toast.error("Enter a valid email.");

    try {
      setLoadingGen(true);
      const data = await apiFetch(`/api/admin/referral/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: v }),
      });

      if (data?.code) {
        try {
          await navigator.clipboard.writeText(data.code);
          toast.success(`Generated: ${data.code} (copied)`);
        } catch {
          toast.success(`Generated: ${data.code}`);
        }
      } else {
        toast.error(data?.message || "Code already exists");
      }
    } catch (e) {
      toast.error(e.message || "Failed to generate code");
    } finally {
      setLoadingGen(false);
    }
  }

  async function handleDeleteCode() {
    const v = email.trim().toLowerCase();
    if (!v || !v.includes("@")) return toast.error("Enter a valid email (in Lookup User).");

    if (!window.confirm("Remove this user’s referral code?")) return;

    try {
      setLoadingDelete(true);
      const data = await apiFetch(`/api/admin/referral/remove/${encodeURIComponent(v)}`, {
        method: "DELETE",
      });

      if (data?.success) {
        toast.success("Referral code removed");
        setUserReferralInfo(null);
      } else {
        toast.error(data?.message || "Failed to delete code");
      }
    } catch (e) {
      toast.error(e.message || "Server error while deleting code");
    } finally {
      setLoadingDelete(false);
    }
  }

  const Tabs = (
    <div className="flex flex-wrap gap-2">
      {[
        { key: "user", label: "Lookup User" },
        { key: "code", label: "Lookup Code" },
        { key: "generate", label: "Generate Code" },
      ].map((t) => {
        const active = tab === t.key;
        return (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cx(
              "rounded-xl px-4 py-2 text-sm font-extrabold transition",
              active
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "border border-slate-200/70 dark:border-slate-800/70 bg-white/60 dark:bg-slate-900/40 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900/60"
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="w-full p-4 md:p-8 space-y-6 text-slate-800 dark:text-white">
      {/* Header (matches your other pages: NOT max-w centered) */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300/80">
            Lookup codes, view invited users, generate and revoke codes.
          </div>
        </div>
        {Tabs}
      </div>

      {/* Content */}
      {tab === "user" ? (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card
            title="Lookup by User Email"
            sub="Find a user’s referral code and invited users."
            right={<Pill tone="blue">Search</Pill>}
          >
            <div className="space-y-3">
              <label className="text-xs font-extrabold text-slate-700 dark:text-slate-200">User Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@email.com"
              />

              <div className="flex gap-2">
                <PrimaryBtn onClick={handleEmailSearch} disabled={loadingUser}>
                  {loadingUser ? "Loading..." : "Lookup User"}
                </PrimaryBtn>
                <GhostBtn
                  onClick={() => {
                    setEmail("");
                    setUserReferralInfo(null);
                    setInvitedFilter("");
                  }}
                >
                  Reset
                </GhostBtn>
              </div>

              <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/60 bg-slate-50/60 dark:bg-slate-900/30 p-3">
                <div className="text-xs font-extrabold text-slate-700 dark:text-slate-200">Tip</div>
                <div className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300/80">
                  Use this to verify referral performance before approving bonuses.
                </div>
              </div>
            </div>
          </Card>

          <div className="xl:col-span-2 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card title="Referral Code" sub="Assigned to this user">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-base font-extrabold tracking-tight">
                    {kpis.hasCode ? kpis.refCode : "—"}
                  </div>
                  <div className="flex gap-2">
                    <GhostBtn
                      onClick={async () => {
                        if (!kpis.hasCode) return toast.error("No code to copy.");
                        try {
                          await navigator.clipboard.writeText(kpis.refCode);
                          toast.success("Copied");
                        } catch {
                          toast.error("Copy failed");
                        }
                      }}
                    >
                      Copy
                    </GhostBtn>
                    <DangerBtn onClick={handleDeleteCode} disabled={loadingDelete || !kpis.hasCode}>
                      {loadingDelete ? "Removing..." : "Remove"}
                    </DangerBtn>
                  </div>
                </div>
              </Card>

              <Card title="Invited Users" sub="Total signups from this code">
                <div className="text-3xl font-black tracking-tight">{kpis.invited}</div>
                <div className="mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300/75">
                  Filter & sort the list below.
                </div>
              </Card>

              <Card title="Privacy View" sub="Masked email display">
                <div className="text-sm font-extrabold">
                  {email ? maskEmail(email) : "—"}
                </div>
                <div className="mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300/75">
                  Helps during screen shares.
                </div>
              </Card>
            </div>

            <Card
              title="Invited Users"
              sub="Search by email/username • Sort by signup date"
              right={
                <div className="flex items-center gap-2">
                  <Pill tone={kpis.invited ? "green" : "slate"}>{kpis.invited ? "Has invites" : "No invites"}</Pill>
                </div>
              }
            >
              {!userReferralInfo ? (
                <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/60 bg-white/50 dark:bg-slate-900/30 p-4">
                  <div className="text-sm font-extrabold text-slate-800 dark:text-slate-100">No user loaded</div>
                  <div className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300/80">
                    Search a user email to see their code and invited list.
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
                    <div className="flex-1">
                      <Input
                        value={invitedFilter}
                        onChange={(e) => setInvitedFilter(e.target.value)}
                        placeholder="Search invited users (email or username)"
                      />
                    </div>
                    <div className="flex gap-2">
                      <GhostBtn onClick={() => setSortNewestFirst((v) => !v)}>
                        Sort: {sortNewestFirst ? "Newest" : "Oldest"}
                      </GhostBtn>
                      <GhostBtn onClick={() => setInvitedFilter("")}>Clear</GhostBtn>
                    </div>
                  </div>

                  <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200/60 dark:border-slate-800/60">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-900/40">
                        <tr className="text-left">
                          <th className="px-4 py-3 font-extrabold text-slate-700 dark:text-slate-200">#</th>
                          <th className="px-4 py-3 font-extrabold text-slate-700 dark:text-slate-200">Email</th>
                          <th className="px-4 py-3 font-extrabold text-slate-700 dark:text-slate-200">Username</th>
                          <th className="px-4 py-3 font-extrabold text-slate-700 dark:text-slate-200">Signup</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white/60 dark:bg-slate-900/20">
                        {invitedList.length ? (
                          invitedList.map((u, idx) => (
                            <tr key={`${u.email}-${idx}`} className="border-t border-slate-200/60 dark:border-slate-800/60">
                              <td className="px-4 py-3 font-bold text-slate-600 dark:text-slate-300">{idx + 1}</td>
                              <td className="px-4 py-3 font-extrabold text-slate-900 dark:text-white">{u.email || "—"}</td>
                              <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200/90">{u.username || "—"}</td>
                              <td className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300/80">{fmtDate(u.joined)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="px-4 py-8 text-center">
                              <div className="text-sm font-extrabold text-slate-800 dark:text-slate-100">No results</div>
                              <div className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300/80">
                                Try clearing the search filter.
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "code" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="Lookup by Referral Code" sub="Find which user owns a code." right={<Pill tone="violet">Lookup</Pill>}>
            <div className="space-y-3">
              <label className="text-xs font-extrabold text-slate-700 dark:text-slate-200">Referral Code</label>
              <Input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. ABC123XYZ"
              />

              <div className="flex gap-2">
                <PrimaryBtn onClick={handleCodeSearch} disabled={loadingCode}>
                  {loadingCode ? "Searching..." : "Lookup Code"}
                </PrimaryBtn>
                <GhostBtn
                  onClick={() => {
                    setCode("");
                    setCodeOwner(null);
                  }}
                >
                  Reset
                </GhostBtn>
              </div>
            </div>
          </Card>

          <Card
            title="Result"
            sub="Owner details (if found)"
            right={<Pill tone={codeOwner ? "green" : "slate"}>{codeOwner ? "Found" : "Empty"}</Pill>}
          >
            {!codeOwner ? (
              <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/60 bg-white/50 dark:bg-slate-900/30 p-4">
                <div className="text-sm font-extrabold text-slate-800 dark:text-slate-100">No code loaded</div>
                <div className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300/80">
                  Enter a code and click lookup.
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/60 bg-slate-50/60 dark:bg-slate-900/30 p-4">
                  <div className="text-xs font-extrabold text-slate-600 dark:text-slate-300/75">Owned by</div>
                  <div className="mt-1 text-lg font-black text-slate-900 dark:text-white">{codeOwner.email || "—"}</div>
                </div>

                <div className="flex gap-2">
                  <GhostBtn
                    onClick={async () => {
                      const v = code.trim();
                      if (!v) return toast.error("Nothing to copy");
                      try {
                        await navigator.clipboard.writeText(v);
                        toast.success("Code copied");
                      } catch {
                        toast.error("Copy failed");
                      }
                    }}
                  >
                    Copy code
                  </GhostBtn>
                  <GhostBtn
                    onClick={() => {
                      if (codeOwner?.email) {
                        setEmail(codeOwner.email);
                        setTab("user");
                        toast.success("Loaded owner email into Lookup User");
                      }
                    }}
                    disabled={!codeOwner?.email}
                  >
                    Open user lookup
                  </GhostBtn>
                </div>
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {tab === "generate" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="Generate Referral Code" sub="Create a code for a user email (copies on success)." right={<Pill tone="amber">Create</Pill>}>
            <div className="space-y-3">
              <label className="text-xs font-extrabold text-slate-700 dark:text-slate-200">User Email</label>
              <Input
                type="email"
                value={generateEmail}
                onChange={(e) => setGenerateEmail(e.target.value)}
                placeholder="user@email.com"
              />
              <div className="flex gap-2">
                <PrimaryBtn onClick={handleGenerateCode} disabled={loadingGen}>
                  {loadingGen ? "Generating..." : "Generate Code"}
                </PrimaryBtn>
                <GhostBtn onClick={() => setGenerateEmail("")}>Reset</GhostBtn>
              </div>

              <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/60 bg-slate-50/60 dark:bg-slate-900/30 p-3">
                <div className="text-xs font-extrabold text-slate-700 dark:text-slate-200">Note</div>
                <div className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300/80">
                  If the backend says “already exists”, use Lookup User to view it.
                </div>
              </div>
            </div>
          </Card>

          <Card title="Quick Actions" sub="Navigate faster (optional)" right={<Pill tone="blue">Shortcuts</Pill>}>
            <div className="space-y-2">
              <GhostBtn onClick={() => setTab("user")} className="w-full text-left">
                Go to Lookup User →
              </GhostBtn>
              <GhostBtn onClick={() => setTab("code")} className="w-full text-left">
                Go to Lookup Code →
              </GhostBtn>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
