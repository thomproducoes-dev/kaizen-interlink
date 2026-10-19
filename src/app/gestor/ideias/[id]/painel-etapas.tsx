"use client";

import { startTransition, useActionState, useState } from "react";
import { avancarEtapa } from "./acoes";

const campo = "w-full rounded-lg border border-line bg-surface px-3 py-2";
const rotulo = "flex flex-col gap-1 text-sm font-semibold";
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function num(s: string) {
  const t = s.trim();
  if (!t) return NaN;
  return parseFloat(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
}

function hojeMais(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Formulário que não se apaga quando o banco recusa (o React 19 limpa forms com "action").
function Formulario({ etapa, id, children, rotuloBotao, perigo }: { etapa: string; id: string; children: React.ReactNode; rotuloBotao: string; perigo?: boolean }) {
  const [estado, acao, pendente] = useActionState(avancarEtapa, null);
  if (estado?.ok) return <p className="rounded-xl bg-good-bg px-4 py-3 font-semibold text-good">{estado.mensagem}</p>;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        startTransition(() => acao(dados));
      }}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="etapa" value={etapa} />
      {children}
      {estado && !estado.ok && <p className="rounded-xl bg-bad-bg px-4 py-3 font-semibold text-bad">{estado.mensagem}</p>}
      <button disabled={pendente} className={`rounded-lg px-4 py-2.5 font-semibold disabled:opacity-40 ${perigo ? "bg-bad text-white" : "bg-accent text-accent-ink"}`}>
        {pendente ? "Registrando…" : rotuloBotao}
      </button>
    </form>
  );
}

export type ValoresUnitarios = { custo_minuto: number | null; hora_homem: number | null; m2_chapa: number | null; kwh: number | null };

const TIPOS = [
  { k: "tempo", n: "Tempo de ciclo ou setup" },
  { k: "refugo", n: "Refugo ou retrabalho" },
  { k: "material", n: "Material" },
  { k: "energia", n: "Energia" },
  { k: "outros", n: "Outros" },
];

