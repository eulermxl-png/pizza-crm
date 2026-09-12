"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // English comment: authenticate with Supabase email+password.
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError("No se pudo iniciar sesión. Verifica tus credenciales.");
      setLoading(false);
      return;
    }

    router.replace("/");
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-md rounded-xl border border-line bg-surface2 p-6"
    >
      <h2 className="mb-4 text-2xl font-bold text-rondaCream">
        Iniciar sesión
      </h2>

      <div className="mb-4">
        <label className="mb-2 block text-sm text-muted">Email</label>
        <input
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          autoComplete="email"
          className="h-12 w-full rounded-lg border border-line bg-surface3 px-3 text-rondaCream outline-none focus:border-brand"
          placeholder="tu@email.com"
        />
      </div>

      <div className="mb-6">
        <label className="mb-2 block text-sm text-muted">Contraseña</label>
        <input
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          autoComplete="current-password"
          className="h-12 w-full rounded-lg border border-line bg-surface3 px-3 text-rondaCream outline-none focus:border-brand"
          placeholder="••••••••"
        />
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        className="h-12 w-full rounded-lg bg-rondaAccent font-semibold text-rondaCream transition hover:bg-rondaAccentHover disabled:opacity-60"
      >
        {loading ? "Iniciando..." : "Entrar"}
      </button>
    </form>
  );
}

