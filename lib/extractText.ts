import fs from "fs/promises";
import path from "path";
import { profileUploadDir } from "./paths";

const TEXT_EXT = new Set([".txt", ".md", ".csv", ".json", ".log"]);

const PDF_EMPTY_HINT =
  "[This PDF had no extractable text — it may be scanned or image-only. Paste the resume or JD as plain text in the “Resume text” or “Job description” fields in Settings, or use .txt / .docx.]";

export async function extractFileText(
  profileId: string,
  storedName: string,
  originalName: string
): Promise<string> {
  const dir = profileUploadDir(profileId);
  const full = path.join(dir, storedName);
  const ext = path.extname(originalName).toLowerCase();

  if (TEXT_EXT.has(ext)) {
    return (await fs.readFile(full, "utf-8")).trim();
  }

  if (ext === ".pdf") {
    const buf = await fs.readFile(full);
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(buf);
    const text = data.text?.trim() || "";
    if (!text) return PDF_EMPTY_HINT;
    return text;
  }

  if (ext === ".docx") {
    const buf = await fs.readFile(full);
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    const text = value?.trim() || "";
    if (!text) return "[.docx file had no extractable text — try pasting the content as plain text.]";
    return text;
  }

  return `[Binary or unsupported file type (${ext}) for ${originalName} — paste plain text in Settings instead.]`;
}
