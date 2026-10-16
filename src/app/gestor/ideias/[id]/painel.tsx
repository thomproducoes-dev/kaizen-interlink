"use client";

import { startTransition, useActionState, useState } from "react";
import { decidir } from "./acoes";

const CRITERIOS = [
  { k: "impacto", n: "Impacto em segurança ou qualidade" },
  { k: "ganho", n: "Ganho estimado (tempo, material, custo)" },
  { k: "facilidade", n: "Facilidade de implantar" },
  { k: "abrangencia", n: "Abrangência (replicável em outros setores)" },
];

const AVALIADORES = ["Encarregado do setor", "Gerente de produção", "Engenharia de produto"];

const DECISOES = [
  { k: "aprovar", n: "Aprovar sem investimento" },
  { k: "engenharia", n: "Encaminhar à engenharia" },
  { k: "informacao", n: "Pedir informação" },
  { k: "espera", n: "Em espera" },
  { k: "reprovar", n: "Reprovar" },
];

const MOTIVOS_REPROVA = [
  "Cria risco à segurança sem mitigação",
  "Contraria norma, requisito de cliente ou lei",
  "Já implantada ou em andamento (duplicada)",
  "Tecnicamente inviável",
];

const campo = "w-full rounded-lg border border-line bg-surface px-3 py-2";
const rotulo = "flex flex-col gap-1 text-sm font-semibold";

