// src/app/api/v1/ventas/route.ts
import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { autenticar, noAutorizado } from '@/lib/api-auth'

export const runtime = 'nodejs'          // necesario para crypto
export const dynamic = 'force-dynamic'   // sin caché

const LIMITE_MAX = 1000
const LIMITE_DEFAULT = 200

// Cliente admin: SOLO en el servidor. Nunca uses NEXT_PUBLIC_ para esta key.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function GET(req: NextRequest) {
  const cliente = autenticar(req)
  if (!cliente) return noAutorizado()

  const { searchParams } = new URL(req.url)

  const desde = searchParams.get('desde')   // YYYY-MM-DD
  const hasta = searchParams.get('hasta')   // YYYY-MM-DD
  const origen = searchParams.get('origen') // walk_in | phone | delivery_app | goat

  const limite = Math.min(
    Number(searchParams.get('limite')) || LIMITE_DEFAULT,
    LIMITE_MAX
  )
  const offset = Math.max(Number(searchParams.get('offset')) || 0, 0)

  const fechaValida = (v: string | null) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v)
  if (!fechaValida(desde) || !fechaValida(hasta)) {
    return Response.json(
      { error: 'Formato de fecha inválido. Usa YYYY-MM-DD.' },
      { status: 400 }
    )
  }

  let query = supabase
    .from('v_api_ventas')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limite - 1)

  if (desde) query = query.gte('fecha', desde)
  if (hasta) query = query.lte('fecha', hasta)
  if (origen) query = query.eq('origen', origen)

  const { data, error, count } = await query

  if (error) {
    // No devolvemos el detalle del error hacia afuera
    console.error(`[api/v1/ventas] cliente=${cliente}`, error)
    return Response.json({ error: 'Error al consultar' }, { status: 500 })
  }

  return Response.json({
    total_registros: count ?? 0,
    limite,
    offset,
    datos: data,
  })
}

// Cualquier otro método queda bloqueado
export async function POST() {
  return Response.json({ error: 'Método no permitido' }, { status: 405 })
}
