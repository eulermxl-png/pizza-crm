import type { NextRequest } from "next/server";

import { AiError, aiConfigured } from "@/lib/ai/anthropic";
import { requireRoleApi } from "@/lib/ai/requireRoleApi";
import { aiFindings } from "@/modules/expenses/lib/auditAi";
import { categoryMedians, runRuleChecks } from "@/modules/expenses/lib/auditChecks";
import type { AuditExpense, AuditResponse } from "@/modules/expenses/lib/auditTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const PAGE = 1000;
const HISTORY_DAYS = 120;

type Supa = Extract<Awaited<ReturnType<typeof requireRoleApi>>, { supabase: unknown }>["supabase"];

function todayTijuana(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Tijuana" }).format(new Date());
}

function shiftYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function fetchExpenses(supabase: Supa, from: string, to: string) {
  const out: { id: string; date: string; category: string; description: string | null; amount: number | string }[] = [];
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await supabase
      .from("expenses")
      .select("id, date, category, description, amount")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true })
      .order("id", { ascending: true })
      .range(start, start + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

async function purchaseLinked(supabase: Supa, ids: string[]): Promise<Set<string>> {
  const set = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from("inventory_purchases")
      .select("expense_id")
      .in("expense_id", ids.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const r of data ?? []) if (r.expense_id) set.add(r.expense_id as string);
  }
  return set;
}

/* ---------- Handler ---------- */

export async function POST(req: NextRequest) {
  const auth = await requireRoleApi(["owner", "monitor"]);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const body = (await req.json().catch(() => null)) as { from?: string; to?: string } | null;
  const from = body?.from ?? "";
  const to = body?.to ?? "";
  if (!YMD.test(from) || !YMD.test(to) || from > to) {
    return Response.json({ error: "Periodo inválido." }, { status: 400 });
  }

  try {
    const [rows, historyRows] = await Promise.all([
      fetchExpenses(supabase, from, to),
      fetchExpenses(supabase, shiftYmd(from, -HISTORY_DAYS), shiftYmd(from, -1)),
    ]);
    const linked = await purchaseLinked(
      supabase,
      rows.map((r) => r.id),
    );
    const expenses: AuditExpense[] = rows.map((r) => ({
      id: r.id,
      date: r.date,
      category: (r.category ?? "").trim(),
      description: (r.description ?? "").trim(),
      amount: Number(r.amount) || 0,
      fromPurchase: linked.has(r.id),
    }));
    const history = historyRows.map((r) => ({
      category: (r.category ?? "").trim(),
      amount: Number(r.amount) || 0,
    }));

    const findings = runRuleChecks(expenses, history, todayTijuana());
    const response: AuditResponse = { findings, revisados: expenses.length, ia: "sin_llave" };

    if (aiConfigured()) {
      try {
        const ai = await aiFindings(expenses, categoryMedians([...history, ...expenses]));
        // Evita repetir lo que ya marcó una regla sobre el mismo gasto y tipo.
        const seen = new Set(findings.flatMap((f) => f.expenseIds.map((id) => `${f.kind}|${id}`)));
        response.findings.push(...ai.filter((f) => !seen.has(`${f.kind}|${f.expenseIds[0]}`)));
        response.ia = "ok";
      } catch (e) {
        response.ia = "error";
        response.iaError = e instanceof AiError ? e.message : "Error al consultar a Claude.";
      }
    }

    // Primero lo que se corrige con un clic, luego lo que requiere revisión.
    response.findings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "fix" ? -1 : 1));
    return Response.json(response);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "No se pudo revisar." },
      { status: 500 },
    );
  }
}
