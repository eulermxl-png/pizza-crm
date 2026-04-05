import MenuManagementClient from "@/modules/menu/MenuManagementClient";

export const dynamic = "force-dynamic";

export default function OwnerMenuPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-zinc-50">Gestión del menú</h2>
        <p className="mt-2 max-w-3xl text-zinc-300">
          Administra productos (precios por tamaño e imágenes) y las opciones de
          personalización globales. Los cambios se sincronizan al instante con
          cajeros por Supabase Realtime.
        </p>
      </div>

      <MenuManagementClient />
    </div>
  );
}
