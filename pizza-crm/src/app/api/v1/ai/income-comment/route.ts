import type { NextRequest } from "next/server";

import { AI_MODELS, AiError, aiConfigured, claudeText } from "@/lib/ai/anthropic";
import { INCOME_COMMENT_SYSTEM } from "@/lib/ai/prompts";
import { requireRoleApi } from "@/lib/ai/requireRoleApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY = 40_000;

export async function POST(req: NextRequest) {
  const auth = await requireRoleApi(["owner"]);
  if ("error" in auth) return auth.error;

  if (!aiConfigured()) {
    return Response.json(
      { error: "Falta configurar ANTHROPIC_API_KEY en el servidor." },
      { status: 503 },
    );
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY) {
    return Response.json({ error: "Resumen demasiado grande." }, { status: 413 });
  }
  let resumen: unknown;
  try {
    resumen = (JSON.parse(raw) as { resumen?: unknown }).resumen;
  } catch {
    resumen = undefined;
  }
  if (!resumen || typeof resumen !== "object") {
    return Response.json({ error: "Falta el resumen del estado de resultados." }, { status: 400 });
  }

  try {
    const comentario = await claudeText({
      model: AI_MODELS.report,
      system: INCOME_COMMENT_SYSTEM,
      user: `Estado de resultados (montos en MXN; márgenes como fracción, 0.25 = 25%):\n${JSON.stringify(resumen)}`,
      maxTokens: 2000,
    });
    if (!comentario) throw new AiError("Claude no devolvió texto.");
    return Response.json({ comentario });
  } catch (e) {
    return Response.json(
      { error: e instanceof AiError ? e.message : "No se pudo generar el análisis." },
      { status: 502 },
    );
  }
}
