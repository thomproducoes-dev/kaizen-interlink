"use client";

import { useEffect, useState } from "react";
import { Icone } from "@/components/icone";
import { CATEGORIAS, formatarData } from "@/lib/ideias";
import { criarClienteNavegador } from "@/lib/supabase/client";

type ItemMural = {
  protocolo: string;
  texto: string | null;
  categoria: string;
  setor: string;
  maquina: string | null;
  autor: string;
  sop: string | null;
  ganho_verificado: number | null;
  ganho_qualitativo: string | null;
  padronizada_em: string | null;
};
type Posicao = { posicao: number; nome: string; setor: string | null; pontos: number; nivel: string };

// Mural da fábrica: ideias que viraram padrão e o ranking do ano (Fase 0, seções 8 e 9).
export function Mural({ aoVoltar }: { aoVoltar: () => void }) {
  const [itens, setItens] = useState<ItemMural[] | null>(null);
  const [ranking, setRanking] = useState<Posicao[]>([]);

  useEffect(() => {
    const sb = criarClienteNavegador();
    sb.rpc("mural", { p_limite: 20 }).then(({ data }) => setItens((data ?? []) as ItemMural[]));
    sb.rpc("ranking", { p_ano: null, p_limite: 5 }).then(({ data }) => setRanking((data ?? []) as Posicao[]));
  }, []);

  return (
    <section className="flex flex-1 flex-col gap-4">
      <h1 className="font-display text-4xl font-bold">Ideias que viraram padrão</h1>
      {ranking.length > 0 && (
        <div className="rounded-2xl bg-tint p-4">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted">Ranking do ano</span>
          <ol className="mt-1 flex flex-col gap-1">
            {ranking.map((r) => (
              <li key={r.nome} className="flex items-center justify-between gap-2">
                <span>
                  <b className="font-mono">{r.posicao}º</b> {r.nome} <span className="text-sm text-muted">· {r.setor}</span>
                </span>
                <span className="whitespace-nowrap font-semibold">
                  {r.pontos} pts · {r.nivel}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {!itens && <p className="text-muted">Carregando…</p>}
      {itens && itens.length === 0 && <p className="py-8 text-center text-muted">Nenhuma ideia padronizada ainda. A sua pode ser a primeira!</p>}
      <div className="flex flex-col gap-2">
        {itens?.map((i) => (
          <div key={i.protocolo} className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-3">
            <span className="flex items-center justify-between gap-2 text-sm text-muted">
              <span className="flex items-center gap-1.5 font-semibold text-foreground">
                <Icone nome={CATEGORIAS.find((c) => c.k === i.categoria)?.icone ?? "outros"} tamanho={18} />
                {CATEGORIAS.find((c) => c.k === i.categoria)?.n}
              </span>
              {formatarData(i.padronizada_em)}
            </span>
            {i.texto && <p className="text-lg">{i.texto}</p>}
            <span className="text-sm">
              <b>{i.autor}</b> · {i.setor}
              {i.maquina ? ` · ${i.maquina}` : ""}
            </span>
            <span className="text-sm text-muted">
              {i.sop ? `Padrão ${i.sop}` : ""}
              {i.ganho_verificado ? ` · ganho de ${Number(i.ganho_verificado).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} por ano` : ""}
              {!i.ganho_verificado && i.ganho_qualitativo ? ` · ${i.ganho_qualitativo}` : ""}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-auto flex pt-2">
        <button onClick={aoVoltar} className="min-h-16 flex-1 rounded-2xl border border-line bg-surface-2 text-xl font-semibold">
          Voltar
        </button>
      </div>
    </section>
  );
}
