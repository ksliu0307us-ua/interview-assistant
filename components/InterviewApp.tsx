"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
} from "react";
import { MarkdownMessage } from "./MarkdownMessage";
import type {
  AnswerMode,
  ChatAttachment,
  ChatMessage,
  ChatSession,
  Profile,
  ProfilesState,
} from "@/lib/types";
import { INTERVIEW_PHASES, ROLES } from "@/lib/types";

type ChatMeta = Omit<ChatSession, "messages">;
type GroupedChats = Record<string, { profileName: string; chats: ChatMeta[] }>;

function isThreadImageFileName(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(name);
}

function chatAttachmentDownloadUrl(
  chatId: string,
  profileId: string,
  attachmentId: string
): string {
  const q = new URLSearchParams({ profileId, attachmentId });
  return `/api/chats/${chatId}/attachments/file?${q}`;
}

function ChatAttachmentTile({
  chatId,
  profileId,
  attachment,
  loading,
  onRemove,
  showRemove = true,
}: {
  chatId: string;
  profileId: string;
  attachment: Pick<ChatAttachment, "id" | "fileName">;
  loading: boolean;
  onRemove: () => void;
  showRemove?: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const isImg = isThreadImageFileName(attachment.fileName);
  const url = chatAttachmentDownloadUrl(chatId, profileId, attachment.id);

  return (
    <div className="group relative w-[88px] shrink-0">
      {isImg && !imgFailed ? (
        // Dynamic same-origin API URL; next/image would require loader config
        // eslint-disable-next-line @next/next/no-img-element -- attachment preview from /api/.../file
        <img
          src={url}
          alt={attachment.fileName}
          loading="lazy"
          className="h-[72px] w-full rounded-lg border border-[var(--border)] object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className="flex h-[72px] w-full flex-col items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg)] px-1 text-center">
          <span className="line-clamp-4 text-[10px] leading-tight text-[var(--muted)]">
            {attachment.fileName}
          </span>
        </div>
      )}
      {isImg && !imgFailed && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 truncate rounded-b-lg bg-black/55 px-1 py-0.5 text-[9px] text-white/95">
          {attachment.fileName}
        </div>
      )}
      {showRemove && (
        <button
          type="button"
          disabled={loading}
          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--muted)] shadow hover:bg-[var(--border)] hover:text-[var(--text)] disabled:opacity-40"
          aria-label={`Remove ${attachment.fileName}`}
          onClick={onRemove}
        >
          ×
        </button>
      )}
    </div>
  );
}

async function readErrorBody(res: Response): Promise<string> {
  try {
    const j = await res.json();
    if (j && typeof j.error === "string") return j.error;
  } catch { /* ignore */ }
  return res.statusText || "Request failed";
}

/** Browsers throw when the connection is refused, wrong port, CORS, etc. */
function describeFetchFailure(err: unknown): string {
  if (err instanceof Error) {
    const m = err.message.toLowerCase();
    if (
      m.includes("failed to fetch") ||
      m.includes("networkerror") ||
      m.includes("load failed")
    ) {
      const origin =
        typeof window !== "undefined" ? window.location.origin : "this page’s origin";
      if (typeof window !== "undefined") {
        const { hostname, port, protocol } = window.location;
        const defaultPort = protocol === "https:" ? "443" : "80";
        const p = port || defaultPort;
        const localOrigin = `${protocol}//localhost:${p}`;
        const isLoopback =
          hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
        if (!isLoopback) {
          return `Could not reach the server (${origin}). On the same computer, open ${localOrigin} instead. Addresses from the “Network” line (e.g. 198.18.x.x) are often VPN/tunnel interfaces and API calls from the browser may fail.`;
        }
        return `Could not reach the server (${origin}). Confirm npm run dev is running and the port matches this URL — if 3000 was busy, use the port shown in the terminal (e.g. ${protocol}//localhost:3003) and refresh.`;
      }
      return `Could not reach the server (${origin}). Confirm the dev server is running and refresh.`;
    }
    return err.message;
  }
  return "Network request failed.";
}

