"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CLASSE_TOM, STATUS, formatarData, nomeCategoria } from "@/lib/ideias";
import { criarClienteNavegador } from "@/lib/supabase/client";

export type IdeiaAnonima = {
  id: string;
  protocolo: string;
  status: string;
  categoria: string;
  setor: string;
  texto: string | null;
  criada_em: string;
  pontos_retidos: number;
  revelacoes: number;
  pontos_liberados: boolean;
};

export function LinhaAnonima({ i }: { i: IdeiaAnonima }) {
  const router = useRouter();
  const [aberto, setAberto] = useState<null | "revelar" | "liberar">(null);
  const [motivo, setMotivo] = useState("");
  const [autor, setAutor] = useState<{ nome: string; matricula: string; setor: string | null } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const s = STATUS[i.status] ?? { n: i.status, tom: "muted" as const };

  async function confirmar() {
    setErro(null);
    if (!motivo.trim()) return setErro("Informe o motivo.");
    setEnviando(true);
    const sb = criarClienteNavegador();
    if (aberto === "revelar") {
      const { data, error } = await sb.rpc("revelar_autoria", { p_ideia: i.id, p_motivo: motivo });
      if (error) setErro(error.message);
      else {
        setAutor((data as { nome: string; matricula: string; setor: string | null }[])[0] ?? null);
        setAberto(null);
        setMotivo("");
        router.refresh();
      }
    } else {
      const { data, error } = await sb.rpc("liberar_pontos_anonimos", { p_ideia: i.id, p_motivo: motivo });
      if (error) setErro(error.message);
      else {
        setAviso(`${data} registro${data === 1 ? "" : "s"} de pontos liberado${data === 1 ? "" : "s"} para o ranking.`);
        setAberto(null);
        setMotivo("");
        router.refresh();
      }
    }
    setEnviando(false);
  }

  return (
    <>
      <tr className="border-b border-line align-top">
        <td className="px-3 py-2 font-mono">
          <a href={`/gestor/ideias/${i.id}`} className="font-semibold text-accent hover:underline">
            {i.protocolo}
          </a>
          <span className="block text-xs text-muted">{formatarData(i.criada_em)}</span>
        </td>
        <td className="max-w-[300px] px-3 py-2">
          <span className="line-clamp-2">{i.texto || "Ideia por áudio"}</span>
          <span className="text-xs text-muted">
            {nomeCategoria(i.categoria)} · {i.setor}
          </span>
        </td>
        <td className="px-3 py-2">
          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${CLASSE_TOM[s.tom]}`}>{s.n}</span>
        </td>
        <td className="px-3 py-2 font-mono">
          {i.pontos_retidos}
          {i.pontos_liberados && <span className="block font-sans text-xs text-good">já liberados</span>}
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setAberto(aberto === "revelar" ? null : "revelar")} className="rounded-md border border-line px-2 py-1 text-xs font-semibold">
              Revelar autoria{i.revelacoes ? ` (${i.revelacoes}×)` : ""}
            </button>
            {i.pontos_retidos > 0 && (
              <button onClick={() => setAberto(aberto === "liberar" ? null : "liberar")} className="rounded-md border border-line px-2 py-1 text-xs font-semibold">
                Liberar pontos
              </button>
            )}
          </div>
        </td>
      </tr>
      {(aberto || autor || aviso) && (
        <tr className="border-b border-line bg-surface-2">
          <td colSpan={5} className="px-3 py-3">
            {autor && (
              <p className="mb-2 rounded-lg bg-warn-bg px-3 py-2 text-warn">
                Autor: <b>{autor.nome}</b> · matrícula {autor.matricula} · {autor.setor ?? "sem setor"}. Este nome não é guardado na tela e some ao recarregar.
              </p>
            )}
            {aviso && <p className="mb-2 font-semibold text-good">{aviso}</p>}
            {aberto && (
              <div className="flex flex-wrap items-end gap-2 text-sm">
                <label className="flex min-w-[280px] flex-1 flex-col gap-1 font-semibold">
                  {aberto === "revelar" ? "Motivo da revelação" : "Motivo (o autor reivindicou os pontos e aceita aparecer no ranking)"}
                  <input
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    maxLength={300}
                    placeholder={aberto === "revelar" ? "Ex.: entrega do prêmio do 4º trimestre" : "Ex.: autor reivindicou em 20/10"}
                    className="rounded-lg border border-line bg-surface px-3 py-2 font-normal"
                  />
                </label>
                <button onClick={confirmar} disabled={enviando} className="rounded-lg bg-warn px-3 py-2 font-semibold text-white disabled:opacity-50">
                  {enviando ? "Registrando…" : aberto === "revelar" ? "Revelar e registrar" : "Liberar e registrar"}
                </button>
                {erro && <span className="font-semibold text-bad">{erro}</span>}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