// Viabilidade econômica com calculadora de ganho anual, ROI e payback (Fase 0, seção 10).
export function PainelViabilidade({ id, valores, custoInicial }: { id: string; valores: ValoresUnitarios; custoInicial: number | null }) {
  const [decisao, setDecisao] = useState("aprovar");
  const [tipo, setTipo] = useState("tempo");
  const [c, setC] = useState<Record<string, string>>({
    custo_minuto: valores.custo_minuto != null ? String(valores.custo_minuto).replace(".", ",") : "",
    custo_unit: valores.m2_chapa != null ? String(valores.m2_chapa).replace(".", ",") : "",
    tarifa: valores.kwh != null ? String(valores.kwh).replace(".", ",") : "",
    custo: custoInicial != null ? String(custoInicial).replace(".", ",") : "",
  });
  const v = (k: string) => c[k] ?? "";
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setC((x) => ({ ...x, [k]: e.target.value }));

  const ganho =
    tipo === "tempo"
      ? num(v("minutos")) * num(v("ocorrencias")) * num(v("custo_minuto"))
      : tipo === "refugo"
        ? num(v("pecas")) * 12 * num(v("custo_peca"))
        : tipo === "material"
          ? num(v("quantidade")) * 12 * num(v("custo_unit"))
          : tipo === "energia"
            ? num(v("kwh_mes")) * 12 * num(v("tarifa"))
            : num(v("ganho_outros"));
  const custo = num(v("custo"));
  const ok = isFinite(ganho) && ganho > 0;
  const roi = ok && custo > 0 ? ((ganho - custo) / custo) * 100 : NaN;
  const payback = ok && custo > 0 ? custo / (ganho / 12) : NaN;
  const calculo = { tipo, ...Object.fromEntries(Object.entries(c).filter(([, x]) => x !== "")) };

  const entrada = (k: string, l: string, ph = "") => (
    <label className={rotulo}>
      {l}
      <input value={v(k)} onChange={set(k)} inputMode="decimal" placeholder={ph} className={campo} />
    </label>
  );

  return (
    <Formulario
      etapa="viabilidade"
      id={id}
      rotuloBotao={decisao === "aprovar" ? "Aprovar investimento e iniciar a implantação" : decisao === "espera" ? "Colocar em espera e avisar o autor" : "Reprovar e avisar o autor"}
      perigo={decisao === "reprovar"}
    >
      <input type="hidden" name="decisao" value={decisao} />
      <div className="flex flex-wrap gap-1.5">
        {[
          ["aprovar", "Aprovar investimento"],
          ["espera", "Em espera"],
          ["reprovar", "Reprovar"],
        ].map(([k, n]) => (
          <button
            type="button"
            key={k}
            onClick={() => setDecisao(k)}
            aria-pressed={decisao === k}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${decisao === k ? (k === "reprovar" ? "border-bad bg-bad-bg text-bad" : "border-accent bg-tint") : "border-line bg-surface-2"}`}
          >
            {n}
          </button>
        ))}
      </div>

      {decisao === "aprovar" && (
        <>
          <label className={rotulo}>
            Tipo de ganho
            <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className={campo}>
              {TIPOS.map((t) => (
                <option key={t.k} value={t.k}>
                  {t.n}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            {tipo === "tempo" && (
              <>
                {entrada("minutos", "Minutos economizados por vez", "Ex.: 12")}
                {entrada("ocorrencias", "Vezes por ano", "Ex.: 480")}
                {entrada("custo_minuto", "Custo do minuto (R$)", "Ex.: 2,50")}
              </>
            )}
            {tipo === "refugo" && (
              <>
                {entrada("pecas", "Peças evitadas por mês", "Ex.: 40")}
                {entrada("custo_peca", "Custo por peça (R$)", "Ex.: 35")}
              </>
            )}
            {tipo === "material" && (
              <>
                {entrada("quantidade", "Economia por mês (m², kg, L)", "Ex.: 18")}
                {entrada("custo_unit", "Custo por unidade (R$)", "Ex.: 42")}
              </>
            )}
            {tipo === "energia" && (
              <>
                {entrada("kwh_mes", "kWh economizados por mês", "Ex.: 600")}
                {entrada("tarifa", "Tarifa (R$/kWh)", "Ex.: 0,85")}
              </>
            )}
            {tipo === "outros" && entrada("ganho_outros", "Ganho anual justificado (R$)", "Ex.: 9.000")}
            {entrada("custo", "Custo de implantação (R$)", "Ex.: 2.400")}
          </div>
          <input type="hidden" name="ganho_anual" value={ok ? String(Math.round(ganho * 100) / 100) : ""} />
          <input type="hidden" name="custo" value={v("custo")} />
          <input type="hidden" name="calculo" value={JSON.stringify(calculo)} />
          <dl className="grid grid-cols-3 gap-2 rounded-xl bg-surface-2 p-3 text-center">
            <div>
              <dt className="text-xs text-muted">Ganho anual</dt>
              <dd className="font-display text-xl font-bold">{ok ? brl(ganho) : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">ROI</dt>
              <dd className="font-display text-xl font-bold">{isFinite(roi) ? `${Math.round(roi).toLocaleString("pt-BR")}%` : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Payback</dt>
              <dd className="font-display text-xl font-bold">{isFinite(payback) ? `${payback.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} meses` : "—"}</dd>
            </div>
          </dl>
          <p className="text-xs text-muted">
            ROI = (ganho − custo) ÷ custo. Payback = custo ÷ (ganho ÷ 12). Os valores unitários vêm de Configurações e podem ser ajustados aqui.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={rotulo}>
              Responsável pela implantação
              <select name="responsavel" className={campo} defaultValue="Engenharia de produto">
                <option>Engenharia de produto</option>
                <option>Encarregado do setor</option>
              </select>
            </label>
            <label className={rotulo}>
              Prazo de implantação (dias úteis)
              <input name="prazo" type="number" min={1} max={180} defaultValue={30} className={campo} />
            </label>
          </div>
        </>
      )}

      {decisao === "espera" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={rotulo}>
            Motivo
            <input name="motivo_espera" placeholder="Ex.: orçamento do próximo trimestre" className={campo} />
          </label>
          <label className={rotulo}>
            Data de revisão (até 90 dias)
            <input type="date" name="revisao" min={hojeMais(1)} max={hojeMais(90)} className={campo} />
          </label>
        </div>
      )}

      {decisao === "reprovar" && (
        <div className="flex flex-col gap-3">
          <label className={rotulo}>
            Motivo
            <select name="motivo_reprova" className={campo} defaultValue="">
              <option value="" disabled>
                Escolha…
              </option>
              <option>Custo maior que o ganho esperado</option>
              <option>Sem orçamento no período</option>
              <option>Tecnicamente inviável</option>
            </select>
          </label>
          <label className={rotulo}>
            Explique em uma frase
            <textarea name="frase" rows={2} maxLength={300} className={campo} />
          </label>
          <label className={rotulo}>
            O que se aproveita ou o que mudaria a decisão
            <textarea name="aproveita" rows={2} maxLength={300} className={campo} />
          </label>
        </div>
      )}
    </Formulario>
  );
}

export function PainelInicio({ id }: { id: string }) {
  return (
    <Formulario etapa="inicio" id={id} rotuloBotao="Iniciar implantação e avisar o autor">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={rotulo}>
          Responsável
          <select name="responsavel" className={campo} defaultValue="Encarregado do setor">
            <option>Encarregado do setor</option>
            <option>Engenharia de produto</option>
          </select>
        </label>
        <label className={rotulo}>
          Prazo (dias úteis)
          <input name="prazo" type="number" min={1} max={180} defaultValue={30} className={campo} />
        </label>
      </div>
    </Formulario>
  );
}

export function PainelVerificacao({ id, ganhoEstimado }: { id: string; ganhoEstimado: number | null }) {
  const [tipo, setTipo] = useState("mensuravel");
  return (
    <Formulario etapa="verificacao" id={id} rotuloBotao="Registrar verificação">
      <input type="hidden" name="tipo" value={tipo} />
      <div className="flex flex-wrap gap-1.5">
        {[
          ["mensuravel", "Ganho mensurável"],
          ["qualitativo", "Ganho qualitativo (segurança, ergonomia, 5S)"],
        ].map(([k, n]) => (
          <button
            type="button"
            key={k}
            onClick={() => setTipo(k)}
            aria-pressed={tipo === k}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${tipo === k ? "border-accent bg-tint" : "border-line bg-surface-2"}`}
          >
            {n}
          </button>
        ))}
      </div>
      {tipo === "mensuravel" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={rotulo}>
            Linha de base (antes, com data)
            <input name="linha_base" placeholder="Ex.: setup de 40 min, medido em 10/09" className={campo} />
          </label>
          <label className={rotulo}>
            Ganho anual verificado (R$)
            <input name="ganho_anual" inputMode="decimal" placeholder={ganhoEstimado ? `Estimado: ${brl(ganhoEstimado)}` : "Ex.: 7.800"} className={campo} />
          </label>
          <label className={`${rotulo} sm:col-span-2`}>
            Observação (opcional)
            <input name="descricao" className={campo} />
          </label>
        </div>
      ) : (
        <label className={rotulo}>
          O que mudou, verificado no posto
          <textarea name="descricao" rows={3} placeholder="Ex.: o operador não precisa mais se curvar para alimentar a máquina" className={campo} />
        </label>
      )}
      <p className="text-xs text-muted">Registre o ganho após o período de verificação (padrão: 30 dias de uso). Só o ganho verificado entra nos indicadores.</p>
    </Formulario>
  );
}

export function PainelPadronizacao({ id }: { id: string }) {
  return (
    <Formulario etapa="padronizacao" id={id} rotuloBotao="Concluir: ideia padronizada">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <label className={rotulo}>
          Código do procedimento no sistema da qualidade
          <input name="sop" placeholder="Ex.: IT-PIN-007" className={campo} />
        </label>
        <label className={rotulo}>
          Revisão
          <input name="revisao" placeholder="Ex.: 2" className={campo} />
        </label>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="difusao" className="mt-0.5 h-4 w-4" />
        Equipe do setor orientada sobre o novo padrão (lista de presença ou foto registrada).
      </label>
      <p className="text-xs text-muted">Ao concluir, o autor recebe os pontos: 30 pela implantação + nota × 10 + 50 se o ganho verificado passar de R$ 5.000 por ano.</p>
    </Formulario>
  );
}