export function InterviewApp() {
  const [state, setState] = useState<ProfilesState | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState<string>("");
  const [mode, setMode] = useState<AnswerMode>("verbal");

  const [allChats, setAllChats] = useState<GroupedChats>({});
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadAttachments, setThreadAttachments] = useState<ChatAttachment[]>([]);

  const [apiKey, setApiKey] = useState<string>("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"settings" | "history">("settings");
  const bottomRef = useRef<HTMLDivElement>(null);
  const threadFileInputId = "ia-thread-file-input";

  useEffect(() => {
    setApiKey(localStorage.getItem("ia_api_key") ?? "");
  }, []);

  const refresh = useCallback(async () => {
    const [pRes, mRes] = await Promise.all([fetch("/api/profiles"), fetch("/api/models")]);
    const p = (await pRes.json()) as ProfilesState;
    setState(p);
    const m = (await mRes.json()) as { models: string[]; defaultModel: string };
    setModels(m.models);
    setModel((prev) => (prev && m.models.includes(prev) ? prev : m.defaultModel));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const active = useMemo(() => {
    if (!state?.activeProfileId) return null;
    return state.profiles.find((x) => x.id === state.activeProfileId) ?? null;
  }, [state]);

  const pendingAttachments = useMemo(
    () => threadAttachments.filter((a) => a.linkedUserMessageIndex === undefined),
    [threadAttachments]
  );

  const [fileInputKey, setFileInputKey] = useState(0);
  const [dragOverComposer, setDragOverComposer] = useState(false);

  const refreshAllChats = useCallback(async () => {
    const res = await fetch("/api/chats");
    if (res.ok) setAllChats(await res.json());
  }, []);

  useEffect(() => { refreshAllChats(); }, [refreshAllChats]);

  const totalChats = useMemo(() => {
    return Object.values(allChats).reduce((sum, g) => sum + g.chats.length, 0);
  }, [allChats]);

  useEffect(() => {
    setActiveChatId(null);
    setMessages([]);
    setThreadAttachments([]);
  }, [active?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function addProfile() {
    const res = await fetch("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `Person ${(state?.profiles.length ?? 0) + 1}` }),
    });
    if (!res.ok) { setError(await readErrorBody(res)); return; }
    await refresh();
  }

  async function selectProfile(id: string) {
    setActiveChatId(null);
    setMessages([]);
    setThreadAttachments([]);
    const res = await fetch(`/api/profiles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true }),
    });
    if (!res.ok) { setError(await readErrorBody(res)); return; }
    await refresh();
  }

  async function patchProfile(
    updates: Partial<
      Pick<
        Profile,
        | "name"
        | "role"
        | "interviewPhase"
        | "customPrompt"
        | "resumePastedText"
        | "jobDescriptionText"
      >
    >
  ) {
    if (!active) return;
    const res = await fetch(`/api/profiles/${active.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) setError(await readErrorBody(res));
    else await refresh();
  }

  async function deleteProfile() {
    if (!active) return;
    if (!confirm(`Delete profile "${active.name}" and all uploads + chat history?`)) return;
    const res = await fetch(`/api/profiles/${active.id}`, { method: "DELETE" });
    if (!res.ok) setError(await readErrorBody(res));
    else {
      setActiveChatId(null);
      setMessages([]);
      setThreadAttachments([]);
      await refresh();
    }
  }

  async function upload(kind: "resume" | "job_description" | "reference", file: File | null) {
    if (!active || !file) return;
    const fd = new FormData();
    fd.set("profileId", active.id);
    fd.set("kind", kind);
    fd.set("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (!res.ok) setError(await readErrorBody(res));
    else await refresh();
  }

  async function startNewChat(continueFromChatId?: string) {
    if (!active) return;
    let res: Response;
    try {
      res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: active.id,
          mode,
          model,
          ...(continueFromChatId ? { continueFromChatId } : {}),
        }),
      });
    } catch (e) {
      setError(describeFetchFailure(e));
      return;
    }
    if (!res.ok) { setError(await readErrorBody(res)); return; }
    const session = (await res.json()) as ChatSession;
    setActiveChatId(session.id);
    setMessages([]);
    setThreadAttachments(session.attachments ?? []);
    setMode(session.mode);
    setModel(session.model);
    await refreshAllChats();
    return session;
  }

  async function startNextInterviewRound() {
    if (!active || !activeChatId) return;
    await startNewChat(activeChatId);
  }

  function clearChatDraft() {
    setActiveChatId(null);
    setMessages([]);
    setThreadAttachments([]);
  }

  const syncChatSession = useCallback(async (profileId: string, chatId: string) => {
    const res = await fetch(`/api/chats/${chatId}?profileId=${profileId}`);
    if (!res.ok) return;
    const session = (await res.json()) as ChatSession;
    setMessages(session.messages);
    setThreadAttachments(session.attachments ?? []);
  }, []);

  async function loadChat(chatId: string, profileId?: string) {
    const pid = profileId ?? active?.id;
    if (!pid) return;

    if (active && pid !== active.id) {
      const res = await fetch(`/api/profiles/${pid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: true }),
      });
      if (!res.ok) { setError(await readErrorBody(res)); return; }
      await refresh();
    }

    const res = await fetch(`/api/chats/${chatId}?profileId=${pid}`);
    if (!res.ok) { setError(await readErrorBody(res)); return; }
    const session = (await res.json()) as ChatSession;
    setActiveChatId(session.id);
    setMessages(session.messages);
    setThreadAttachments(session.attachments ?? []);
    setMode(session.mode);
    setModel(session.model);
  }

  async function deleteChat(chatId: string, profileId?: string) {
    const pid = profileId ?? active?.id;
    if (!pid) return;
    await fetch(`/api/chats/${chatId}?profileId=${pid}`, { method: "DELETE" });
    if (activeChatId === chatId) {
      setActiveChatId(null);
      setMessages([]);
      setThreadAttachments([]);
    }
    await refreshAllChats();
  }

  function clipboardFiles(dt: DataTransfer | null): File[] {
    if (!dt) return [];
    if (dt.files?.length) {
      return Array.from(dt.files).filter((f) => f.size > 0);
    }
    const out: File[] = [];
    for (let i = 0; i < dt.items.length; i++) {
      const item = dt.items[i];
      if (item.kind !== "file") continue;
      const f = item.getAsFile();
      if (f && f.size > 0) out.push(f);
    }
    return out;
  }

  async function uploadThreadFilesFromList(files: readonly File[]) {
    if (!files.length || !active || loading) return;

    let chatId = activeChatId;
    if (!chatId) {
      const session = await startNewChat();
      if (!session) return;
      chatId = session.id;
    }

    setError(null);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.set("profileId", active.id);
        fd.set("file", file);
        let res: Response;
        try {
          res = await fetch(`/api/chats/${chatId}/attachments`, { method: "POST", body: fd });
        } catch (e) {
          setError(describeFetchFailure(e));
          return;
        }
        if (!res.ok) {
          setError(await readErrorBody(res));
          return;
        }
        const data = (await res.json()) as { session: ChatSession };
        setThreadAttachments(data.session.attachments ?? []);
      }
    } finally {
      setFileInputKey((k) => k + 1);
    }
  }

  async function onThreadFilesPicked(e: ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const files = input.files?.length ? Array.from(input.files) : [];
    input.value = "";
    if (!files.length) return;
    await uploadThreadFilesFromList(files);
  }

  function onComposerPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    if (!active || loading) return;
    const files = clipboardFiles(e.clipboardData);
    if (!files.length) return;
    e.preventDefault();
    void uploadThreadFilesFromList(files);
  }

  async function removeThreadAttachment(attachmentId: string) {
    if (!active || !activeChatId) return;
    const q = new URLSearchParams({
      profileId: active.id,
      attachmentId,
    });
    const res = await fetch(`/api/chats/${activeChatId}/attachments?${q}`, { method: "DELETE" });
    if (!res.ok) {
      setError(await readErrorBody(res));
      return;
    }
    const data = (await res.json()) as { session: ChatSession };
    setThreadAttachments(data.session.attachments ?? []);
  }

  async function send() {
    const text = input.trim();
    const canSend = (text || pendingAttachments.length > 0) && active && !loading;
    if (!canSend) return;
    setInput("");
    setError(null);

    let chatId = activeChatId;
    if (!chatId) {
      const session = await startNewChat();
      if (!session) return;
      chatId = session.id;
    }

    const userBubble =
      text ||
      `[Thread files: ${pendingAttachments.map((a) => a.fileName).join(", ")}]`;

    const snap =
      pendingAttachments.length > 0
        ? pendingAttachments.map((a) => ({ id: a.id, fileName: a.fileName }))
        : undefined;

    const optimistic: ChatMessage[] = [
      ...messages,
      {
        role: "user",
        content: userBubble,
        ...(snap ? { attachments: snap } : {}),
      },
    ];
    setMessages(optimistic);
    setLoading(true);

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["x-api-key"] = apiKey;

    const res = await fetch("/api/chat", {
      method: "POST",
      headers,
      body: JSON.stringify({
        profileId: active.id,
        chatId,
        model,
        mode,
        userMessage: text,
      }),
    });

    const ct = res.headers.get("content-type") || "";

    if (!res.ok) {
      if (ct.includes("application/json")) setError(await readErrorBody(res));
      else setError(await res.text());
      setLoading(false);
      return;
    }

    if (ct.includes("application/json")) {
      const j = await res.json().catch(() => ({}));
      setError(typeof j.error === "string" ? j.error : "Unknown error");
      setLoading(false);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      const full = await res.text();
      setMessages([...optimistic, { role: "assistant", content: full }]);
      setLoading(false);
      await syncChatSession(active.id, chatId);
      await refreshAllChats();
      return;
    }

    const dec = new TextDecoder();
    let acc = "";
    setMessages([...optimistic, { role: "assistant", content: "" }]);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += dec.decode(value, { stream: true });
      setMessages([...optimistic, { role: "assistant", content: acc }]);
    }

    setLoading(false);
    await syncChatSession(active.id, chatId);
    await refreshAllChats();
  }

  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[var(--muted)]">
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-[1600px] flex-col-reverse gap-0 md:min-h-screen md:flex-row">
      {/* Sidebar: below chat on small screens; use md:flex-row + DOM order for desktop */}
      <aside className="relative z-10 flex max-h-[42vh] min-h-0 w-full shrink-0 flex-col overflow-hidden border-t border-[var(--border)] bg-[var(--surface)] md:z-auto md:max-h-none md:w-[380px] md:border-t-0 md:border-r md:border-b-0">
        <div className="border-b border-[var(--border)] p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h1 className="text-lg font-semibold tracking-tight">Interview Assist</h1>
            <button
              type="button"
              onClick={() => void addProfile()}
              className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              New person
            </button>
          </div>

          <select
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent-dim)]"
            value={active?.id ?? ""}
            onChange={(e) => selectProfile(e.target.value)}
          >
            {state.profiles.length === 0 ? (
              <option value="">No profiles — add one</option>
            ) : (
              state.profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))
            )}
          </select>
        </div>

        {/* Sidebar tabs */}
        {active && (
          <>
            <div className="flex border-b border-[var(--border)]">
              {(["settings", "history"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setSidebarTab(tab)}
                  className={`flex-1 py-2.5 text-center text-xs font-semibold uppercase tracking-wider transition ${
                    sidebarTab === tab
                      ? "border-b-2 border-[var(--accent)] text-[var(--accent)]"
                      : "text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {tab === "settings" ? "Settings" : `History (${totalChats})`}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {sidebarTab === "settings" ? (
                <SettingsPanel
                  active={active}
                  models={models}
                  model={model}
                  setModel={setModel}
                  apiKey={apiKey}
                  setApiKey={setApiKey}
                  patchProfile={patchProfile}
                  upload={upload}
                  deleteProfile={deleteProfile}
                />
              ) : (
                <HistoryPanel
                  allChats={allChats}
                  activeProfileId={active.id}
                  activeChatId={activeChatId}
                  loadChat={loadChat}
                  deleteChat={deleteChat}
                  startNewChat={startNewChat}
                />
              )}
            </div>
          </>
        )}
      </aside>

      {/* Main chat area — first on narrow viewports (flex-col-reverse) */}
      <main className="flex min-h-0 flex-1 flex-col md:min-h-[60vh]">
        <header className="border-b border-[var(--border)] px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-[var(--muted)]">Answer style</span>
            <div className="flex flex-wrap gap-2">
              {([
                ["verbal", "Verbal Q&A"],
                ["coding", "Coding (line comments)"],
                ["system_design", "System design"],
              ] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setMode(k)}
                  className={`rounded-full px-3 py-1 text-sm transition ${
                    mode === k
                      ? "bg-[var(--accent)] text-white"
                      : "border border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent-dim)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {activeChatId && (
                <>
                  <button
                    type="button"
                    onClick={() => void startNextInterviewRound()}
                    className="rounded-lg border border-[var(--accent-dim)]/50 bg-[var(--accent-dim)]/15 px-3 py-1 text-sm text-[var(--accent)] hover:bg-[var(--accent-dim)]/25"
                    title="New session that includes transcripts from earlier rounds in this hiring process"
                  >
                    Next interview round
                  </button>
                  <button
                    type="button"
                    onClick={clearChatDraft}
                    className="rounded-lg border border-[var(--border)] px-3 py-1 text-sm text-[var(--muted)] hover:border-[var(--accent-dim)] hover:text-[var(--text)]"
                    title="Start fresh; no prior round context (different job or practice)"
                  >
                    New chat
                  </button>
                </>
              )}
            </div>
          </div>
          {error && (
            <p className="mt-2 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          )}
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {!active ? (
            <p className="text-[var(--muted)]">Create a person profile to begin.</p>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 pt-16 text-center">
              <p className="text-lg font-medium text-[var(--text)]">
                {activeChatId ? "Empty chat" : "Start a new conversation"}
              </p>
              <p className="max-w-md text-sm text-[var(--muted)]">
                Paste an interview question or prompt. The assistant uses this person&apos;s resume,
                job description, references, role, phase, and your custom prompt.
                Use <span className="text-[var(--text)]">Next interview round</span> in the header after a screen
                to carry that conversation into the next step (onsite, coding, etc.).
              </p>
              {totalChats > 0 && !activeChatId && (
                <button
                  type="button"
                  onClick={() => setSidebarTab("history")}
                  className="mt-2 text-sm text-[var(--accent)] hover:underline"
                >
                  Or resume a previous chat ({totalChats} saved)
                </button>
              )}
            </div>
          ) : (
            messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-3xl rounded-xl border px-4 py-3 ${
                  m.role === "user"
                    ? "ml-auto border-[var(--accent-dim)]/40 bg-[var(--accent-dim)]/10"
                    : "border-[var(--border)] bg-[var(--surface)]"
                }`}
              >
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                  {m.role === "user" ? "You" : "Assistant"}
                </div>
                {m.role === "user" &&
                  activeChatId &&
                  active &&
                  m.attachments &&
                  m.attachments.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {m.attachments.map((att) => (
                        <ChatAttachmentTile
                          key={att.id}
                          chatId={activeChatId}
                          profileId={active.id}
                          attachment={att}
                          loading={false}
                          showRemove={false}
                          onRemove={() => {}}
                        />
                      ))}
                    </div>
                  )}
                {m.role === "assistant" && (mode === "coding" || mode === "system_design") ? (
                  <MarkdownMessage content={m.content} />
                ) : (
                  <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                )}
              </div>
            ))
          )}
          {loading && (
            <div className="text-sm text-[var(--muted)]">Thinking…</div>
          )}
          <div ref={bottomRef} />
        </div>

        <footer className="border-t border-[var(--border)] p-4">
          <div
            className={`mx-auto max-w-3xl space-y-2 rounded-xl transition-colors ${
              dragOverComposer ? "bg-[var(--accent-dim)]/15 ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg)]" : ""
            }`}
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (active && !loading) setDragOverComposer(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              const related = e.relatedTarget as Node | null;
              if (!related || !e.currentTarget.contains(related)) setDragOverComposer(false);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOverComposer(false);
              if (!active || loading) return;
              const list = e.dataTransfer.files;
              const files = list?.length ? Array.from(list).filter((f) => f.size > 0) : [];
              void uploadThreadFilesFromList(files);
            }}
          >
            {pendingAttachments.length > 0 && active && activeChatId && (
              <div className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
                  Attached to your next message (drag &amp; drop here too)
                </p>
                <div className="flex flex-wrap gap-3">
                  {pendingAttachments.map((a) => (
                    <ChatAttachmentTile
                      key={a.id}
                      chatId={activeChatId}
                      profileId={active.id}
                      attachment={a}
                      loading={loading}
                      onRemove={() => void removeThreadAttachment(a.id)}
                    />
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <input
                key={fileInputKey}
                id={threadFileInputId}
                type="file"
                className="sr-only"
                multiple
                tabIndex={-1}
                accept="*/*"
                aria-label="Attach files to this chat"
                onChange={(e) => void onThreadFilesPicked(e)}
              />
              {active && !loading ? (
                <label
                  htmlFor={threadFileInputId}
                  title="Attach images, documents, code, spreadsheets, or zip"
                  className="inline-flex cursor-pointer select-none items-center self-end rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] hover:border-[var(--accent-dim)]"
                >
                  Attach
                </label>
              ) : (
                <span
                  className="inline-flex select-none items-center self-end rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] opacity-40"
                  title={!active ? "Add a profile first" : "Wait for the reply to finish"}
                >
                  Attach
                </span>
              )}
              <textarea
                className="min-h-[52px] flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent-dim)]"
                placeholder={
                  active
                    ? "Your question or interviewer prompt… (optional if you attached files; paste files with Ctrl+V)"
                    : "Add a profile first…"
                }
                value={input}
                disabled={!active || loading}
                onChange={(e) => setInput(e.target.value)}
                onPaste={onComposerPaste}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <button
                type="button"
                disabled={!active || loading || (!input.trim() && pendingAttachments.length === 0)}
                onClick={() => void send()}
                className="self-end rounded-xl bg-[var(--accent)] px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

/* ─── Debounce hook ─── */

function useDebouncedField(
  serverValue: string,
  profileId: string,
  save: (val: string) => void,
  delay = 600
) {
  const [local, setLocal] = useState(serverValue);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dirtyRef = useRef(false);
  const prevProfileId = useRef(profileId);

  // Only reset local state when switching profiles, not on every server echo
  useEffect(() => {
    if (prevProfileId.current !== profileId) {
      prevProfileId.current = profileId;
      dirtyRef.current = false;
      setLocal(serverValue);
    }
  }, [profileId, serverValue]);

  const onChange = useCallback(
    (val: string) => {
      dirtyRef.current = true;
      setLocal(val);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        save(val);
        dirtyRef.current = false;
      }, delay);
    },
    [save, delay]
  );

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return [local, onChange] as const;
}

/* ─── Settings panel ─── */

function SettingsPanel({
  active,
  models,
  model,
  setModel,
  apiKey,
  setApiKey,
  patchProfile,
  upload,
  deleteProfile,
}: {
  active: Profile;
  models: string[];
  model: string;
  setModel: (m: string) => void;
  apiKey: string;
  setApiKey: (k: string) => void;
  patchProfile: (
    u: Partial<
      Pick<
        Profile,
        | "name"
        | "role"
        | "interviewPhase"
        | "customPrompt"
        | "resumePastedText"
        | "jobDescriptionText"
      >
    >
  ) => void;
  upload: (kind: "resume" | "job_description" | "reference", file: File | null) => void;
  deleteProfile: () => void;
}) {
  const saveName = useCallback((v: string) => patchProfile({ name: v }), [patchProfile]);
  const savePrompt = useCallback((v: string) => patchProfile({ customPrompt: v }), [patchProfile]);
  const saveResumePaste = useCallback((v: string) => patchProfile({ resumePastedText: v }), [patchProfile]);
  const saveJdPaste = useCallback((v: string) => patchProfile({ jobDescriptionText: v }), [patchProfile]);

  const [localName, setLocalName] = useDebouncedField(active.name, active.id, saveName);
  const [localPrompt, setLocalPrompt] = useDebouncedField(active.customPrompt, active.id, savePrompt);
  const [localResumePaste, setLocalResumePaste] = useDebouncedField(
    active.resumePastedText,
    active.id,
    saveResumePaste
  );
  const [localJdPaste, setLocalJdPaste] = useDebouncedField(
    active.jobDescriptionText,
    active.id,
    saveJdPaste
  );

  const [showKey, setShowKey] = useState(false);

  return (
    <div className="space-y-3">
      <Field label="OpenAI API key">
        <div className="flex gap-2">
          <input
            type={showKey ? "text" : "password"}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm font-mono"
            placeholder="sk-..."
            value={apiKey}
            onChange={(e) => {
              const v = e.target.value;
              setApiKey(v);
              if (v) localStorage.setItem("ia_api_key", v);
              else localStorage.removeItem("ia_api_key");
            }}
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="shrink-0 rounded-lg border border-[var(--border)] px-2 py-2 text-xs text-[var(--muted)] hover:text-[var(--text)]"
          >
            {showKey ? "Hide" : "Show"}
          </button>
        </div>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Stored in your browser only — never sent to our server.
          {" "}
          <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:underline">
            Get a key
          </a>
        </p>
      </Field>

      <Field label="Model">
        <select
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          {models.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </Field>

      <Field label="Target role">
        <select
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
          value={active.role}
          onChange={(e) => patchProfile({ role: e.target.value as Profile["role"] })}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </Field>

      <Field label="Interview phase">
        <select
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
          value={active.interviewPhase}
          onChange={(e) => patchProfile({ interviewPhase: e.target.value as Profile["interviewPhase"] })}
        >
          {INTERVIEW_PHASES.map((ph) => (
            <option key={ph} value={ph}>{ph}</option>
          ))}
        </select>
      </Field>

      <Field label="Display name">
        <input
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
          value={localName}
          onChange={(e) => setLocalName(e.target.value)}
        />
      </Field>

      <Field label="Custom prompt">
        <textarea
          className="min-h-[80px] w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
          placeholder="Tone, topics to stress, things to avoid…"
          value={localPrompt}
          onChange={(e) => setLocalPrompt(e.target.value)}
        />
      </Field>

      <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Documents</div>
      <div className="space-y-3 text-sm">
        <FileRow label="Resume file" fileName={active.resume?.fileName} onUpload={(f) => upload("resume", f)} />
        <Field label="Resume text (paste)">
          <textarea
            className="min-h-[100px] w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
            placeholder="Paste full resume here if PDF won’t extract, or to supplement the file. Plain text works best."
            value={localResumePaste}
            onChange={(e) => setLocalResumePaste(e.target.value)}
          />
        </Field>
        <FileRow
          label="Job description file"
          fileName={active.jobDescription?.fileName}
          onUpload={(f) => upload("job_description", f)}
        />
        <Field label="Job description (paste)">
          <textarea
            className="min-h-[120px] w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
            placeholder="Paste the full posting from LinkedIn, Greenhouse, etc. when you don’t have a file."
            value={localJdPaste}
            onChange={(e) => setLocalJdPaste(e.target.value)}
          />
        </Field>
        <FileRow
          label="References"
          fileName={`${active.references.length} file(s)`}
          onUpload={(f) => upload("reference", f)}
          uploadLabel="Add"
        />
      </div>

      <button
        type="button"
        onClick={deleteProfile}
        className="mt-4 w-full rounded-lg border border-red-900/60 py-2 text-sm text-red-300 hover:bg-red-950/40"
      >
        Delete this person
      </button>
    </div>
  );
}

/* ─── History panel ─── */

function HistoryPanel({
  allChats,
  activeProfileId,
  activeChatId,
  loadChat,
  deleteChat,
  startNewChat,
}: {
  allChats: GroupedChats;
  activeProfileId: string;
  activeChatId: string | null;
  loadChat: (id: string, profileId?: string) => void;
  deleteChat: (id: string, profileId?: string) => void;
  startNewChat: () => void;
}) {
  const totalChats = Object.values(allChats).reduce((s, g) => s + g.chats.length, 0);

  if (totalChats === 0) {
    return (
      <div className="flex flex-col items-center gap-3 pt-8 text-center">
        <p className="text-sm text-[var(--muted)]">No conversations yet.</p>
        <button
          type="button"
          onClick={startNewChat}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Start a new chat
        </button>
      </div>
    );
  }

  const sortedProfileIds = Object.keys(allChats).sort((a, b) => {
    if (a === activeProfileId) return -1;
    if (b === activeProfileId) return 1;
    return 0;
  });

  return (
    <div className="space-y-4">
      {sortedProfileIds.map((pid) => {
        const group = allChats[pid];
        if (!group || group.chats.length === 0) return null;
        const isCurrentPerson = pid === activeProfileId;

        return (
          <div key={pid}>
            <div className="mb-1.5 flex items-center gap-2 px-1">
              <div
                className={`h-2 w-2 rounded-full ${isCurrentPerson ? "bg-[var(--accent)]" : "bg-[var(--muted)]/40"}`}
              />
              <span className={`text-xs font-semibold uppercase tracking-wider ${isCurrentPerson ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>
                {group.profileName}
              </span>
              <span className="text-xs text-[var(--muted)]">({group.chats.length})</span>
            </div>

            <div className="space-y-1">
              {(() => {
                const seriesKey = (x: { id: string; seriesId?: string }) => x.seriesId?.trim() || x.id;
                return group.chats.map((c) => {
                const isActive = c.id === activeChatId;
                const date = new Date(c.updatedAt);
                const when =
                  date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
                  " " +
                  date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
                const linkedRounds = group.chats.filter((x) => seriesKey(x) === seriesKey(c)).length;
                return (
                  <div
                    key={c.id}
                    className={`group flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2.5 transition ${
                      isActive
                        ? "bg-[var(--accent-dim)]/20 border border-[var(--accent-dim)]/40"
                        : "hover:bg-[var(--border)]/30 border border-transparent"
                    }`}
                    onClick={() => loadChat(c.id, pid)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{c.title}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                        <span className="rounded bg-[var(--border)]/60 px-1.5 py-0.5">
                          {c.mode.replace("_", " ")}
                        </span>
                        <span>{c.model}</span>
                        <span>{when}</span>
                        {linkedRounds > 1 && (
                          <span
                            className="rounded bg-emerald-950/50 px-1.5 py-0.5 text-emerald-200/90"
                            title="Same hiring process: later rounds use earlier transcripts as context"
                          >
                            {linkedRounds} rounds linked
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteChat(c.id, pid);
                      }}
                      className="mt-0.5 shrink-0 rounded p-1 text-[var(--muted)] opacity-0 transition hover:bg-red-950/50 hover:text-red-300 group-hover:opacity-100"
                      title="Delete chat"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                );
              });
              })()}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Tiny helpers ─── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</label>
      {children}
    </div>
  );
}

function FileRow({
  label,
  fileName,
  onUpload,
  uploadLabel = "Upload",
}: {
  label: string;
  fileName?: string;
  onUpload: (f: File) => void;
  uploadLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[var(--muted)]">{label}</span>
      <label className="cursor-pointer rounded border border-[var(--border)] px-2 py-1 hover:bg-[var(--border)]/40">
        {uploadLabel}
        <input
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = "";
          }}
        />
      </label>
      {fileName && (
        <span className="truncate text-[var(--muted)]" title={fileName}>{fileName}</span>
      )}
    </div>
  );
}
