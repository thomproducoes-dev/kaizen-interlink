"use client";

import { startTransition, useActionState, useRef } from "react";
import { adicionarFeriado, importarFeriadosNacionais, removerFeriado } from "../actions";

const campo = "rounded-lg border border-line bg-surface px-3 py-2";
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function dataBR(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return `${SEMANA[d.getDay()]}, ${iso.split("-").reverse().join("/")}`;
}

// Feriados e férias coletivas (Fase 0, seção 4): o relógio de prazos não conta esses dias.
export function Feriados({ lista, anoAtual }: { lista: { data: string; descricao: string }[]; anoAtual: number }) {
  const [estado, acao, pendente] = useActionState(adicionarFeriado, null);
  const formRef = useRef<HTMLFormElement>(null);
  const hoje = hojeISO();
  const proximos = lista.filter((f) => f.data >= hoje);
  const passados = lista.filter((f) => f.data < hoje).length;

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
      <div>
        <h2 className="font-display text-2xl font-bold">Feriados e férias coletivas</h2>
        <p className="text-sm text-muted">
          O relógio de prazos não conta estes dias. Os feriados nacionais podem ser importados; inclua à mão os municipais (São Bento do Sul) e as férias
          coletivas.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {[anoAtual, anoAtual + 1].map((ano) => (
          <form key={ano} action={importarFeriadosNacionais}>
            <input type="hidden" name="ano" value={ano} />
            <button className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold">Importar feriados nacionais de {ano}</button>
          </form>
        ))}
      </div>

      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          const dados = new FormData(e.currentTarget);
          startTransition(() => acao(dados));
          formRef.current?.reset();
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Data
          <input type="date" name="data" required className={campo} />
        </label>
        <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-sm font-semibold">
          Descrição
          <input name="descricao" required maxLength={80} placeholder="Ex.: Férias coletivas" className={campo} />
        </label>
        <button disabled={pendente} className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-ink disabled:opacity-50">
          Adicionar
        </button>
      </form>
      {estado && <p className={`text-sm font-semibold ${estado.ok ? "text-good" : "text-bad"}`}>{estado.mensagem}</p>}

      <ul className="text-sm">
        {proximos.map((f) => (
          <li key={f.data} className="flex items-center justify-between gap-3 border-t border-line py-2 first:border-t-0">
            <span>
              <span className="inline-block w-28 font-mono text-muted">{dataBR(f.data)}</span> {f.descricao}
            </span>
            <form action={removerFeriado}>
              <input type="hidden" name="data" value={f.data} />
              <button className="rounded-md border border-line px-2 py-1 text-xs font-semibold" aria-label={`Remover ${f.descricao}`}>
                Remover
              </button>
            </form>
          </li>
        ))}
        {proximos.length === 0 && <li className="py-2 text-muted">Nenhum feriado futuro cadastrado.</li>}
      </ul>
      {passados > 0 && <p className="text-xs text-muted">{passados} data(s) já passada(s) continuam valendo para o cálculo de prazos antigos.</p>}
    </section>
  );
}
