"use client";

import { useEffect } from "react";

/**
 * Auto-actualiza la PWA: revisa si hay una versión nueva publicada y, cuando el
 * nuevo service worker toma control, recarga la página sola. Así el equipo ya no
 * tiene que borrar caché ni entrar en incógnito para ver los cambios nuevos.
 */
export default function SwUpdater() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    let reloading = false;
    const hadController = Boolean(navigator.serviceWorker.controller);

    const onControllerChange = () => {
      // Solo recargar en una actualización real (ya había un SW controlando la
      // página), nunca en la primera instalación.
      if (reloading || !hadController) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

    const checkForUpdate = () => {
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => {
          if (reg) void reg.update();
        })
        .catch(() => {
          /* sin conexión o sin SW: ignorar */
        });
    };

    // Revisa al cargar, cada minuto, y al volver a enfocar la pestaña.
    checkForUpdate();
    const interval = window.setInterval(checkForUpdate, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") checkForUpdate();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
