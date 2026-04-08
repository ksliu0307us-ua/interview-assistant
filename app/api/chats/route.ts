import { NextResponse } from "next/server";
import { listChats, createChat } from "@/lib/chatStore";
import { readState } from "@/lib/store";
import type { AnswerMode } from "@/lib/types";
import { ANSWER_MODES } from "@/lib/types";

function isMode(v: unknown): v is AnswerMode {
  return typeof v === "string" && (ANSWER_MODES as readonly string[]).includes(v);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const profileId = searchParams.get("profileId");

  if (profileId) {
    const chats = await listChats(profileId);
    return NextResponse.json(chats);
  }

  const state = await readState();
  const grouped: Record<string, { profileName: string; chats: Awaited<ReturnType<typeof listChats>> }> = {};
  await Promise.all(
    state.profiles.map(async (p) => {
      const chats = await listChats(p.id);
      grouped[p.id] = { profileName: p.name, chats };
    })
  );
  return NextResponse.json(grouped);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { profileId, mode, model } = body;
  if (!profileId || !isMode(mode) || typeof model !== "string") {
    return NextResponse.json(
      { error: "profileId, mode, and model required" },
      { status: 400 }
    );
  }
  const continueFromChatId =
    typeof body.continueFromChatId === "string" && body.continueFromChatId.trim()
      ? body.continueFromChatId.trim()
      : undefined;
  const session = await createChat({ profileId, mode, model, continueFromChatId });
  return NextResponse.json(session, { status: 201 });
}
