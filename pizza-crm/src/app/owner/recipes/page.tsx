import RecipesClient from "@/modules/recipes/RecipesClient";

export const dynamic = "force-dynamic";

export default function OwnerRecipesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-rondaCream">Recetas</h2>
        <p className="mt-2 max-w-3xl text-muted">
          Define de qué se compone cada platillo (materiales y sub-recetas como
          salsas). El costo se calcula solo con los precios de tus compras.
        </p>
      </div>
      <RecipesClient />
    </div>
  );
}
