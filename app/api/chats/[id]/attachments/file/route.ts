import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getChat } from "@/lib/chatStore";
import { chatAttachmentsDir } from "@/lib/paths";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".ipynb": "application/x-ipynb+json",
};

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { id: chatId } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const profileId = searchParams.get("profileId");
  const attachmentId = searchParams.get("attachmentId");
  if (!profileId || !attachmentId) {
    return new NextResponse("profileId and attachmentId required", { status: 400 });
  }

  const session = await getChat(profileId, chatId);
  if (!session) {
    return new NextResponse("Not found", { status: 404 });
  }

  const att = session.attachments.find((a) => a.id === attachmentId);
  if (!att) {
    return new NextResponse("Not found", { status: 404 });
  }

  const dir = path.resolve(chatAttachmentsDir(profileId, chatId));
  const full = path.resolve(path.join(dir, att.storedName));
  if (!full.startsWith(dir + path.sep) && full !== dir) {
    return new NextResponse("Bad path", { status: 400 });
  }

  let buf: Buffer;
  try {
    buf = await fs.readFile(full);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const ext = path.extname(att.fileName || att.storedName).toLowerCase();
  const contentType = MIME[ext] || "application/octet-stream";

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
