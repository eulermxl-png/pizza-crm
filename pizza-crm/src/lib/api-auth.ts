// src/lib/api-auth.ts
import { createHash, timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'

/**
 * Formato de la variable de entorno PARTNER_API_KEYS:
 *
 *   nombre1:llave1,nombre2:llave2
 *
 * Ejemplo:
 *   PARTNER_API_KEYS="juan:a1b2c3...,dashboard:d4e5f6..."
 *
 * Para revocar a alguien: borras su par de la variable y redeployeas.
 * No afecta a los demás.
 */

type Cliente = { nombre: string; llave: string }

function cargarClientes(): Cliente[] {
  const raw = process.env.PARTNER_API_KEYS ?? ''
  return raw
    .split(',')
    .map((par) => par.trim())
    .filter(Boolean)
    .map((par) => {
      const i = par.indexOf(':')
      if (i === -1) return null
      return { nombre: par.slice(0, i).trim(), llave: par.slice(i + 1).trim() }
    })
    .filter((c): c is Cliente => c !== null && c.llave.length > 0)
}

function iguales(a: string, b: string): boolean {
  // Hasheamos primero para que ambos buffers midan lo mismo
  // y la comparación no filtre la longitud de la llave.
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

/**
 * Devuelve el nombre del cliente autenticado, o null si la llave es inválida.
 * Espera el header: Authorization: Bearer <llave>
 */
export function autenticar(req: NextRequest): string | null {
  const header = req.headers.get('authorization') ?? ''
  if (!header.startsWith('Bearer ')) return null

  const token = header.slice(7).trim()
  if (!token) return null

  for (const cliente of cargarClientes()) {
    if (iguales(token, cliente.llave)) return cliente.nombre
  }
  return null
}

export function noAutorizado() {
  return Response.json(
    { error: 'No autorizado' },
    { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } }
  )
}
