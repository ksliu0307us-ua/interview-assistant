import fs from "fs/promises";
import path from "path";
import { profileChatsDir, chatFilePath, chatAttachmentsDir, CHAT_FILES_ROOT } from "./paths";
import type { ChatSession, ChatMessage, AnswerMode } from "./types";

function normalizeMessage(m: ChatMessage): ChatMessage {
  if (!m || typeof m.content !== "string") return m;
  return {
    ...m,
    attachments: Array.isArray(m.attachments) ? m.attachments : undefined,
  };
}

function normalizeChatSession(raw: ChatSession): ChatSession {
  let attachments = Array.isArray(raw.attachments) ? raw.attachments : [];
  let messages = Array.isArray(raw.messages) ? raw.messages.map(normalizeMessage) : [];

  attachments = attachments.map((a) => ({
    ...a,
    linkedUserMessageIndex:
      typeof a.linkedUserMessageIndex === "number" ? a.linkedUserMessageIndex : undefined,
  }));

  const anyLinked = attachments.some((a) => a.linkedUserMessageIndex !== undefined);
  if (!anyLinked && attachments.length > 0) {
    const firstUserIdx = messages.findIndex((m) => m.role === "user");
    if (firstUserIdx >= 0) {
      const refs = attachments.map((a) => ({ id: a.id, fileName: a.fileName }));
      attachments = attachments.map((a) => ({ ...a, linkedUserMessageIndex: firstUserIdx }));
      const u = messages[firstUserIdx];
      if (u?.role === "user" && !(u.attachments && u.attachments.length > 0)) {
        messages = messages.map((m, i) =>
          i === firstUserIdx ? { ...m, attachments: refs } : m
        );
      }
    }
  }

  return {
    ...raw,
    attachments,
    messages,
  };
}

/** Stable id for grouping rounds (legacy chats without seriesId use their own id). */
export function effectiveSeriesId(s: Pick<ChatSession, "id" | "seriesId">): string {
  return s.seriesId?.trim() || s.id;
}

export async function loadAllChats(profileId: string): Promise<ChatSession[]> {
  const dir = profileChatsDir(profileId);
  try {
    const files = await fs.readdir(dir);
    const out: ChatSession[] = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(`${dir}/${f}`, "utf-8");
        out.push(normalizeChatSession(JSON.parse(raw) as ChatSession));
      } catch {
        /* skip */
      }
    }
    return out;
  } catch {
    return [];
  }
}

export async function listChats(profileId: string): Promise<Omit<ChatSession, "messages">[]> {
  const dir = profileChatsDir(profileId);
  try {
    const files = await fs.readdir(dir);
    const sessions: Omit<ChatSession, "messages">[] = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(`${dir}/${f}`, "utf-8");
        const s = normalizeChatSession(JSON.parse(raw) as ChatSession);
        const { messages, ...meta } = s;
        void messages;
        sessions.push(meta);
      } catch {
        /* skip corrupt files */
      }
    }
    sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return sessions;
  } catch {
    return [];
  }
}

export async function getChat(
  profileId: string,
  chatId: string
): Promise<ChatSession | null> {
  try {
    const raw = await fs.readFile(chatFilePath(profileId, chatId), "utf-8");
    return normalizeChatSession(JSON.parse(raw) as ChatSession);
  } catch {
    return null;
  }
}

export async function createChat(params: {
  profileId: string;
  mode: AnswerMode;
  model: string;
  title?: string;
  /** New chat shares this hiring process; prior rounds in the same series are included in context. */
  continueFromChatId?: string;
}): Promise<ChatSession> {
  const dir = profileChatsDir(params.profileId);
  await fs.mkdir(dir, { recursive: true });
  const now = new Date().toISOString();

  let seriesId = crypto.randomUUID();
  if (params.continueFromChatId) {
    const prev = await getChat(params.profileId, params.continueFromChatId);
    if (prev) seriesId = effectiveSeriesId(prev);
  }

  const session: ChatSession = {
    id: crypto.randomUUID(),
    profileId: params.profileId,
    seriesId,
    title: params.title || "New chat",
    mode: params.mode,
    model: params.model,
    messages: [],
    attachments: [],
    createdAt: now,
    updatedAt: now,
  };
  await fs.writeFile(
    chatFilePath(params.profileId, session.id),
    JSON.stringify(session, null, 2),
    "utf-8"
  );
  return session;
}

export async function saveChat(session: ChatSession): Promise<void> {
  session.attachments = session.attachments ?? [];
  const dir = profileChatsDir(session.profileId);
  await fs.mkdir(dir, { recursive: true });
  session.updatedAt = new Date().toISOString();
  await fs.writeFile(
    chatFilePath(session.profileId, session.id),
    JSON.stringify(session, null, 2),
    "utf-8"
  );
}

export async function deleteChat(
  profileId: string,
  chatId: string
): Promise<boolean> {
  try {
    await fs.rm(chatAttachmentsDir(profileId, chatId), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  try {
    await fs.unlink(chatFilePath(profileId, chatId));
    return true;
  } catch {
    return false;
  }
}

export async function deleteAllChats(profileId: string): Promise<void> {
  const filesRoot = path.join(CHAT_FILES_ROOT, profileId);
  try {
    await fs.rm(filesRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  const dir = profileChatsDir(profileId);
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

function deriveTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "New chat";
  const text = first.content.trim().replace(/\s+/g, " ");
  return text.length > 60 ? text.slice(0, 57) + "…" : text;
}

export async function appendMessages(
  profileId: string,
  chatId: string,
  newMessages: ChatMessage[]
): Promise<ChatSession | null> {
  const session = await getChat(profileId, chatId);
  if (!session) return null;
  session.messages.push(...newMessages);
  if (session.title === "New chat" && session.messages.length > 0) {
    session.title = deriveTitle(session.messages);
  }
  await saveChat(session);
  return session;
}
