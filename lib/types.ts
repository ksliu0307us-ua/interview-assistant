export const ROLES = [
  "Full Stack",
  "Front End",
  "Backend",
  "Software Engineer",
  "AI/ML Engineer",
  "Data Scientist",
  "GenAI Engineer",
  "Data Engineer",
] as const;

export type Role = (typeof ROLES)[number];

export const INTERVIEW_PHASES = [
  "Screening",
  "Technical phone",
  "Coding round",
  "System design",
  "Behavioral",
  "Hiring manager",
  "Final / panel",
  "Other",
] as const;

export type InterviewPhase = (typeof INTERVIEW_PHASES)[number];

export const ANSWER_MODES = ["verbal", "coding", "system_design"] as const;
export type AnswerMode = (typeof ANSWER_MODES)[number];

export interface ReferenceDoc {
  id: string;
  fileName: string;
  storedName: string;
}

export interface Profile {
  id: string;
  name: string;
  role: Role;
  interviewPhase: InterviewPhase;
  customPrompt: string;
  /** Plain-text resume when PDF/image upload has no extractable text */
  resumePastedText: string;
  /** JD pasted from a web page when no JD file is available */
  jobDescriptionText: string;
  resume: { fileName: string; storedName: string } | null;
  jobDescription: { fileName: string; storedName: string } | null;
  references: ReferenceDoc[];
  createdAt: string;
  updatedAt: string;
}

export interface ProfilesState {
  profiles: Profile[];
  activeProfileId: string | null;
}

/** Snapshot of a thread file shown on a specific user turn */
export interface ChatMessageAttachmentRef {
  id: string;
  fileName: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Files first included with this user message (after send) */
  attachments?: ChatMessageAttachmentRef[];
}

export interface ChatAttachment {
  id: string;
  fileName: string;
  storedName: string;
  /** Set after this file is sent with a user message; index into `messages` */
  linkedUserMessageIndex?: number;
}

export interface ChatSession {
  id: string;
  profileId: string;
  /** Shared by all rounds for one position; used to pull in prior interview chat context. */
  seriesId?: string;
  title: string;
  mode: AnswerMode;
  model: string;
  messages: ChatMessage[];
  /** Files uploaded in this chat thread (reference for the model). */
  attachments: ChatAttachment[];
  createdAt: string;
  updatedAt: string;
}
