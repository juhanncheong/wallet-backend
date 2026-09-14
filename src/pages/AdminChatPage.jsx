import { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import io from "socket.io-client";
import { toast } from "react-hot-toast";

import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";

const API_BASE = "https://wallet-backend-pkxi.onrender.com";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

function safeDate(d) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString();
}

function safeTime(d) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function AdminChatPage() {
  const token = localStorage.getItem("token");

  const [loadingConvos, setLoadingConvos] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [userDetails, setUserDetails] = useState(null);

  const [query, setQuery] = useState("");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [newMsg, setNewMsg] = useState("");

  const socketRef = useRef(null);
  const scrollRef = useRef(null);
  const listRef = useRef(null);
  const selectedIdRef = useRef("");
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);

  const quickReplies = ["Hello, thanks for contacting, how can I help you?", "Please wait a moment"];

  useEffect(() => {
    selectedIdRef.current = selected?._id ? String(selected._id) : "";
  }, [selected]);

  function getAdminSenderId() {
    const adminObj = (() => {
      try {
        return JSON.parse(localStorage.getItem("admin") || "{}");
      } catch {
        return {};
      }
    })();

    return (
      adminObj._id ||
      adminObj.id ||
      adminObj.adminId ||
      (typeof selected?.agent === "object" ? selected.agent?._id : selected?.agent)
    );
  }

  function emitMessage(payload, onSuccess) {
    socketRef.current?.emit("sendChatMessage", payload, (ack) => {
      if (!ack?.ok) {
        toast.error(ack?.error || "Send failed");
        return;
      }

      onSuccess?.(ack.message);
    });
  }

  useEffect(() => {
    const onGlobalKeyDown = (e) => {
      if (e.key !== "Escape") return;
      if (!selectedIdRef.current) return;

      e.preventDefault();

      try {
        socketRef.current?.emit("leaveChat", selectedIdRef.current);
      } catch {}

      setSelected(null);
      setMessages([]);
      setUserDetails(null);
    };

    window.addEventListener("keydown", onGlobalKeyDown);
    return () => window.removeEventListener("keydown", onGlobalKeyDown);
  }, []);

  useEffect(() => {
    socketRef.current = io(API_BASE, {});

    socketRef.current.on("connect_error", (err) => {
      console.error("socket connect_error:", err);
    });

    socketRef.current.on("newChatMessage", (msg) => {
      const convoId = String(msg?.conversation || "");
      const selectedId = selectedIdRef.current;

      if (convoId && selectedId && convoId === selectedId) {
        setMessages((prev) => {
          if (msg?._id && prev.some((m) => String(m._id) === String(msg._id))) {
            return prev;
          }
          return [...prev, msg];
        });
      }

      setConversations((prev) =>
        prev.map((c) => {
          if (String(c._id) !== convoId) return c;

          const role = msg?.senderRole;
          const isOpen = selectedId === convoId;
          const incAgent = role === "customer" && !isOpen ? 1 : 0;

          return {
            ...c,
            lastMessage: msg?.message ?? c.lastMessage,
            unreadByAgent: (c.unreadByAgent || 0) + incAgent,
            updatedAt: msg?.createdAt || new Date().toISOString(),
          };
        })
      );
    });

    return () => {
      try {
        socketRef.current?.disconnect();
      } catch {}
    };
  }, []);


  useEffect(() => {
    fetchConversations();
  
    const id = setInterval(() => {
      fetchConversations();
    }, 10000);
  
    return () => clearInterval(id);
  
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function renderMessageBody(m) {
    if (m?.kind === "image" && m?.attachment?.url) {
      const src = `${API_BASE}${m.attachment.url}`;
      return (
        <a href={src} target="_blank" rel="noreferrer">
          <img
            src={src}
            alt={m.attachment?.name || "image"}
            className="max-w-[320px] rounded-2xl border border-slate-200 dark:border-slate-700"
          />
        </a>
      );
    }

    if (m?.kind === "file" && m?.attachment?.url) {
      const href = `${API_BASE}${m.attachment.url}`;
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-slate-900 underline underline-offset-2 dark:text-white"
        >
          📎 {m.attachment?.name || "Download file"}
        </a>
      );
    }

    return m?.message || "";
  }

  const fetchConversations = async () => {
    if (!token) {
      toast.error("Admin login required");
      return;
    }

    setLoadingConvos(true);

    try {
      const res = await fetch(`${API_BASE}/api/chat/admin/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401 || res.status === 403) {
        toast.error("Not authorized. Please login again.");
        return;
      }

      const data = await res.json();
      setConversations(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load conversations");
    } finally {
      setLoadingConvos(false);
    }
  };

  const openConversation = async (convo) => {
    setSelected(convo);
    setUserDetails(convo?.customer || null);
    setMessages([]);

    socketRef.current?.emit("joinChat", convo._id);

    fetch(`${API_BASE}/api/chat/admin/conversation/${convo._id}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});

    setConversations((prev) =>
      prev.map((c) =>
        String(c._id) === String(convo._id) ? { ...c, unreadByAgent: 0 } : c
      )
    );

    setLoadingMsgs(true);

    try {
      const msgRes = await fetch(`${API_BASE}/api/chat/admin/messages/${convo._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!msgRes.ok) {
        toast.error(`Messages failed (${msgRes.status})`);
        return;
      }

      const msgData = await msgRes.json();
      setMessages(Array.isArray(msgData) ? msgData : []);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load conversation");
    } finally {
      setLoadingMsgs(false);
    }
  };

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages, selected?._id]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;

    el.style.scrollBehavior = "auto";
    el.scrollTop = el.scrollHeight;
  }, [selected?._id, loadingMsgs]);

  const sendTextMessage = (textValue) => {
    const text = String(textValue || "").trim();
    if (!text || !selected) return;

    const senderId = getAdminSenderId();

    if (!senderId) {
      toast.error("Missing admin id. Save admin object in localStorage on login.");
      return;
    }

    emitMessage(
      {
        conversationId: selected._id,
        senderId,
        senderRole: "agent",
        message: text,
      },
      () => {
        setNewMsg("");
      }
    );
  };

  const sendMessage = () => {
    sendTextMessage(newMsg);
  };

  const sendQuickReply = (text) => {
    sendTextMessage(text);
  };

  async function uploadAndSendFile(file) {
    if (!file || !selected) return;

    const senderId = getAdminSenderId();

    if (!senderId) {
      toast.error("Missing admin id. Save admin object in localStorage on login.");
      return;
    }

    setUploading(true);

    try {
      const fd = new FormData();
      fd.append("file", file);

      const up = await fetch(`${API_BASE}/api/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });

      const ct = up.headers.get("content-type") || "";
      const data = ct.includes("application/json")
        ? await up.json()
        : { ok: false, message: await up.text() };

      if (!up.ok || !data.ok) {
        throw new Error(data.message || "Upload failed");
      }

      const isImage =
        file.type?.startsWith("image/") || data.file?.mime?.startsWith("image/");

      emitMessage({
        conversationId: selected._id,
        senderId,
        senderRole: "agent",
        kind: isImage ? "image" : "file",
        attachment: data.file,
        message: isImage ? "[image]" : "[file]",
      });
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    await uploadAndSendFile(file);
    e.target.value = "";
  };

  const handlePaste = async (e) => {
    if (!selected) return;

    const items = Array.from(e.clipboardData?.items || []);
    const imageItem = items.find((item) => item.type?.startsWith("image/"));

    if (!imageItem) return;

    const file = imageItem.getAsFile();
    if (!file) return;

    e.preventDefault();

    const pastedFile = new File([file], `pasted-image-${Date.now()}.png`, {
      type: file.type || "image/png",
    });

    await uploadAndSendFile(pastedFile);
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const closeConversation = async () => {
    if (!selected) return;

    try {
      const res = await fetch(`${API_BASE}/api/chat/admin/conversation/${selected._id}/close`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        toast.error("Failed to close conversation");
        return;
      }

      toast.success("Conversation closed");
      setSelected(null);
      setMessages([]);
      setUserDetails(null);
      fetchConversations();
    } catch (e) {
      console.error(e);
      toast.error("Failed to close conversation");
    }
  };

  const filteredConvos = useMemo(() => {
    const q = query.trim().toLowerCase();

    return conversations
      .filter((c) => {
        if (showUnreadOnly && !(c.unreadByAgent > 0)) return false;
        if (!q) return true;

        const u = c.customer?.username || "";
        const e = c.customer?.email || "";
        const lm = c.lastMessage || "";

        return (
          String(u).toLowerCase().includes(q) ||
          String(e).toLowerCase().includes(q) ||
          String(lm).toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  }, [conversations, query, showUnreadOnly]);

  return (
    <div className="h-[calc(100vh-80px)] w-full bg-[#f3f4f6] p-4 text-slate-900 dark:bg-[#030712] dark:text-slate-100">
      <input ref={fileInputRef} type="file" hidden onChange={handleFileChange} />

      <input
        ref={imageInputRef}
        type="file"
        hidden
        accept="image/*"
        onChange={handleFileChange}
      />

      <div className="mx-auto h-full w-full max-w-[1600px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#0F172A]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-200">
              <span className="text-lg font-black">CS</span>
            </div>

            <div>
              <div className="text-[15px] font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
                Customer Support
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Live conversations • Realtime messaging
              </div>
            </div>
          </div>

          <Button variant="outline" onClick={fetchConversations}>
            Refresh
          </Button>
        </div>

        <div className="flex h-[calc(100%-72px)]">
          <aside className="w-[340px] shrink-0 border-r border-slate-200 p-4 dark:border-slate-800">
            <div className="mb-3 flex items-center gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className="h-11 rounded-2xl border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
              />

              <Button
                variant="outline"
                onClick={() => setShowUnreadOnly((v) => !v)}
                className={cn(
                  "h-11 rounded-2xl px-4",
                  showUnreadOnly
                    ? "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-500/30 dark:bg-purple-500/20 dark:text-purple-200"
                    : ""
                )}
              >
                Unread
              </Button>
            </div>

            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Conversations
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-500">
                {filteredConvos.length}
              </div>
            </div>

            <div className="h-[calc(100%-92px)] overflow-auto pr-1">
              {loadingConvos ? (
                <div className="mt-10 text-center text-sm text-slate-500 dark:text-slate-400">
                  Loading…
                </div>
              ) : filteredConvos.length === 0 ? (
                <div className="mt-10 text-center text-sm text-slate-500 dark:text-slate-400">
                  No conversations found
                </div>
              ) : (
                filteredConvos.map((c) => {
                  const isActive = String(selected?._id || "") === String(c._id || "");
                  const email = c.customer?.email || "";
                  const badge = c.unreadByAgent || 0;
                  const status = c.status || "active";

                  return (
                    <button
                      key={c._id}
                      onClick={() => openConversation(c)}
                      className={cn(
                        "mb-2 w-full rounded-2xl border p-3 text-left transition",
                        isActive
                          ? "border-purple-200 bg-purple-50 dark:border-purple-500/30 dark:bg-purple-500/10"
                          : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-[#020617] dark:hover:bg-slate-800/50"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="truncate text-sm font-extrabold text-slate-900 dark:text-slate-100">
                            {email || "No email"}
                          </div>

                          <div
                            className={cn(
                              "rounded-full px-2 py-1 text-[10px] font-bold",
                              status === "closed"
                                ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                : status === "waiting"
                                ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/10 dark:text-yellow-300"
                                : "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"
                            )}
                          >
                            {status.toUpperCase()}
                          </div>
                        </div>

                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="truncate text-xs text-slate-500 dark:text-slate-500">
                            {c.lastMessage === "[image]"
                              ? "📷 Photo"
                              : c.lastMessage === "[file]"
                              ? "📎 File"
                              : c.lastMessage || "No messages yet"}
                          </div>

                          {badge > 0 && (
                            <div className="shrink-0 rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[11px] font-extrabold text-purple-700 dark:border-purple-500/30 dark:bg-purple-500/20 dark:text-purple-200">
                              {badge}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section className="flex min-w-0 flex-1 flex-col">
            {!selected ? (
              <div className="flex h-full items-center justify-center">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-10 text-center dark:border-slate-800 dark:bg-slate-950">
                  <div className="text-xl font-extrabold text-slate-900 dark:text-slate-100">
                    Select a conversation
                  </div>
                  <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                    Choose a user on the left to view and reply.
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                  <div className="min-w-0">
                    <div className="truncate text-lg font-extrabold text-slate-900 dark:text-slate-100">
                      {selected.customer?.email || "No email"}
                    </div>
                    <div className="truncate text-xs text-slate-600 dark:text-slate-400">
                      Joined {safeDate(selected.createdAt)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => openConversation(selected)}>
                      Reload
                    </Button>

                    <Button
                      onClick={closeConversation}
                      className="rounded-2xl bg-red-500 text-white hover:bg-red-600"
                    >
                      End and delete chat for user
                    </Button>
                  </div>
                </div>

                <div className="flex min-h-0 flex-1 flex-col">
                  <div ref={listRef} className="min-h-0 flex-1 overflow-auto px-5 py-5">
                    {loadingMsgs ? (
                      <div className="mt-8 text-center text-sm text-slate-600 dark:text-slate-400">
                        Loading messages…
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="mt-10 flex items-center justify-center">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center dark:border-slate-800 dark:bg-slate-950">
                          <div className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
                            No messages yet
                          </div>
                          <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                            Send a message to start the conversation.
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {messages.map((m) => {
                          const mine = m.senderRole === "agent";

                          return (
                            <div
                              key={m._id}
                              className={cn("flex", mine ? "justify-end" : "justify-start")}
                            >
                              <div className="max-w-[78%]">
                                <div
                                  className={cn(
                                    "rounded-3xl border px-4 py-3 text-[14px] leading-relaxed",
                                    mine
                                      ? "border-purple-200 bg-purple-600 text-white dark:border-purple-500/30 dark:bg-purple-600"
                                      : "border-slate-200 bg-slate-100 text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                                  )}
                                >
                                  {renderMessageBody(m)}
                                </div>

                                <div
                                  className={cn(
                                    "mt-1 px-2 text-[11px] text-slate-500 dark:text-slate-500",
                                    mine ? "text-right" : ""
                                  )}
                                >
                                  {safeTime(m.createdAt)}
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        <div ref={scrollRef} />
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-[#020617]">
                    <div className="mb-3 flex flex-wrap gap-2">
                      {quickReplies.map((text) => (
                        <button
                          key={text}
                          type="button"
                          onClick={() => sendQuickReply(text)}
                          disabled={!selected || uploading}
                          className="rounded-full border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-bold text-purple-700 transition hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-purple-500/30 dark:bg-purple-500/10 dark:text-purple-200"
                        >
                          {text}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-end gap-3">
                      <button
                        type="button"
                        disabled={uploading}
                        onClick={() => fileInputRef.current?.click()}
                        className="group grid h-[52px] w-[52px] shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-purple-300 hover:bg-purple-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-purple-500/40 dark:hover:bg-purple-500/10"
                        title="Attach file"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="h-5 w-5 text-slate-600 transition group-hover:text-purple-600 dark:text-slate-300"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                        </svg>
                      </button>
                      
                                            <button
                        type="button"
                        disabled={uploading}
                        onClick={() => imageInputRef.current?.click()}
                        className="group grid h-[52px] w-[52px] shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-purple-300 hover:bg-purple-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-purple-500/40 dark:hover:bg-purple-500/10"
                        title="Send image"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="h-5 w-5 text-slate-600 transition group-hover:text-purple-600 dark:text-slate-300"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="3" y="3" width="18" height="18" rx="4" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <path d="M21 15l-5-5L5 21" />
                        </svg>
                      </button>

                      <textarea
                        value={newMsg}
                        onChange={(e) => setNewMsg(e.target.value)}
                        onKeyDown={onKeyDown}
                        onPaste={handlePaste}
                        placeholder="Type a message… or paste an image"
                        rows={1}
                        className="min-h-[52px] w-full resize-none rounded-3xl border border-slate-200 bg-white px-4 py-3 text-[14px] text-slate-900 outline-none placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                      />

                      <Button
                        onClick={sendMessage}
                        disabled={uploading}
                        className="h-[52px] rounded-3xl bg-purple-600 px-6 font-extrabold text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {uploading ? "Uploading…" : "Send"}
                      </Button>
                    </div>

                    <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-500">
                      Tip: Press <span className="font-bold">Enter</span> to send •{" "}
                      <span className="font-bold">Shift+Enter</span> for new line • Paste image with{" "}
                      <span className="font-bold">Ctrl+V</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>

          {selected && (
            <aside className="w-[300px] shrink-0 border-l border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
              <div className="mb-4">
                <div className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                  User Details
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Account information
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    Username
                  </div>
                  <div className="mt-1 break-words text-sm font-extrabold text-slate-900 dark:text-slate-100">
                    {selected.customer?.username || "User"}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    Email
                  </div>
                  <div className="mt-1 break-words text-sm font-extrabold text-slate-900 dark:text-slate-100">
                    {selected.customer?.email || "—"}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    Credit Score
                  </div>
                  <div className="mt-1 text-sm font-extrabold text-slate-900 dark:text-slate-100">
                    {userDetails?.creditScore ?? "—"}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    Frozen
                  </div>
                  <div className="mt-1 text-sm font-extrabold text-slate-900 dark:text-slate-100">
                    {userDetails?.isFrozen ? "Yes" : userDetails ? "No" : "—"}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    Withdraw Locked
                  </div>
                  <div className="mt-1 text-sm font-extrabold text-slate-900 dark:text-slate-100">
                    {userDetails?.isWithdrawLocked ? "Yes" : userDetails ? "No" : "—"}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    Conversation
                  </div>
                  <div className="mt-1 text-sm font-extrabold text-slate-900 dark:text-slate-100">
                    {String(selected._id).slice(-6)}
                  </div>
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}