import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getChat, saveChat } from "@/lib/chatStore";
import { chatAttachmentsDir } from "@/lib/paths";
import type { ChatAttachment } from "@/lib/types";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 40 * 1024 * 1024;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id: chatId } = await ctx.params;
  const form = await req.formData();
  const profileId = form.get("profileId");
  const file = form.get("file");

  if (typeof profileId !== "string" || !profileId) {
    return NextResponse.json({ error: "profileId required" }, { status: 400 });
  }
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File too large (max 40 MB)" }, { status: 400 });
  }

  const session = await getChat(profileId, chatId);
  if (!session) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const ext = path.extname(file.name) || "";
  const storedName = `${crypto.randomUUID()}${ext}`;
  const dir = chatAttachmentsDir(profileId, chatId);
  await fs.mkdir(dir, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(dir, storedName), buf);

  const attachment: ChatAttachment = {
    id: crypto.randomUUID(),
    fileName: file.name,
    storedName,
  };
  session.attachments.push(attachment);
  await saveChat(session);

  return NextResponse.json({ session, attachment }, { status: 201 });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { id: chatId } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const profileId = searchParams.get("profileId");
  const attachmentId = searchParams.get("attachmentId");
  if (!profileId || !attachmentId) {
    return NextResponse.json(
      { error: "profileId and attachmentId required" },
      { status: 400 }
    );
  }

  const session = await getChat(profileId, chatId);
  if (!session) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const idx = session.attachments.findIndex((a) => a.id === attachmentId);
  if (idx === -1) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  const [removed] = session.attachments.splice(idx, 1);
  const fp = path.join(chatAttachmentsDir(profileId, chatId), removed.storedName);
  await fs.unlink(fp).catch(() => {});
  await saveChat(session);

  return NextResponse.json({ session });
}
