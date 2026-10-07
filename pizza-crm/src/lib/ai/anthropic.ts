/**
 * Cliente mínimo para la API de Claude (solo servidor).
 * Sin SDK: un fetch a /v1/messages. La llave vive en ANTHROPIC_API_KEY
 * (.env.local en desarrollo, Vercel → Environment Variables en producción).
 */

export const AI_MODELS = {
  /** Revisión de gastos: rápido y barato. */
  fast: process.env.ANTHROPIC_MODEL_FAST?.trim() || "claude-haiku-4-5-20251001",
  /** Comentario del estado de resultados. */
  report: process.env.ANTHROPIC_MODEL_REPORT?.trim() || "claude-sonnet-5-5",
};

const API_URL = "https://api.anthropic.com/v1/messages";
const TIMEOUT_MS = 50_000;

export class AiError extends Error {}

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

type ToolDef = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

type MessagesResult = { content: ContentBlock[]; stopReason: string | null };

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; name: string; input: unknown };

async function callMessages(body: Record<string, unknown>): Promise<MessagesResult> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new AiError("Falta ANTHROPIC_API_KEY en el servidor.");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as
      | { content?: ContentBlock[]; stop_reason?: string; error?: { message?: string } }
      | null;
    if (!res.ok) {
      throw new AiError(`Claude respondió ${res.status}: ${json?.error?.message ?? "error desconocido"}`);
    }
    return { content: json?.content ?? [], stopReason: json?.stop_reason ?? null };
  } catch (e) {
    if (e instanceof AiError) throw e;
    if ((e as Error)?.name === "AbortError") throw new AiError("Claude tardó demasiado en responder.");
    throw new AiError(`No se pudo contactar a Claude: ${(e as Error)?.message ?? e}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Respuesta en texto libre. */
export async function claudeText(opts: {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  const { content, stopReason } = await callMessages({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 1200,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });
  const text = content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  // Si se quedó sin espacio, que se note en vez de cortar a media frase.
  return stopReason === "max_tokens" ? `${text}… [respuesta incompleta]` : text;
}

/** Respuesta estructurada: obliga al modelo a llamar `tool` y devuelve su input. */
export async function claudeTool<T>(opts: {
  model: string;
  system: string;
  user: string;
  tool: ToolDef;
  maxTokens?: number;
}): Promise<T> {
  const { content } = await callMessages({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 4000,
    system: opts.system,
    tools: [opts.tool],
    tool_choice: { type: "tool", name: opts.tool.name },
    messages: [{ role: "user", content: opts.user }],
  });
  const block = content.find((b) => b.type === "tool_use" && b.name === opts.tool.name);
  if (!block || block.type !== "tool_use") throw new AiError("Claude no devolvió el formato esperado.");
  return block.input as T;
}