function hojeMais(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Painel de triagem do comitê (Fase 0, seção 5). As regras são conferidas de novo no banco.
export function PainelTriagem({ id, teto, pesos }: { id: string; teto: number; pesos: Record<string, number> }) {
  const [estado, acao, pendente] = useActionState(decidir, null);
  const [notas, setNotas] = useState<Record<string, number>>({});
  const [decisao, setDecisao] = useState<string>("");

  const completas = CRITERIOS.every((c) => notas[c.k]);
  const nota = completas ? Math.round(CRITERIOS.reduce((a, c) => a + notas[c.k] * (pesos[c.k] ?? 0.25), 0) * 10) / 10 : null;

  if (estado?.ok) {
    return <p className="rounded-xl bg-good-bg px-4 py-3 font-semibold text-good">{estado.mensagem}</p>;
  }

  return (
    <form
      // Envio manual: com "action" direto, o React limpa o formulário mesmo quando o banco recusa a decisão.
      onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        startTransition(() => acao(dados));
      }}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="decisao" value={decisao} />
      {CRITERIOS.map((c) => (
        <input key={c.k} type="hidden" name={`nota_${c.k}`} value={notas[c.k] ?? 0} />
      ))}

      <div>
        <h3 className="font-display text-lg font-bold">Pontuação de prioridade</h3>
        <div className="mt-2 flex flex-col gap-2">
          {CRITERIOS.map((c) => (
            <div key={c.k} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">
                {c.n} <span className="text-muted">({Math.round((pesos[c.k] ?? 0) * 100)}%)</span>
              </span>
              <span className="inline-flex overflow-hidden rounded-lg border border-line" role="group" aria-label={c.n}>
                {[1, 2, 3, 4, 5].map((v) => (
                  <button
                    type="button"
                    key={v}
                    onClick={() => setNotas((n) => ({ ...n, [c.k]: v }))}
                    aria-pressed={notas[c.k] === v}
                    className={`h-9 w-9 border-l border-line font-semibold first:border-l-0 ${notas[c.k] === v ? "bg-accent text-accent-ink" : "bg-surface"}`}
                  >
                    {v}
                  </button>
                ))}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
          Nota de prioridade: <b className="font-display text-xl">{nota != null ? String(nota).replace(".", ",") : "—"}</b>
          {nota != null && <span className="text-muted"> · {30 + Math.round(nota * 10)} pontos ao autor se for implantada</span>}
        </p>
        <p className="mt-1 text-xs text-muted">Obrigatória para aprovar ou encaminhar à engenharia.</p>
      </div>

      <fieldset>
        <legend className="font-display text-lg font-bold">Avaliadores presentes</legend>
        <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {AVALIADORES.map((a) => (
            <label key={a} className="flex items-center gap-2">
              <input type="checkbox" name="avaliadores" value={a} className="h-4 w-4" />
              {a}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <h3 className="font-display text-lg font-bold">Decisão</h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {DECISOES.map((d) => (
            <button
              type="button"
              key={d.k}
              onClick={() => setDecisao(d.k)}
              aria-pressed={decisao === d.k}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                decisao === d.k ? (d.k === "reprovar" ? "border-bad bg-bad-bg text-bad" : "border-accent bg-tint") : "border-line bg-surface-2"
              }`}
            >
              {d.n}
            </button>
          ))}
        </div>
      </div>

      {decisao === "aprovar" && (
        <div className="flex flex-col gap-3 rounded-xl bg-surface-2 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={rotulo}>
              Custo estimado (R$)
              <input name="custo" inputMode="decimal" placeholder="0" className={campo} />
            </label>
            <label className={rotulo}>
              Responsável pela implantação
              <select name="responsavel" className={campo} defaultValue="">
                <option value="" disabled>
                  Escolha…
                </option>
                <option>Encarregado do setor</option>
                <option>Engenharia de produto</option>
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="muda_layout" className="h-4 w-4" /> Muda o layout
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="parada_longa" className="h-4 w-4" /> Para a linha por mais de 1 turno
          </label>
          <p className="text-xs text-muted">
            Implantação direta pelo setor só até {teto.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}, sem mudança de
            layout e sem parada longa. Fora disso, encaminhe à engenharia.
          </p>
        </div>
      )}

      {decisao === "engenharia" && (
        <div className="grid gap-3 rounded-xl bg-surface-2 p-4 sm:grid-cols-2">
          <label className={rotulo}>
            Custo estimado (R$, se souber)
            <input name="custo" inputMode="decimal" placeholder="Ex.: 2.400" className={campo} />
          </label>
          <label className={rotulo}>
            Por que vai à engenharia
            <select name="motivo_eng" className={campo} defaultValue="">
              <option value="" disabled>
                Escolha…
              </option>
              <option>Custo acima do teto do setor</option>
              <option>Muda o layout</option>
              <option>Para a linha por mais de 1 turno</option>
              <option>Precisa de projeto técnico</option>
            </select>
          </label>
        </div>
      )}

      {decisao === "informacao" && (
        <div className="flex flex-col gap-2 rounded-xl bg-surface-2 p-4">
          <label className={rotulo}>
            Pergunta para o autor
            <textarea name="pergunta" rows={2} maxLength={300} placeholder="Ex.: em qual máquina isso acontece?" className={campo} />
          </label>
          <p className="text-xs text-muted">O prazo da triagem pausa até o autor responder. Ele tem 5 dias úteis; sem resposta, a ideia vai para “Em espera”.</p>
        </div>
      )}

      {decisao === "espera" && (
        <div className="grid gap-3 rounded-xl bg-surface-2 p-4 sm:grid-cols-2">
          <label className={rotulo}>
            Motivo
            <input name="motivo_espera" placeholder="Ex.: aguardando a parada de manutenção" className={campo} />
          </label>
          <label className={rotulo}>
            Data de revisão (até 90 dias)
            <input type="date" name="revisao" min={hojeMais(1)} max={hojeMais(90)} className={campo} />
          </label>
        </div>
      )}

      {decisao === "reprovar" && (
        <div className="flex flex-col gap-3 rounded-xl bg-surface-2 p-4">
          <label className={rotulo}>
            Motivo
            <select name="motivo_reprova" className={campo} defaultValue="">
              <option value="" disabled>
                Escolha…
              </option>
              {MOTIVOS_REPROVA.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className={rotulo}>
            Explique em uma frase
            <textarea name="frase" rows={2} maxLength={300} placeholder="Ex.: a proteção atual atende à NR-12 após o reaperto." className={campo} />
          </label>
          <label className={rotulo}>
            O que se aproveita ou o que mudaria a decisão
            <textarea name="aproveita" rows={2} maxLength={300} placeholder="Ex.: a checagem antes de ligar entra no checklist do turno." className={campo} />
          </label>
          <p className="text-xs text-muted">
            Regra contra retaliação: reprovar exige um avaliador de fora da linha do autor (gerente de produção ou engenharia). O autor recebe a mensagem com o
            convite para ajustar e reenviar.
          </p>
        </div>
      )}

      {estado && !estado.ok && <p className="rounded-xl bg-bad-bg px-4 py-3 font-semibold text-bad">{estado.mensagem}</p>}

      <button
        disabled={!decisao || pendente}
        className={`rounded-lg px-4 py-2.5 font-semibold disabled:opacity-40 ${decisao === "reprovar" ? "bg-bad text-white" : "bg-accent text-accent-ink"}`}
      >
        {pendente ? "Registrando…" : decisao ? `${DECISOES.find((d) => d.k === decisao)?.n} e avisar o autor` : "Escolha uma decisão"}
      </button>
    </form>
  );
}
