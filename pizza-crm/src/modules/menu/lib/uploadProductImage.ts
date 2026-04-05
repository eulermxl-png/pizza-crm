import { createClient } from "@/lib/supabase/client";

import { PRODUCT_IMAGES_BUCKET } from "../constants";

// English: uploads a file to Supabase Storage and returns its public object URL.
export async function uploadProductImage(productId: string, file: File) {
  const supabase = createClient();

  const match = /\.([a-zA-Z0-9]+)$/.exec(file.name);
  const ext = match ? match[1].toLowerCase() : "jpg";
  const base = file.name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80);

  const path = `products/${productId}/${Date.now()}-${base || "imagen"}.${ext}`;

  const { error } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });

  if (error) throw error;

  const { data } = supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .getPublicUrl(path);

  return data.publicUrl;
}
