"use client";

import { useActionState, useEffect, useRef } from "react";
import { criarMaquina } from "../actions";

const campo = "rounded-lg border border-line bg-surface px-3 py-2";

export function FormNovaMaquina({ setores }: { setores: { id: string; nome: string }[] }) {
  const [estado, acao, pendente] = useActionState(criarMaquina, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado?.ok) formRef.current?.reset();
  }, [estado]);

  return (
    <form ref={formRef} action={acao} className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
      <h2 className="font-display text-2xl font-bold">Nova máquina ou posto</h2>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Nome
          <input name="nome" required placeholder="Ex.: Esquadrejadeira 2" className={campo} autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Setor
          <select name="setor_id" required className={campo} defaultValue="">
            <option value="" disabled>
              Escolha…
            </option>
            {setores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </label>
        <button disabled={pendente} className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-ink disabled:opacity-50">
          {pendente ? "Salvando…" : "Cadastrar"}
        </button>
      </div>
      {estado && <p className={`text-sm font-semibold ${estado.ok ? "text-good" : "text-bad"}`}>{estado.mensagem}</p>}
    </form>
  );
}
