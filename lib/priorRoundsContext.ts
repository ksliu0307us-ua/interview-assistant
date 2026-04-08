import type { ChatSession } from "./types";
import { effectiveSeriesId } from "./chatStore";

/**
 * Formats earlier sessions in the same interview series for the system prompt.
 */
export function buildPriorRoundsPromptSection(
  allSessions: ChatSession[],
  currentChatId: string,
  seriesId: string,
  maxChars: number
): string {
  const prior = allSessions
    .filter((s) => effectiveSeriesId(s) === seriesId && s.id !== currentChatId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const parts: string[] = [];
  let used = 0;

  for (const s of prior) {
    if (!s.messages?.length) continue;
    const header = `\n### Earlier round: "${s.title}" (${s.createdAt.slice(0, 10)})\n`;
    const body = s.messages
      .map((m) =>
        m.role === "user"
          ? `[Prep / interviewer question]\n${m.content}`
          : `[Suggested candidate reply]\n${m.content}`
      )
      .join("\n\n");
    const chunk = header + body;
    if (used + chunk.length > maxChars) {
      const room = maxChars - used;
      if (room > 400) {
        parts.push(chunk.slice(0, room) + "\n[Prior rounds truncated for length…]");
      }
      break;
    }
    parts.push(chunk);
    used += chunk.length;
  }

  if (parts.length === 0) return "";

  return (
    "═══ PRIOR INTERVIEW ROUNDS (same position / hiring process) ═══\n" +
    "These transcripts are from earlier saved sessions for this job search (same interview series). " +
    "Use them to stay consistent with topics already covered, questions asked, and stories told. " +
    "Reference follow-ups naturally (e.g. what you said in the phone screen). Do not contradict earlier answers unless the candidate is clearly updating their story.\n" +
    parts.join("\n") +
    "\n═══ END PRIOR ROUNDS ═══"
  );
}
