import { NextResponse } from "next/server";
import fs from "fs/promises";
import { readState, writeState } from "@/lib/store";
import type { Profile } from "@/lib/types";
import { ROLES, INTERVIEW_PHASES } from "@/lib/types";
import path from "path";
import { profileUploadDir, profileChatsDir, CHAT_FILES_ROOT } from "@/lib/paths";

type Ctx = { params: Promise<{ id: string }> };

function isRole(v: unknown): v is Profile["role"] {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

function isPhase(v: unknown): v is Profile["interviewPhase"] {
  return typeof v === "string" && (INTERVIEW_PHASES as readonly string[]).includes(v);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const state = await readState();
  const idx = state.profiles.findIndex((p) => p.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const p = state.profiles[idx];

  if (typeof body.name === "string") p.name = body.name.trim();
  if (isRole(body.role)) p.role = body.role;
  if (isPhase(body.interviewPhase)) p.interviewPhase = body.interviewPhase;
  if (typeof body.customPrompt === "string") p.customPrompt = body.customPrompt;
  if (typeof body.resumePastedText === "string") p.resumePastedText = body.resumePastedText;
  if (typeof body.jobDescriptionText === "string") p.jobDescriptionText = body.jobDescriptionText;
  if (body.active === true) state.activeProfileId = id;

  p.updatedAt = new Date().toISOString();
  await writeState(state);
  return NextResponse.json(p);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const state = await readState();
  const idx = state.profiles.findIndex((p) => p.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  state.profiles.splice(idx, 1);
  if (state.activeProfileId === id) {
    state.activeProfileId = state.profiles[0]?.id ?? null;
  }
  await writeState(state);

  try {
    await fs.rm(profileUploadDir(id), { recursive: true, force: true });
  } catch { /* ignore */ }
  try {
    await fs.rm(profileChatsDir(id), { recursive: true, force: true });
  } catch { /* ignore */ }
  try {
    await fs.rm(path.join(CHAT_FILES_ROOT, id), { recursive: true, force: true });
  } catch { /* ignore */ }

  return NextResponse.json({ ok: true });
}
