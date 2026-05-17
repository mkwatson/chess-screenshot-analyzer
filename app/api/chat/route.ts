import {
  jsonSchema,
  streamText,
  convertToModelMessages,
  stepCountIs,
  tool,
  type UIMessage,
  type ToolSet,
} from "ai";
import { google } from "@ai-sdk/google";
import { parseScreenshot } from "@/lib/vision/parse-screenshot";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { tools } from "@/lib/agent/tools";

export const runtime = "nodejs";
export const maxDuration = 60;

// Shape of the tools dict auto-injected by AssistantChatTransport (toToolsJSONSchema).
// Each entry carries a raw JSON Schema 7 object as `parameters`.
interface BodyTool {
  readonly description?: string;
  readonly parameters: Record<string, unknown>;
}
type BodyTools = Record<string, BodyTool>;

// Wrap frontend tools from the request body into AI SDK tool definitions.
// No `execute` — client-side useToolInvocations handles resolution via addToolResult.
const wrapBodyTools = (body: BodyTools | undefined): ToolSet => {
  if (!body) return {};
  return Object.fromEntries(
    Object.entries(body).map(([name, t]) => [
      name,
      tool({
        ...(t.description !== undefined && { description: t.description }),
        inputSchema: jsonSchema(t.parameters),
      }),
    ]),
  );
};

// Per AGENTS.md "Gemini model policy": Flash Lite is the default for the
// agent loop in v0. Escalation to gemini-3.1-pro-preview is reserved for
// later plans (10's eval loop) via prepareStep.
const MODEL = google("gemini-3.1-flash-lite");

// Helper: extract image attachments from a UI message's parts.
// AI SDK v6 FileUIPart shape (verified against node_modules/ai/dist/index.d.ts:1654):
//   { type: 'file'; mediaType: string; url: string; filename?: string; ... }
// `url` is either a hosted URL or a data URL (`data:image/png;base64,XXX`).
// assistant-ui's SimpleImageAttachmentAdapter produces data URLs.
interface ImageAttachment {
  readonly mediaType: string;
  readonly imageBase64: string;
}
const extractImages = (msg: UIMessage): readonly ImageAttachment[] =>
  msg.parts.flatMap((part): readonly ImageAttachment[] => {
    if (part.type !== "file") return [];
    if (!part.mediaType.startsWith("image/")) return [];
    // Parse base64 out of the data URL. Skip hosted URLs (no good default
    // here — would require a fetch; not needed for assistant-ui's adapter).
    const commaIdx = part.url.indexOf(",");
    if (!part.url.startsWith("data:") || commaIdx === -1) return [];
    const b64 = part.url.slice(commaIdx + 1);
    if (b64 === "") return [];
    return [{ mediaType: part.mediaType, imageBase64: b64 }];
  });

// Pre-pass: for the latest user message with image attachments, call
// parseScreenshot once and produce a system note for the agent. Returns the
// note string (empty if no images / parse failed — agent handles gracefully).
const buildFenContext = async (messages: readonly UIMessage[]): Promise<string> => {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return "";
  const images = extractImages(lastUser);
  // Parse only the first image. Multi-image messages are unusual; revisit if needed.
  const [img] = images;
  if (!img) return "";
  const result = await parseScreenshot({
    imageBase64: img.imageBase64,
    mimeType: img.mediaType,
  });
  if (!result.ok)
    return `FEN-parse: failed (${result.reason}). Ask the user to clarify the position.`;
  return `FEN: ${result.data.fen}\nSide to move: ${result.data.sideToMove}`;
};

export async function POST(req: Request): Promise<Response> {
  const { messages, tools: bodyTools }: { messages: UIMessage[]; tools?: BodyTools } =
    (await req.json()) as { messages: UIMessage[]; tools?: BodyTools };

  const [fenContext, modelMessages] = await Promise.all([
    buildFenContext(messages),
    convertToModelMessages(messages),
  ]);

  const result = streamText({
    model: MODEL,
    system:
      fenContext !== "" ? `${SYSTEM_PROMPT}\n\n# Current context\n${fenContext}` : SYSTEM_PROMPT,
    messages: modelMessages,
    tools: { ...tools, ...wrapBodyTools(bodyTools) },
    // Bound the loop. 8 steps is generous for: parse-pre-pass already done,
    // then analyzePosition + showBoard + optional second analyzePosition for
    // a candidate-move comparison + final prose response.
    stopWhen: stepCountIs(8),
    providerOptions: {
      google: { thinkingConfig: { thinkingLevel: "low" } },
    },
  });

  return result.toUIMessageStreamResponse({
    // Ensures the stream finishes server-side even if the client disconnects
    // (important for mobile PWAs — phone calls, app-switching). The callback
    // receives a tee'd copy of the SSE stream; draining keeps it flowing.
    consumeSseStream: async ({ stream }) => {
      const reader = stream.getReader();
      try {
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      } finally {
        reader.releaseLock();
      }
    },
  });
}
