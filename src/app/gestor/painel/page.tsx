import Link from "next/link";
import { STATUS, nomeCategoria } from "@/lib/ideias";
import { criarClienteServidor } from "@/lib/supabase/server";

// Indicadores do programa (Fase 0, seção 12). Gráficos de uma série só: uma cor, sem legenda,
// rótulos de valor em cor de texto, dica ao passar o mouse e os números sempre visíveis ao lado.

type Indicadores = {
  recebidas: number;
  participantes: number;
  efetivo: number;
  lead_time_triagem: number | null;
  sla_total: number;
  sla_no_prazo: number;
  decididas: number;
  implantadas: number;
  padronizadas: number;
  ganho_verificado: number;
  ganho_estimado: number;
  por_setor: { setor: string; efetivo: number; ideias: number; participantes: number }[];
  por_categoria: { categoria: string; ideias: number }[];
  por_maquina: { maquina: string; setor: string; ideias: number }[];
  por_status: Record<string, number>;
};

const ORDEM_STATUS = ["em_triagem", "aguardando_autor", "em_espera", "em_viabilidade", "aprovada", "em_implantacao", "padronizando", "padronizada", "reprovada"];
const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

function dataISO(d: Date) {
  return d.toISOString().slice(0, 10);
}
function periodoPadrao(p: string | undefined) {
  const hoje = new Date();
  if (p === "30") return { de: dataISO(new Date(hoje.getTime() - 30 * 86400000)), ate: dataISO(hoje) };
  if (p === "90") return { de: dataISO(new Date(hoje.getTime() - 90 * 86400000)), ate: dataISO(hoje) };
  return { de: `${hoje.getFullYear()}-01-01`, ate: dataISO(hoje) };
}

function Kpi({ rotulo, valor, detalhe, tom }: { rotulo: string; valor: string; detalhe: string; tom?: "good" | "warn" | "bad" }) {
  const cor = tom === "good" ? "text-good" : tom === "warn" ? "text-warn" : tom === "bad" ? "text-bad" : "";
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-line bg-surface px-4 py-3">
      <span className="text-sm font-semibold">{rotulo}</span>
      <span className={`font-display text-4xl font-bold tabular-nums ${cor}`}>{valor}</span>
      <span className="text-xs text-muted">{detalhe}</span>
    </div>
  );
}

