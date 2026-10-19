"use client";

import { startTransition, useActionState, useState } from "react";
import { CATEGORIAS, STATUS } from "@/lib/ideias";
import { ajustar, reabrir, type Resultado } from "./acoes";

export type ValoresAjuste = {
  status: string;
  categoria: string;
  setor_id: string;
  maquina_id: string | null;
  texto: string | null;
  nota: number | null;
  custo_estimado: number | null;
  ganho_estimado: number | null;
  ganho_verificado: number | null;
  ganho_qualitativo: string | null;
  linha_base: string | null;
  sop_codigo: string | null;
  sop_revisao: string | null;
  responsavel_implantacao: string | null;
  prazo_atual: string | null;
  prazo_implantacao: number | null;
};

const campo = "w-full rounded-lg border border-line bg-surface px-3 py-2";
const rotulo = "flex flex-col gap-1 text-sm font-semibold";
const br = (v: number | null) => (v == null ? "" : String(v).replace(".", ","));

function useEnvio(acao: (p: Resultado, f: FormData) => Promise<Resultado>) {
  const [estado, despachar, pendente] = useActionState(acao, null);
  const aoEnviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    startTransition(() => despachar(dados));
  };
  return { estado, aoEnviar, pendente };
}

function Motivo() {
  return (
    <>
      <label className={rotulo}>
        Motivo do ajuste (obrigatório, fica registrado)
        <input name="motivo" required maxLength={300} placeholder="Ex.: ganho recalculado com o custo real do minuto" className={campo} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="avisar" defaultChecked className="h-4 w-4" /> Avisar o autor
      </label>
    </>
  );
}

