"use client";

import { useState } from "react";
import { criarClienteNavegador } from "@/lib/supabase/client";

// Entrada da gestão (gestor, comitê, engenharia) por link enviado ao e-mail. Sem senha.
// Só entra quem já foi cadastrado: o link não cria usuários novos.
export default function Entrar() {
  const [email, setEmail] = useState("");
  const [estado, setEstado] = useState<"livre" | "enviando" | "enviado" | "erro">("livre");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEstado("enviando");
    const { error } = await criarClienteNavegador().auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/gestor`,
      },
    });
    setEstado(error ? "erro" : "enviado");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-12">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">Kaizen 4.0 · Interlink</p>
        <h1 className="font-display text-4xl font-bold">Área da gestão</h1>
        <p className="mt-1 text-muted">Enviamos um link de acesso para o seu e-mail cadastrado.</p>
      </div>

      {estado === "enviado" ? (
        <p className="rounded-xl bg-good-bg p-4 text-good">
          Link enviado para <b>{email}</b>. Abra o e-mail neste mesmo navegador e clique no link.
        </p>
      ) : (
        <form onSubmit={enviar} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
          <label htmlFor="email" className="text-sm font-semibold">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2"
            autoComplete="email"
          />
          {estado === "erro" && (
            <p className="text-sm font-semibold text-bad">
              Não foi possível enviar o link. Confira o e-mail ou aguarde alguns minutos e tente de novo.
            </p>
          )}
          <button
            type="submit"
            disabled={estado === "enviando"}
            className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-ink disabled:opacity-50"
          >
            {estado === "enviando" ? "Enviando…" : "Enviar link de acesso"}
          </button>
        </form>
      )}
    </main>
  );
}
