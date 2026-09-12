"use client";

import { useEffect, useState } from "react";

import { env } from "@/lib/config/env";

export type OnlineStatus = "online" | "offline";

export function useOnlineStatus(): OnlineStatus {
  const [status, setStatus] = useState<OnlineStatus>(() => {
    if (typeof navigator === "undefined") return "online";
    return navigator.onLine ? "online" : "offline";
  });

  useEffect(() => {
    let cancelled = false;

    async function checkSupabaseConnectivity(): Promise<OnlineStatus> {
      if (typeof navigator === "undefined") return "online";
      if (!navigator.onLine) return "offline";

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 3000);

      try {
        // Best-effort "any response" check. `no-cors` avoids CORS errors.
        await fetch(env.supabaseUrl, {
          method: "GET",
          mode: "no-cors",
          cache: "no-store",
          signal: controller.signal,
        });
        return "online";
      } catch {
        return "offline";
      } finally {
        window.clearTimeout(timeout);
      }
    }

    function off() {
      setStatus("offline");
    }

    function markOffline() {
      setStatus("offline");
    }

    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener(
      "supabase_connection_failed",
      markOffline,
    );

    async function on() {
      const next = await checkSupabaseConnectivity();
      if (!cancelled) setStatus(next);
    }

    // Initial check on mount.
    void on();

    // Periodic re-check in case `navigator.onLine` is stale.
    const t = window.setInterval(() => {
      if (typeof navigator === "undefined") return;
      if (!navigator.onLine) return;
      void on();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(t);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener(
        "supabase_connection_failed",
        markOffline,
      );
    };
  }, []);

  return status;
}