// Ajustes do gestor do programa: aparece só para ele (Fase 0, seção 2). Tudo fica na trilha de auditoria.
export function AjustesGestor({
  id,
  v,
  setores,
  maquinas,
}: {
  id: string;
  v: ValoresAjuste;
  setores: { id: string; nome: string }[];
  maquinas: { id: string; nome: string; setor_id: string }[];
}) {
  const [aba, setAba] = useState<"dados" | "etapa">("dados");
  const [setor, setSetor] = useState(v.setor_id);
  const dados = useEnvio(ajustar);
  const etapa = useEnvio(reabrir);

  return (
    <details className="rounded-xl border border-dashed border-warn bg-surface p-5">
      <summary className="cursor-pointer font-display text-xl font-bold">Ajustes do gestor</summary>
      <p className="mt-1 text-sm text-muted">
        Correções depois das decisões. Só o gestor do programa vê esta área. Cada ajuste registra o valor anterior, o novo, o motivo, quem fez e quando.
      </p>
      <div className="mt-3 flex gap-1.5">
        {(
          [
            ["dados", "Corrigir dados"],
            ["etapa", "Reabrir etapa"],
          ] as const
        ).map(([k, n]) => (
          <button
            key={k}
            type="button"
            onClick={() => setAba(k)}
            aria-pressed={aba === k}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${aba === k ? "border-accent bg-tint" : "border-line bg-surface-2"}`}
          >
            {n}
          </button>
        ))}
      </div>

      {aba === "dados" && (
        <form onSubmit={dados.aoEnviar} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="id" value={id} />
          <div className="grid gap-3 sm:grid-cols-3">
            <label className={rotulo}>
              Tipo de melhoria
              <select name="categoria" defaultValue={v.categoria} className={campo}>
                {CATEGORIAS.map((c) => (
                  <option key={c.k} value={c.k}>
                    {c.n}
                  </option>
                ))}
              </select>
            </label>
            <label className={rotulo}>
              Setor
              <select name="setor_id" value={setor} onChange={(e) => setSetor(e.target.value)} className={campo}>
                {setores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className={rotulo}>
              Máquina
              <select name="maquina_id" defaultValue={v.maquina_id ?? ""} key={setor} className={campo}>
                <option value="">Nenhuma</option>
                {maquinas
                  .filter((m) => m.setor_id === setor)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <label className={rotulo}>
            Texto da ideia
            <textarea name="texto" defaultValue={v.texto ?? ""} maxLength={280} rows={2} className={campo} />
          </label>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className={rotulo}>
              Nota (1 a 5)
              <input name="nota" inputMode="decimal" defaultValue={br(v.nota)} className={campo} />
            </label>
            <label className={rotulo}>
              Custo (R$)
              <input name="custo_estimado" inputMode="decimal" defaultValue={br(v.custo_estimado)} className={campo} />
            </label>
            <label className={rotulo}>
              Ganho estimado (R$/ano)
              <input name="ganho_estimado" inputMode="decimal" defaultValue={br(v.ganho_estimado)} className={campo} />
            </label>
            <label className={rotulo}>
              Ganho verificado (R$/ano)
              <input name="ganho_verificado" inputMode="decimal" defaultValue={br(v.ganho_verificado)} className={campo} />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={rotulo}>
              Linha de base
              <input name="linha_base" defaultValue={v.linha_base ?? ""} className={campo} />
            </label>
            <label className={rotulo}>
              Ganho qualitativo
              <input name="ganho_qualitativo" defaultValue={v.ganho_qualitativo ?? ""} className={campo} />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className={rotulo}>
              Código do SOP
              <input name="sop_codigo" defaultValue={v.sop_codigo ?? ""} className={campo} />
            </label>
            <label className={rotulo}>
              Revisão
              <input name="sop_revisao" defaultValue={v.sop_revisao ?? ""} className={campo} />
            </label>
            <label className={rotulo}>
              Responsável
              <select name="responsavel_implantacao" defaultValue={v.responsavel_implantacao ?? ""} className={campo}>
                <option value="">—</option>
                <option>Encarregado do setor</option>
                <option>Engenharia de produto</option>
              </select>
            </label>
            <label className={rotulo}>
              Prazo da etapa atual
              <input type="date" name="prazo_atual" defaultValue={v.prazo_atual ?? ""} className={campo} />
            </label>
          </div>
          <Motivo />
          {dados.estado && <p className={`font-semibold ${dados.estado.ok ? "text-good" : "text-bad"}`}>{dados.estado.mensagem}</p>}
          <button disabled={dados.pendente} className="self-start rounded-lg bg-warn px-4 py-2 font-semibold text-white disabled:opacity-50">
            {dados.pendente ? "Salvando…" : "Salvar ajustes"}
          </button>
        </form>
      )}

      {aba === "etapa" && (
        <form onSubmit={etapa.aoEnviar} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="id" value={id} />
          <label className={`${rotulo} max-w-sm`}>
            Voltar a ideia para
            <select name="para" defaultValue="" required className={campo}>
              <option value="" disabled>
                Escolha a etapa…
              </option>
              {["em_triagem", "em_viabilidade", "aprovada", "em_implantacao", "padronizando"]
                .filter((s) => s !== v.status)
                .map((s) => (
                  <option key={s} value={s}>
                    {STATUS[s]?.n}
                  </option>
                ))}
            </select>
          </label>
          {v.status === "padronizada" && (
            <p className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">
              A ideia está padronizada: os pontos da implantação serão estornados e voltam quando ela for padronizada de novo.
            </p>
          )}
          <p className="text-xs text-muted">O prazo da etapa recomeça conforme o SLA configurado.</p>
          <Motivo />
          {etapa.estado && <p className={`font-semibold ${etapa.estado.ok ? "text-good" : "text-bad"}`}>{etapa.estado.mensagem}</p>}
          <button disabled={etapa.pendente} className="self-start rounded-lg bg-warn px-4 py-2 font-semibold text-white disabled:opacity-50">
            {etapa.pendente ? "Reabrindo…" : "Reabrir etapa"}
          </button>
        </form>
      )}
    </details>
  );
}
