import path from "path";

export const DATA_DIR = path.join(process.cwd(), ".data");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
export const PROFILES_FILE = path.join(DATA_DIR, "profiles.json");

export const CHATS_DIR = path.join(DATA_DIR, "chats");
export const CHAT_FILES_ROOT = path.join(DATA_DIR, "chat-files");

export function profileUploadDir(profileId: string): string {
  return path.join(UPLOADS_DIR, profileId);
}

export function profileChatsDir(profileId: string): string {
  return path.join(CHATS_DIR, profileId);
}

export function chatFilePath(profileId: string, chatId: string): string {
  return path.join(CHATS_DIR, profileId, `${chatId}.json`);
}

export function chatAttachmentsDir(profileId: string, chatId: string): string {
  return path.join(CHAT_FILES_ROOT, profileId, chatId);
}
