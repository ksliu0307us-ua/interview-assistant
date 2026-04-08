import { NextResponse } from "next/server";
import { readState, writeState } from "@/lib/store";
import type { Profile } from "@/lib/types";
import { ROLES, INTERVIEW_PHASES } from "@/lib/types";

export async function GET() {
  const state = await readState();
  return NextResponse.json(state);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim()
      : "New profile";

  const state = await readState();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const profile: Profile = {
    id,
    name,
    role: ROLES[0],
    interviewPhase: INTERVIEW_PHASES[0],
    customPrompt: "",
    resumePastedText: "",
    jobDescriptionText: "",
    resume: null,
    jobDescription: null,
    references: [],
    createdAt: now,
    updatedAt: now,
  };
  state.profiles.push(profile);
  state.activeProfileId = id;
  await writeState(state);
  return NextResponse.json(profile, { status: 201 });
}