function Barras({ itens, unidade }: { itens: { nome: string; valor: number; detalhe?: string }[]; unidade: string }) {
  if (!itens.length) return <p className="py-6 text-center text-sm text-muted">Sem dados no período.</p>;
  const max = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <ul className="flex flex-col gap-2">
      {itens.map((i) => (
        <li
          key={i.nome}
          title={`${i.nome}: ${i.valor} ${unidade}${i.detalhe ? ` · ${i.detalhe}` : ""}`}
          className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm"
        >
          <span className="truncate">{i.nome}</span>
          <span className="h-3.5 rounded-r-[4px] bg-surface-2">
            <span className="block h-full rounded-r-[4px] bg-accent" style={{ width: `${(i.valor / max) * 100}%`, minWidth: i.valor ? 2 : 0 }} />
          </span>
          <span className="whitespace-nowrap text-right tabular-nums">
            <b>{i.valor}</b>
            {i.detalhe && <span className="text-muted"> · {i.detalhe}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Cartao({ titulo, children, nota }: { titulo: string; children: React.ReactNode; nota?: string }) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-surface p-5">
      <h2 className="font-display text-xl font-bold">{titulo}</h2>
      {children}
      {nota && <p className="text-xs text-muted">{nota}</p>}
    </section>
  );
}

export default async function Painel({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p = "ano" } = await searchParams;
  const { de, ate } = periodoPadrao(p);
  const supabase = await criarClienteServidor();
  const [{ data, error }, { data: ranking }] = await Promise.all([
    supabase.rpc("painel_indicadores", { p_de: de, p_ate: ate }),
    supabase.rpc("ranking", { p_ano: Number(ate.slice(0, 4)), p_limite: 10 }),
  ]);
  if (error || !data) return <p className="text-bad">Não foi possível carregar os indicadores: {error?.message}</p>;
  const d = data as Indicadores;

  const participacao = pct(d.participantes, d.efetivo);
  const sla = pct(d.sla_no_prazo, d.sla_total);
  const implantacao = pct(d.implantadas, d.decididas);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold">Painel do programa</h1>
          <p className="text-muted">
            Ideias recebidas entre {de.split("-").reverse().join("/")} e {ate.split("-").reverse().join("/")}. Metas do piloto definidas na Fase 0.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {[
            ["30", "30 dias"],
            ["90", "90 dias"],
            ["ano", "Este ano"],
          ].map(([k, n]) => (
            <Link key={k} href={`/gestor/painel?p=${k}`} className={`rounded-full border px-3 py-1.5 font-semibold ${p === k ? "border-foreground bg-foreground text-background" : "border-line bg-surface"}`}>
              {n}
            </Link>
          ))}
          <a href={`/gestor/relatorio?de=${de}&ate=${ate}`} className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-accent-ink">
            Relatório de inovação (CSV)
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi
          rotulo="Participação"
          valor={participacao == null ? "—" : `${participacao}%`}
          detalhe={`${d.participantes} de ${d.efetivo} colaboradores · meta 30%`}
          tom={participacao == null ? undefined : participacao >= 30 ? "good" : participacao >= 15 ? "warn" : "bad"}
        />
        <Kpi rotulo="Ideias recebidas" valor={String(d.recebidas)} detalhe={`${d.padronizadas} já padronizada${d.padronizadas === 1 ? "" : "s"}`} />
        <Kpi
          rotulo="Lead time da triagem"
          valor={d.lead_time_triagem == null ? "—" : `${String(d.lead_time_triagem).replace(".", ",")} d.ú.`}
          detalhe="Do envio à decisão · meta ≤ 5"
          tom={d.lead_time_triagem == null ? undefined : d.lead_time_triagem <= 5 ? "good" : "bad"}
        />
        <Kpi
          rotulo="SLA cumprido"
          valor={sla == null ? "—" : `${sla}%`}
          detalhe={`${d.sla_no_prazo} de ${d.sla_total} etapas no prazo · meta 90%`}
          tom={sla == null ? undefined : sla >= 90 ? "good" : sla >= 75 ? "warn" : "bad"}
        />
        <Kpi rotulo="Taxa de implantação" valor={implantacao == null ? "—" : `${implantacao}%`} detalhe={`${d.implantadas} implantadas de ${d.decididas} decididas`} />
        <Kpi rotulo="Ganho anual verificado" valor={moeda(d.ganho_verificado)} detalhe={`Estimado nas aprovadas: ${moeda(d.ganho_estimado)}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao titulo="Ideias por setor" nota="Ao lado de cada barra: ideias recebidas · % do efetivo do setor que já participou.">
          <Barras
            unidade="ideias"
            itens={d.por_setor.map((s) => ({
              nome: s.setor,
              valor: s.ideias,
              detalhe: s.efetivo ? `${pct(s.participantes, s.efetivo)}% de ${s.efetivo}` : "sem efetivo",
            }))}
          />
        </Cartao>
        <Cartao titulo="Ideias por tipo de melhoria">
          <Barras unidade="ideias" itens={d.por_categoria.map((c) => ({ nome: nomeCategoria(c.categoria), valor: c.ideias }))} />
        </Cartao>
        <Cartao titulo="Ideias por etapa" nota="Onde as ideias do período estão agora.">
          <Barras
            unidade="ideias"
            itens={ORDEM_STATUS.filter((s) => d.por_status[s]).map((s) => ({ nome: STATUS[s]?.n ?? s, valor: d.por_status[s] }))}
          />
        </Cartao>
        <Cartao titulo="Máquinas com mais ideias" nota="Mostra onde estão os gargalos que mais chamam a atenção da equipe.">
          <Barras unidade="ideias" itens={d.por_maquina.map((m) => ({ nome: m.maquina, valor: m.ideias, detalhe: m.setor }))} />
        </Cartao>
      </div>

      <Cartao titulo={`Ranking ${ate.slice(0, 4)}`} nota="Pontos de ideias anônimas ficam guardados até o autor reivindicar com o RH e não entram no ranking.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                <th className="px-2 py-2">#</th>
                <th className="px-2 py-2">Colaborador</th>
                <th className="px-2 py-2">Setor</th>
                <th className="px-2 py-2 text-right">Pontos</th>
                <th className="px-2 py-2">Nível</th>
              </tr>
            </thead>
            <tbody>
              {((ranking ?? []) as { posicao: number; nome: string; setor: string | null; pontos: number; nivel: string }[]).map((r) => (
                <tr key={r.nome} className="border-b border-line">
                  <td className="px-2 py-2 font-mono">{r.posicao}</td>
                  <td className="px-2 py-2 font-semibold">{r.nome}</td>
                  <td className="px-2 py-2">{r.setor ?? "—"}</td>
                  <td className="px-2 py-2 text-right font-mono">{r.pontos}</td>
                  <td className="px-2 py-2">{r.nivel}</td>
                </tr>
              ))}
              {!(ranking ?? []).length && (
                <tr>
                  <td colSpan={5} className="px-2 py-6 text-center text-muted">
                    Nenhum ponto ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Cartao>
    </div>
  );
}
