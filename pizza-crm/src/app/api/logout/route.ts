import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/config/env";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const loginUrl = new URL("/login", url.origin);

  const response = NextResponse.redirect(loginUrl, { status: 302 });

  const supabase = createServerClient(
    env.supabaseUrl,
    env.supabaseAnonKey,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: "", ...options });
        },
      },
    },
  );

  await supabase.auth.signOut();

  return response;
}
