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
      className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-950/60 p-6"
    >
      <h2 className="mb-4 text-2xl font-bold text-zinc-100">
        Iniciar sesión
      </h2>

      <div className="mb-4">
        <label className="mb-2 block text-sm text-zinc-300">Email</label>
        <input
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          autoComplete="email"
          className="h-12 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-zinc-100 outline-none focus:border-red-600"
          placeholder="tu@email.com"
        />
      </div>

      <div className="mb-6">
        <label className="mb-2 block text-sm text-zinc-300">Contraseña</label>
        <input
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          autoComplete="current-password"
          className="h-12 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-zinc-100 outline-none focus:border-red-600"
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
        className="h-12 w-full rounded-lg bg-red-600 font-semibold text-zinc-50 transition hover:bg-red-500 disabled:opacity-60"
      >
        {loading ? "Iniciando..." : "Entrar"}
      </button>
    </form>
  );
}

