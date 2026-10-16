"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { alternarAtivo, criarColaborador, novoAdesivo, redefinirPin, salvarPapeis } from "./actions";

export type Colaborador = {
  id: string;
  nome: string;
  matricula: string;
  ativo: boolean;
  setor: string;
  papeis: string[];
  temPin: boolean;
  adesivoEm: string | null;
};

const PAPEIS = [
  { k: "encarregado", n: "Encarregado" },
  { k: "comite", n: "Comitê" },
  { k: "engenharia", n: "Engenharia" },
  { k: "gestor", n: "Gestor" },
  { k: "rh", n: "RH" },
];
const NOME_PAPEL: Record<string, string> = {
  colaborador: "Colaborador",
  admin: "Admin",
  ...Object.fromEntries(PAPEIS.map((p) => [p.k, p.n])),
};

const campo = "rounded-lg border border-line bg-surface px-3 py-2";

export function FormNovoColaborador({ setores }: { setores: { id: string; nome: string }[] }) {
  const [estado, acao, pendente] = useActionState(criarColaborador, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado?.ok) formRef.current?.reset();
  }, [estado]);

  return (
    <form ref={formRef} action={acao} className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
      <h2 className="font-display text-2xl font-bold">Novo colaborador</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Nome completo
          <input name="nome" required className={campo} autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Matrícula
          <input name="matricula" required className={campo} autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Setor
          <select name="setor_id" className={campo} defaultValue="">
            <option value="">Sem setor</option>
            {setores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          PIN inicial (4 números)
          <input name="pin" required inputMode="numeric" pattern="\d{4}" maxLength={4} className={`${campo} font-mono`} autoComplete="off" />
        </label>
      </div>
      <fieldset className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <legend className="mb-1 font-semibold">Papéis além de colaborador</legend>
        {PAPEIS.map((p) => (
          <label key={p.k} className="flex items-center gap-2">
            <input type="checkbox" name="papeis" value={p.k} className="h-4 w-4" />
            {p.n}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pendente} className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-ink disabled:opacity-50">
          {pendente ? "Salvando…" : "Cadastrar"}
        </button>
        {estado && <p className={`text-sm font-semibold ${estado.ok ? "text-good" : "text-bad"}`}>{estado.mensagem}</p>}
      </div>
      <p className="text-xs text-muted">
        Oriente o colaborador a trocar o PIN depois. PINs com números repetidos ou em sequência (1111, 1234) são recusados.
      </p>
    </form>
  );
}

export function LinhaColaborador({ c }: { c: Colaborador }) {
  const [aberto, setAberto] = useState<null | "pin" | "papeis">(null);
  const [estadoPin, acaoPin, pendentePin] = useActionState(redefinirPin, null);

  return (
    <>
      <tr className={`border-b border-line align-top ${c.ativo ? "" : "text-muted"}`}>
        <td className="px-3 py-2 font-semibold">{c.nome}</td>
        <td className="px-3 py-2 font-mono">{c.matricula}</td>
        <td className="px-3 py-2">{c.setor}</td>
        <td className="px-3 py-2">{c.papeis.map((p) => NOME_PAPEL[p] ?? p).join(", ")}</td>
        <td className="px-3 py-2">
          {!c.ativo ? (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold">Desativado</span>
          ) : c.temPin ? (
            <span className="rounded-full bg-good-bg px-2 py-0.5 text-xs font-semibold text-good">Pronto</span>
          ) : (
            <span className="rounded-full bg-warn-bg px-2 py-0.5 text-xs font-semibold text-warn">Sem PIN</span>
          )}
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setAberto(aberto === "pin" ? null : "pin")} className="rounded-md border border-line px-2 py-1 text-xs font-semibold">
              Redefinir PIN
            </button>
            <button onClick={() => setAberto(aberto === "papeis" ? null : "papeis")} className="rounded-md border border-line px-2 py-1 text-xs font-semibold">
              Papéis
            </button>
            <form action={novoAdesivo}>
              <input type="hidden" name="id" value={c.id} />
              <button
                className="rounded-md border border-line px-2 py-1 text-xs font-semibold"
                title="Use quando o adesivo for perdido: o antigo deixa de funcionar"
              >
                Novo adesivo
              </button>
            </form>
            <form action={alternarAtivo}>
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="ativo" value={String(c.ativo)} />
              <button className="rounded-md border border-line px-2 py-1 text-xs font-semibold">
                {c.ativo ? "Desativar" : "Reativar"}
              </button>
            </form>
          </div>
        </td>
      </tr>
      {aberto === "pin" && (
        <tr className="border-b border-line bg-surface-2">
          <td colSpan={6} className="px-3 py-3">
            <form action={acaoPin} className="flex flex-wrap items-center gap-2 text-sm">
              <input type="hidden" name="id" value={c.id} />
              <label className="font-semibold" htmlFor={`pin-${c.id}`}>
                Novo PIN para {c.nome}
              </label>
              <input id={`pin-${c.id}`} name="pin" inputMode="numeric" pattern="\d{4}" maxLength={4} required className={`${campo} w-24 font-mono`} />
              <button disabled={pendentePin} className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-accent-ink disabled:opacity-50">
                Salvar PIN
              </button>
              {estadoPin && <span className={`font-semibold ${estadoPin.ok ? "text-good" : "text-bad"}`}>{estadoPin.mensagem}</span>}
            </form>
          </td>
        </tr>
      )}
      {aberto === "papeis" && (
        <tr className="border-b border-line bg-surface-2">
          <td colSpan={6} className="px-3 py-3">
            <form action={salvarPapeis} onSubmit={() => setAberto(null)} className="flex flex-wrap items-center gap-4 text-sm">
              <input type="hidden" name="id" value={c.id} />
              {PAPEIS.map((p) => (
                <label key={p.k} className="flex items-center gap-2">
                  <input type="checkbox" name="papeis" value={p.k} defaultChecked={c.papeis.includes(p.k)} className="h-4 w-4" />
                  {p.n}
                </label>
              ))}
              <button className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-accent-ink">Salvar papéis</button>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
