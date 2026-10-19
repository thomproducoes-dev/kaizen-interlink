"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CATEGORIAS } from "@/lib/ideias";

const campo = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm";
const rotulo = "flex min-w-0 flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-muted";

// Busca e filtros da fila. Os valores ficam no endereço da página: a busca pode ser salva ou compartilhada.
export function FiltrosFila({
  setores,
  maquinas,
  autores,
  encontradas,
  total,
}: {
  setores: string[];
  maquinas: { nome: string; setor: string }[];
  autores: string[];
  encontradas: number;
  total: number;
}) {
  const router = useRouter();
  const caminho = usePathname();
  const params = useSearchParams();
  const [busca, setBusca] = useState(params.get("q") ?? "");
  const primeira = useRef(true);

  function aplicar(mudancas: Record<string, string>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(mudancas)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    router.replace(`${caminho}?${p.toString()}`, { scroll: false });
  }

  // A busca no texto espera a pessoa parar de digitar.
  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    const id = setTimeout(() => aplicar({ q: busca.trim() }), 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  const setor = params.get("setor") ?? "";
  const filtrando = ["q", "tipo", "setor", "maquina", "autor"].some((k) => params.get(k));

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4" aria-label="Busca e filtros">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
        <label className={rotulo}>
          Buscar no texto ou protocolo
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Ex.: serra, retalho, ITL-2026-0003"
            className={`${campo} normal-case tracking-normal`}
          />
        </label>
        <label className={rotulo}>
          Tipo
          <select value={params.get("tipo") ?? ""} onChange={(e) => aplicar({ tipo: e.target.value })} className={campo}>
            <option value="">Todos</option>
            {CATEGORIAS.map((c) => (
              <option key={c.k} value={c.k}>
                {c.n}
              </option>
            ))}
          </select>
        </label>
        <label className={rotulo}>
          Setor
          <select value={setor} onChange={(e) => aplicar({ setor: e.target.value, maquina: "" })} className={campo}>
            <option value="">Todos</option>
            {setores.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className={rotulo}>
          Máquina
          <select value={params.get("maquina") ?? ""} onChange={(e) => aplicar({ maquina: e.target.value })} className={campo}>
            <option value="">Todas</option>
            {maquinas
              .filter((m) => !setor || m.setor === setor)
              .map((m) => (
                <option key={`${m.setor}-${m.nome}`} value={m.nome}>
                  {m.nome}
                </option>
              ))}
          </select>
        </label>
        <label className={rotulo}>
          Autor
          <select value={params.get("autor") ?? ""} onChange={(e) => aplicar({ autor: e.target.value })} className={campo}>
            <option value="">Todos</option>
            {autores.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
      </div>
      {filtrando && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted">
            {encontradas} de {total} ideia{total === 1 ? "" : "s"} atendem à busca.
          </span>
          <button
            onClick={() => {
              setBusca("");
              aplicar({ q: "", tipo: "", setor: "", maquina: "", autor: "" });
            }}
            className="rounded-lg border border-line px-3 py-1.5 font-semibold"
          >
            Limpar filtros
          </button>
        </div>
      )}
    </section>
  );
}
