import fs from "fs/promises";
import path from "path";
import type { ChatSession } from "./types";
import { chatAttachmentsDir } from "./paths";
import { extractFromBuffer } from "./threadFileExtract";

const MAX_THREAD_TEXT = 18_000;
const MAX_IMAGES = 8;

export async function buildThreadAttachmentsForModel(
  profileId: string,
  session: ChatSession
): Promise<{ textBlock: string; images: { mime: string; b64: string }[]; imageNamesSkipped: string[] }> {
  const atts = session.attachments ?? [];
  const textChunks: string[] = [];
  const images: { mime: string; b64: string }[] = [];
  const imageNamesSkipped: string[] = [];

  for (const a of atts) {
    const dir = chatAttachmentsDir(profileId, session.id);
    const full = path.join(dir, a.storedName);
    let buf: Buffer;
    try {
      buf = await fs.readFile(full);
    } catch {
      textChunks.push(`[Missing file on disk: ${a.fileName}]`);
      continue;
    }

    const { texts, images: imgs } = await extractFromBuffer(buf, a.fileName);
    if (texts.length) {
      textChunks.push(`### Thread file: ${a.fileName}\n${texts.join("\n\n")}`);
    }
    for (const im of imgs) {
      if (images.length >= MAX_IMAGES) {
        imageNamesSkipped.push(a.fileName);
        break;
      }
      images.push(im);
    }
  }

  let textBlock = textChunks.join("\n\n");
  if (textBlock.length > MAX_THREAD_TEXT) {
    textBlock = textBlock.slice(0, MAX_THREAD_TEXT) + "\n\n[Thread attachment text truncated…]";
  }

  if (imageNamesSkipped.length) {
    textBlock +=
      `\n\n[Note: ${imageNamesSkipped.length} more image(s) not sent visually — cap ${MAX_IMAGES} images per request: ${imageNamesSkipped.join(", ")}]`;
  }

  return { textBlock: textBlock.trim(), images, imageNamesSkipped };
}

export function modelSupportsVision(model: string): boolean {
  const m = model.toLowerCase();
  if (m.includes("gpt-3.5")) return false;
  if (m.startsWith("o1")) return false;
  return true;
}
