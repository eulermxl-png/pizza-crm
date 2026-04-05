# Pizza CRM

Base inicial del CRM para pizzeria con:
- Next.js 14 (App Router) + TailwindCSS
- Supabase (PostgreSQL + Auth + Realtime)
- PWA con `next-pwa`
- Soporte base de IndexedDB con `idb`
- Exportacion Excel con `xlsx` (SheetJS)

## Configuracion inicial

1. Copiar el archivo de variables de entorno:

```bash
cp .env.example .env.local
# Windows PowerShell:
Copy-Item .env.example .env.local
```

2. Completar:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

3. Ejecutar proyecto:

```bash
npm run dev
```

## Estructura modular

La estructura inicial esta separada por modulo:

- `src/modules/orders`
- `src/modules/menu`
- `src/modules/kitchen`
- `src/modules/expenses`
- `src/modules/reports`
- `src/modules/reconciliation`

Tambien incluye bases de infraestructura:
- `src/lib/supabase` (cliente web/server/middleware)
- `src/lib/offline` (IndexedDB)
- `public/manifest.json` + iconos PWA

## Siguiente fase

Implementar autenticacion con roles y rutas protegidas (owner/cashier/kitchen).
