"use client";

import { startTransition, useActionState } from "react";
import { salvarConfiguracoes } from "../actions";

const campo = "w-full rounded-lg border border-line bg-surface px-3 py-2";
const fmt = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));

const CAMPOS = [
  { k: "custo_minuto", n: "Custo do minuto-máquina (R$)", d: "Usado em ganhos de tempo de ciclo e setup." },
  { k: "hora_homem", n: "Custo da hora-homem (R$)", d: "Referência para horas internas na implantação." },
  { k: "m2_chapa", n: "Custo do m² de chapa (R$)", d: "Usado em ganhos de material (MDF, MDP)." },
  { k: "kwh", n: "Tarifa de energia (R$/kWh)", d: "Usado em ganhos de energia." },
];

export function FormConfiguracoes({ teto, valores, limite }: { teto: number; valores: Record<string, number | null>; limite: number }) {
  const [estado, acao, pendente] = useActionState(salvarConfiguracoes, null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        startTransition(() => acao(dados));
      }}
      className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-5"
    >
      <h2 className="font-display text-2xl font-bold">Valores unitários</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {CAMPOS.map((c) => (
          <label key={c.k} className="flex flex-col gap-1 text-sm font-semibold">
            {c.n}
            <input name={c.k} inputMode="decimal" defaultValue={fmt(valores[c.k])} placeholder="Não informado" className={campo} />
            <span className="text-xs font-normal text-muted">{c.d}</span>
          </label>
        ))}
      </div>
      <h2 className="font-display text-2xl font-bold">Triagem</h2>
      <label className="flex max-w-xs flex-col gap-1 text-sm font-semibold">
        Teto para implantação direta pelo setor (R$)
        <input name="teto" inputMode="decimal" defaultValue={fmt(teto)} className={campo} />
        <span className="text-xs font-normal text-muted">Acima disso, a ideia vai obrigatoriamente para a engenharia.</span>
      </label>
      <h2 className="font-display text-2xl font-bold">Pontos</h2>
      <label className="flex max-w-xs flex-col gap-1 text-sm font-semibold">
        Limite de ideias pontuadas por pessoa no mês
        <input name="limite_mensal" type="number" min={1} max={100} defaultValue={limite} className={campo} />
        <span className="text-xs font-normal text-muted">Passado o limite, a ideia é registrada e analisada normalmente, mas não soma pontos.</span>
      </label>
      {estado && <p className={`font-semibold ${estado.ok ? "text-good" : "text-bad"}`}>{estado.mensagem}</p>}
      <button disabled={pendente} className="self-start rounded-lg bg-accent px-4 py-2 font-semibold text-accent-ink disabled:opacity-50">
        {pendente ? "Salvando…" : "Salvar configurações"}
      </button>
    </form>
  );
}
