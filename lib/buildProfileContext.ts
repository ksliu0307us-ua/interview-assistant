import type { Profile } from "./types";
import { extractFileText } from "./extractText";

export async function buildProfileContextBlock(profile: Profile, maxChars: number): Promise<string> {
  const chunks: string[] = [];

  const resumeParts: string[] = [];
  if (profile.resume) {
    try {
      const t = await extractFileText(profile.id, profile.resume.storedName, profile.resume.fileName);
      resumeParts.push(`[From uploaded file: ${profile.resume.fileName}]\n${t}`);
    } catch {
      resumeParts.push(`[Uploaded resume file could not be read: ${profile.resume.fileName}]`);
    }
  }
  const pastedResume = profile.resumePastedText?.trim() ?? "";
  if (pastedResume) {
    resumeParts.push(`[From pasted resume text — use this if the file section above is empty or unusable]\n${pastedResume}`);
  }
  if (resumeParts.length > 0) {
    chunks.push(`--- RESUME (all sources below are the same candidate) ---\n\n${resumeParts.join("\n\n---\n\n")}`);
  }

  const jdParts: string[] = [];
  if (profile.jobDescription) {
    try {
      const t = await extractFileText(profile.id, profile.jobDescription.storedName, profile.jobDescription.fileName);
      jdParts.push(`[From uploaded file: ${profile.jobDescription.fileName}]\n${t}`);
    } catch {
      jdParts.push(`[Uploaded job description file could not be read: ${profile.jobDescription.fileName}]`);
    }
  }
  const pastedJd = profile.jobDescriptionText?.trim() ?? "";
  if (pastedJd) {
    jdParts.push(`[From pasted job description — use for role requirements and keywords]\n${pastedJd}`);
  }
  if (jdParts.length > 0) {
    chunks.push(`--- JOB DESCRIPTION ---\n\n${jdParts.join("\n\n---\n\n")}`);
  }

  for (const ref of profile.references) {
    try {
      const t = await extractFileText(profile.id, ref.storedName, ref.fileName);
      chunks.push(`--- Reference (${ref.fileName}) ---\n${t}`);
    } catch {
      chunks.push(`--- Reference ${ref.fileName}: could not read ---`);
    }
  }

  let joined = chunks.join("\n\n");
  if (joined.length > maxChars) {
    joined = joined.slice(0, maxChars) + "\n\n[Context truncated for length.]";
  }
  if (!joined.trim()) {
    return "(No resume, job description, or reference documents provided yet. Ask the user to upload files or paste resume and JD text in Settings.)";
  }
  return joined;
}
