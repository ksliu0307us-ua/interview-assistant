import OpenAI from "openai";
import { getProfile } from "@/lib/store";
import { getChat, saveChat, loadAllChats, effectiveSeriesId } from "@/lib/chatStore";
import { buildPriorRoundsPromptSection } from "@/lib/priorRoundsContext";
import { buildSystemPrompt } from "@/lib/prompts";
import { buildProfileContextBlock } from "@/lib/buildProfileContext";
import type { AnswerMode } from "@/lib/types";
import { ANSWER_MODES } from "@/lib/types";
import { getAvailableModels } from "@/lib/models";
import {
  buildThreadAttachmentsForModel,
  modelSupportsVision,
} from "@/lib/buildThreadAttachmentsContext";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_DOCS_CONTEXT = 44_000;
const MAX_PRIOR_ROUNDS = 28_000;

function isMode(v: unknown): v is AnswerMode {
  return typeof v === "string" && (ANSWER_MODES as readonly string[]).includes(v);
}


export async function POST(req: Request) {
  const clientKey = req.headers.get("x-api-key")?.trim() || "";
  const apiKey = clientKey || process.env.OPENAI_API_KEY || "";
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Enter your OpenAI API key in Settings, or set OPENAI_API_KEY in .env.local" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const profileId = typeof body.profileId === "string" ? body.profileId : "";
  const chatId = typeof body.chatId === "string" ? body.chatId : "";
  const model = typeof body.model === "string" ? body.model : "";
  const mode = body.mode;
  const userMessage = typeof body.userMessage === "string" ? body.userMessage : "";
  const trimmedUser = userMessage.trim();

  if (!profileId || !chatId || !isMode(mode)) {
    return new Response(
      JSON.stringify({ error: "profileId, chatId, and mode required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const allowed = getAvailableModels();
  if (!model || !allowed.includes(model)) {
    return new Response(JSON.stringify({ error: "Invalid or disallowed model" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const profile = await getProfile(profileId);
  if (!profile) {
    return new Response(JSON.stringify({ error: "Profile not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const session = await getChat(profileId, chatId);
  if (!session) {
    return new Response(JSON.stringify({ error: "Chat session not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const hasThreadFiles = (session.attachments?.length ?? 0) > 0;
  if (!trimmedUser && !hasThreadFiles) {
    return new Response(
      JSON.stringify({
        error: "Enter a message or attach files in this chat to use as reference",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  let { textBlock: threadFilesBlock, images } = await buildThreadAttachmentsForModel(
    profileId,
    session
  );

  const useReasoning = /^o\d|^gpt-5/i.test(model);
  const visionOk = modelSupportsVision(model) && !useReasoning;
  if (!visionOk && images.length) {
    threadFilesBlock += `\n\n[${images.length} image(s) in this thread — this model does not accept image input; use gpt-4o (or another vision model) for visual analysis.]`;
    images = [];
  }

  const userDisplay =
    trimmedUser ||
    "(See attached thread files — answer using their contents together with resume/JD.)";

  const pending = session.attachments.filter(
    (a) => a.linkedUserMessageIndex === undefined
  );
  const attachmentRefs =
    pending.length > 0
      ? pending.map((a) => ({ id: a.id, fileName: a.fileName }))
      : undefined;

  session.messages.push({
    role: "user",
    content: userDisplay,
    ...(attachmentRefs ? { attachments: attachmentRefs } : {}),
  });

  const userIdx = session.messages.length - 1;
  for (const a of pending) {
    a.linkedUserMessageIndex = userIdx;
  }

  if (session.title === "New chat") {
    const text = trimmedUser.replace(/\s+/g, " ") || "Thread files";
    session.title = text.length > 60 ? text.slice(0, 57) + "…" : text;
  }
  session.mode = mode;
  session.model = model;
  await saveChat(session);

  const contextBlock = await buildProfileContextBlock(profile, MAX_DOCS_CONTEXT);
  const allChats = await loadAllChats(profileId);
  const seriesId = effectiveSeriesId(session);
  const priorRoundsBlock = buildPriorRoundsPromptSection(
    allChats,
    session.id,
    seriesId,
    MAX_PRIOR_ROUNDS
  );

  const system = buildSystemPrompt({
    mode,
    role: profile.role,
    phase: profile.interviewPhase,
    customPrompt: profile.customPrompt,
    contextBlock,
    priorRoundsBlock,
    threadFilesBlock,
  });

  const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    ...session.messages
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  const lastIdx = openaiMessages.length - 1;
  const last = openaiMessages[lastIdx];
  if (
    last?.role === "user" &&
    images.length > 0 &&
    visionOk &&
    typeof last.content === "string"
  ) {
    openaiMessages[lastIdx] = {
      role: "user",
      content: [
        { type: "text", text: last.content },
        ...images.map((im) => ({
          type: "image_url" as const,
          image_url: { url: `data:${im.mime};base64,${im.b64}` },
        })),
      ],
    };
  }

  const openai = new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });

  try {
    if (useReasoning) {
      const completion = await openai.chat.completions.create({
        model,
        messages: openaiMessages,
        max_completion_tokens: 16_000,
      });
      const text = completion.choices[0]?.message?.content ?? "";
      session.messages.push({ role: "assistant", content: text });
      await saveChat(session);
      return new Response(text, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Chat-Id": session.id,
        },
      });
    }

    const stream = await openai.chat.completions.create({
      model,
      messages: openaiMessages,
      stream: true,
      max_completion_tokens: 16_000,
    });

    const encoder = new TextEncoder();
    let fullResponse = "";
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content ?? "";
            if (text) {
              fullResponse += text;
              controller.enqueue(encoder.encode(text));
            }
          }
        } catch (e) {
          const errText = `\n[Stream error: ${e instanceof Error ? e.message : "unknown"}]`;
          fullResponse += errText;
          controller.enqueue(encoder.encode(errText));
        } finally {
          session.messages.push({ role: "assistant", content: fullResponse });
          await saveChat(session);
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Chat-Id": session.id,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OpenAI request failed";
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
