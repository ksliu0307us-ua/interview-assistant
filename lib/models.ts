const DEFAULT_MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "o1",
  "o1-mini",
  "o3-mini",
];

export function getAvailableModels(): string[] {
  const fromEnv = process.env.INTERVIEW_MODELS?.trim();
  if (fromEnv) {
    const list = fromEnv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length > 0) return list;
  }
  return DEFAULT_MODELS;
}

export function getDefaultModel(): string {
  const models = getAvailableModels();
  const preferred = process.env.INTERVIEW_DEFAULT_MODEL?.trim();
  if (preferred && models.includes(preferred)) return preferred;
  return models[0] ?? "gpt-4o";
}
