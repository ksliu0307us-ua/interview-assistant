import fs from "fs/promises";
import type { Profile, ProfilesState } from "./types";
import { PROFILES_FILE, UPLOADS_DIR } from "./paths";

async function ensureDirs() {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

const emptyState = (): ProfilesState => ({
  profiles: [],
  activeProfileId: null,
});

export async function readState(): Promise<ProfilesState> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(PROFILES_FILE, "utf-8");
    const parsed = JSON.parse(raw) as ProfilesState;
    if (!parsed.profiles || !Array.isArray(parsed.profiles)) return emptyState();
    parsed.profiles = parsed.profiles.map((p) => ({
      ...p,
      resumePastedText: typeof p.resumePastedText === "string" ? p.resumePastedText : "",
      jobDescriptionText: typeof p.jobDescriptionText === "string" ? p.jobDescriptionText : "",
    }));
    return parsed;
  } catch {
    return emptyState();
  }
}

export async function writeState(state: ProfilesState): Promise<void> {
  await ensureDirs();
  await fs.writeFile(PROFILES_FILE, JSON.stringify(state, null, 2), "utf-8");
}

export async function getProfile(id: string): Promise<Profile | undefined> {
  const state = await readState();
  return state.profiles.find((p) => p.id === id);
}

