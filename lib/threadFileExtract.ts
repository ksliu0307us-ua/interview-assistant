import path from "path";
import AdmZip from "adm-zip";
import * as XLSX from "xlsx";

export type ImagePart = { mime: string; b64: string };

const TEXT_EXT = new Set([
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".log",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".rtf",
]);
const CODE_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".java", ".c", ".h", ".cpp", ".cc", ".hpp",
  ".cs", ".sql", ".sh", ".bash", ".zsh", ".rb", ".php", ".swift", ".kt", ".kts", ".scala", ".r", ".vue", ".svelte",
  ".html", ".htm", ".css", ".scss", ".less", ".xml", ".graphql", ".gql", ".dockerfile", ".env", ".properties",
  ".gradle", ".cls", ".tex",
]);

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);

const MAX_ZIP_FILES = 80;
const MAX_ZIP_DEPTH = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_PER_FILE = 400_000;

function mimeForExt(ext: string): string {
  const m: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
  };
  return m[ext] || "application/octet-stream";
}

function safeZipEntryName(name: string): boolean {
  const n = name.replace(/\\/g, "/");
  if (n.startsWith("/") || n.includes("..")) return false;
  return !path.isAbsolute(n);
}

async function extractPdf(buf: Buffer): Promise<string> {
  const pdfParse = (await import("pdf-parse")).default;
  const data = await pdfParse(buf);
  return data.text?.trim() || "";
}

async function extractDocx(buf: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return value?.trim() || "";
}

function extractSpreadsheet(buf: Buffer): string {
  const wb = XLSX.read(buf, { type: "buffer" });
  const parts: string[] = [];
  for (const sn of wb.SheetNames) {
    const sheet = wb.Sheets[sn];
    parts.push(`--- Sheet: ${sn} ---\n${XLSX.utils.sheet_to_csv(sheet)}`);
  }
  return parts.join("\n\n").trim();
}

function extractIpynb(buf: Buffer): string {
  try {
    const raw = buf.toString("utf-8");
    const nb = JSON.parse(raw) as {
      cells?: Array<{ cell_type?: string; source?: string | string[] }>;
    };
    if (!Array.isArray(nb.cells)) {
      return "[Invalid Jupyter notebook: missing cells array]";
    }
    const parts: string[] = [];
    let i = 0;
    for (const cell of nb.cells) {
      i++;
      const type = cell.cell_type ?? "unknown";
      let src = cell.source;
      if (Array.isArray(src)) src = src.join("");
      else if (typeof src !== "string") src = "";
      src = src.trim();
      if (!src) continue;
      parts.push(`--- Cell ${i} (${type}) ---\n${src}`);
    }
    return parts.join("\n\n").trim() || "[Empty notebook — no cell sources]";
  } catch (e) {
    return `[Notebook read error: ${e instanceof Error ? e.message : "unknown"}]`;
  }
}

export async function extractFromBuffer(
  buf: Buffer,
  logicalName: string,
  zipDepth = 0
): Promise<{ texts: string[]; images: ImagePart[] }> {
  const ext = path.extname(logicalName).toLowerCase();
  const base = path.basename(logicalName);
  const out: { texts: string[]; images: ImagePart[] } = { texts: [], images: [] };

  if (ext === ".zip") {
    if (zipDepth >= MAX_ZIP_DEPTH) {
      out.texts.push(`[Nested zip skipped (max depth): ${logicalName}]`);
      return out;
    }
    try {
      const zip = new AdmZip(buf);
      const entries = zip.getEntries().filter((e) => !e.isDirectory);
      let count = 0;
      for (const entry of entries) {
        if (count++ >= MAX_ZIP_FILES) {
          out.texts.push(`[Zip truncated after ${MAX_ZIP_FILES} files: ${logicalName}]`);
          break;
        }
        if (!safeZipEntryName(entry.entryName)) continue;
        const data = entry.getData();
        const inner = await extractFromBuffer(Buffer.from(data), entry.entryName, zipDepth + 1);
        for (const t of inner.texts) {
          out.texts.push(`--- from zip: ${entry.entryName} ---\n${t}`);
        }
        out.images.push(...inner.images);
      }
    } catch (e) {
      out.texts.push(`[Zip error ${logicalName}: ${e instanceof Error ? e.message : "unknown"}]`);
    }
    return out;
  }

  if (IMAGE_EXT.has(ext)) {
    if (buf.length > MAX_IMAGE_BYTES) {
      out.texts.push(`[Image too large (max 8MB): ${logicalName}]`);
      return out;
    }
    out.images.push({ mime: mimeForExt(ext), b64: buf.toString("base64") });
    return out;
  }

  if (ext === ".pdf") {
    try {
      const t = await extractPdf(buf);
      out.texts.push(t || `[No extractable text in PDF: ${logicalName}]`);
    } catch {
      out.texts.push(`[PDF read error: ${logicalName}]`);
    }
    return out;
  }

  if (ext === ".docx") {
    try {
      const t = await extractDocx(buf);
      out.texts.push(t || `[No text in docx: ${logicalName}]`);
    } catch {
      out.texts.push(`[docx read error: ${logicalName}]`);
    }
    return out;
  }

  if (ext === ".xlsx" || ext === ".xls") {
    try {
      out.texts.push(extractSpreadsheet(buf) || `[Empty spreadsheet: ${logicalName}]`);
    } catch {
      out.texts.push(`[Spreadsheet read error: ${logicalName}]`);
    }
    return out;
  }

  if (ext === ".ipynb") {
    out.texts.push(extractIpynb(buf));
    return out;
  }

  if (TEXT_EXT.has(ext) || CODE_EXT.has(ext)) {
    try {
      let t = buf.toString("utf-8");
      if (t.includes("\u0000")) t = buf.toString("latin1");
      t = t.trim();
      if (t.length > MAX_TEXT_PER_FILE) t = t.slice(0, MAX_TEXT_PER_FILE) + "\n[truncated…]";
      out.texts.push(t || `[Empty file: ${logicalName}]`);
    } catch {
      out.texts.push(`[Could not decode as text: ${logicalName}]`);
    }
    return out;
  }

  out.texts.push(`[Unsupported extension ${ext} for ${base} — not extracted]`);
  return out;
}
