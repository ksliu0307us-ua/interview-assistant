import { NextResponse } from "next/server";
import { getChat, deleteChat, saveChat, effectiveSeriesId } from "@/lib/chatStore";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const profileId = searchParams.get("profileId");
  if (!profileId) {
    return NextResponse.json({ error: "profileId required" }, { status: 400 });
  }
  const session = await getChat(profileId, id);
  if (!session) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }
  return NextResponse.json(session);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const profileId = typeof body.profileId === "string" ? body.profileId : "";
  if (!profileId) {
    return NextResponse.json({ error: "profileId required" }, { status: 400 });
  }
  const session = await getChat(profileId, id);
  if (!session) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }
  if (typeof body.title === "string") session.title = body.title;
  if (typeof body.mode === "string") session.mode = body.mode as typeof session.mode;
  if (typeof body.model === "string") session.model = body.model;
  if (typeof body.inheritSeriesFromChatId === "string" && body.inheritSeriesFromChatId.trim()) {
    const other = await getChat(profileId, body.inheritSeriesFromChatId.trim());
    if (other) session.seriesId = effectiveSeriesId(other);
  }
  await saveChat(session);
  return NextResponse.json(session);
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const profileId = searchParams.get("profileId");
  if (!profileId) {
    return NextResponse.json({ error: "profileId required" }, { status: 400 });
  }
  await deleteChat(profileId, id);
  return NextResponse.json({ ok: true });
}
