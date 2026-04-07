import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/config/env";

function applyRouteCookies(
  response: NextResponse,
  request: NextRequest,
): ReturnType<typeof createServerClient> {
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        response.cookies.set({
          name,
          value: "",
          ...options,
          maxAge: 0,
          expires: new Date(0),
          path: options.path ?? "/",
        });
      },
    },
  });
}

/** Clear Supabase auth cookies (sb-*) still present on the request. */
function clearSupabaseBrowserCookies(request: NextRequest, response: NextResponse) {
  for (const c of request.cookies.getAll()) {
    if (!c.name.startsWith("sb-")) continue;
    response.cookies.set({
      name: c.name,
      value: "",
      maxAge: 0,
      expires: new Date(0),
      path: "/",
    });
  }
}

async function logoutResponse(request: NextRequest) {
  const url = new URL(request.url);
  const loginUrl = new URL("/login", url.origin);
  const response = NextResponse.redirect(loginUrl, { status: 302 });

  const supabase = applyRouteCookies(response, request);
  try {
    await supabase.auth.signOut({ scope: "global" });
  } catch {
    await supabase.auth.signOut();
  }

  clearSupabaseBrowserCookies(request, response);

  return response;
}

export async function GET(request: NextRequest) {
  return logoutResponse(request);
}

export async function POST(request: NextRequest) {
  return logoutResponse(request);
}
