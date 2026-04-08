import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { readState, writeState } from "@/lib/store";
import { profileUploadDir } from "@/lib/paths";

export const runtime = "nodejs";

const KINDS = ["resume", "job_description", "reference"] as const;
type Kind = (typeof KINDS)[number];

function isKind(v: string): v is Kind {
  return (KINDS as readonly string[]).includes(v);
}

export async function POST(req: Request) {
  const form = await req.formData();
  const profileId = form.get("profileId");
  const kindRaw = form.get("kind");
  const file = form.get("file");

  if (typeof profileId !== "string" || !profileId) {
    return NextResponse.json({ error: "profileId required" }, { status: 400 });
  }
  if (typeof kindRaw !== "string" || !isKind(kindRaw)) {
    return NextResponse.json({ error: "kind must be resume, job_description, or reference" }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const state = await readState();
  const profile = state.profiles.find((p) => p.id === profileId);
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const ext = path.extname(file.name) || "";
  const storedName = `${crypto.randomUUID()}${ext}`;
  const dir = profileUploadDir(profileId);
  await fs.mkdir(dir, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(dir, storedName), buf);

  const meta = { fileName: file.name, storedName };

  if (kindRaw === "resume") profile.resume = meta;
  else if (kindRaw === "job_description") profile.jobDescription = meta;
  else {
    profile.references.push({
      id: crypto.randomUUID(),
      fileName: file.name,
      storedName,
    });
  }

  profile.updatedAt = new Date().toISOString();
  await writeState(state);

  return NextResponse.json({ profile });
}
