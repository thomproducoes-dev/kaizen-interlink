import Link from "next/link";
import { Suspense } from "react";
import { CLASSE_SITUACAO, CLASSE_TOM, STATUS, formatarData, nomeCategoria, textoPrazo } from "@/lib/ideias";
import { criarClienteServidor } from "@/lib/supabase/server";
import { FiltrosFila } from "./filtros";

export type LinhaFila = {
  id: string;
  protocolo: string;
  status: string;
  categoria: string;
  setor: string;
  maquina: string | null;
  modo: string;
  autor: string;
  texto: string | null;
  tem_audio: boolean;
  anexos: number;
  versao: number;
  nota: number | null;
  criada_em: string;
  prazo_atual: string | null;
  dias_restantes: number | null;
  situacao: string;
  responsavel: string | null;
};

const FILTROS: Record<string, { n: string; status: string[] | null }> = {
  triagem: { n: "Triagem", status: ["em_triagem", "aguardando_autor"] },
  viabilidade: { n: "Viabilidade", status: ["em_viabilidade"] },
  implantacao: { n: "Implantação", status: ["aprovada", "em_implantacao", "padronizando"] },
  espera: { n: "Em espera", status: ["em_espera"] },
  encerradas: { n: "Encerradas", status: ["reprovada", "padronizada"] },
  reprovadas: { n: "Reprovadas", status: ["reprovada"] },
  todas: { n: "Todas", status: null },
};

function diasAtras(n: number) {
  return new Date(Date.now() - n * 24 * 3600 * 1000).toISOString();
}

// Compara sem acento e sem diferença de maiúsculas: "seguranca" encontra "Segurança".
const normalizar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const unicos = (l: (string | null)[]) => Array.from(new Set(l.filter((x): x is string => !!x))).sort((a, b) => a.localeCompare(b, "pt-BR"));

type Busca = { f?: string; q?: string; tipo?: string; setor?: string; maquina?: string; autor?: string };

export default async function Fila({ searchParams }: { searchParams: Promise<Busca> }) {
  const busca = await searchParams;
  const { f = "triagem", q = "", tipo = "", setor = "", maquina = "", autor = "" } = busca;
  const filtro = FILTROS[f] ?? FILTROS.triagem;
  const supabase = await criarClienteServidor();
  const seteDias = diasAtras(7);
  const [{ data }, { data: alertas }] = await Promise.all([
    supabase.rpc("fila_ideias"),
    supabase.from("alertas_gestao").select("id, tipo, texto, criado_em, ideia_id").gte("criado_em", seteDias).order("criado_em", { ascending: false }).limit(12),
  ]);
  const todas = (data ?? []) as LinhaFila[];
  // Busca e filtros valem para todas as abas; a aba escolhe o status.
  const termo = normalizar(q.trim());
  const filtradas = todas.filter(
    (l) =>
      (!termo || normalizar(`${l.protocolo} ${l.texto ?? ""}`).includes(termo)) &&
      (!tipo || l.categoria === tipo) &&
      (!setor || l.setor === setor) &&
      (!maquina || l.maquina === maquina) &&
      (!autor || l.autor === autor),
  );
  const lista = filtro.status ? filtradas.filter((l) => filtro.status!.includes(l.status)) : filtradas;
  const mantemFiltros = (aba: string) => {
    const p = new URLSearchParams({ f: aba });
    for (const [k, v] of Object.entries({ q, tipo, setor, maquina, autor })) if (v) p.set(k, v);
    return `/gestor/fila?${p.toString()}`;
  };
  const opcoesMaquinas = Array.from(new Map(todas.filter((l) => l.maquina).map((l) => [`${l.setor}|${l.maquina}`, { nome: l.maquina!, setor: l.setor }])).values()).sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR"),
  );
  const abertas = todas.filter((l) => !["reprovada", "padronizada"].includes(l.status));
  const estouradas = abertas.filter((l) => l.situacao === "estourado").length;
  const emAlerta = abertas.filter((l) => l.situacao === "alerta" || l.situacao === "vence_hoje").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold">Fila de ideias</h1>
          <p className="text-muted">Ordenada pelo prazo mais apertado. Prazos em dias úteis (d.ú.), descontando feriados cadastrados.</p>
        </div>
        <div className="flex gap-3 text-sm">
          <span className="rounded-xl border border-line bg-surface px-4 py-2">
            <b className="block font-display text-2xl">{abertas.length}</b>em aberto
          </span>
          <span className="rounded-xl border border-line bg-surface px-4 py-2">
            <b className="block font-display text-2xl text-warn">{emAlerta}</b>em alerta
          </span>
          <span className="rounded-xl border border-line bg-surface px-4 py-2">
            <b className="block font-display text-2xl text-bad">{estouradas}</b>estourada{estouradas === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <nav className="flex flex-wrap gap-1.5 text-sm" aria-label="Filtrar fila">
        {Object.entries(FILTROS).map(([k, v]) => {
          const n = v.status ? filtradas.filter((l) => v.status!.includes(l.status)).length : filtradas.length;
          return (
            <Link
              key={k}
              href={mantemFiltros(k)}
              className={`rounded-full border px-3 py-1.5 font-semibold ${f === k ? "border-foreground bg-foreground text-background" : "border-line bg-surface"}`}
            >
              {v.n} · {n}
            </Link>
          );
        })}
      </nav>

      <Suspense>
        <FiltrosFila
          setores={unicos(todas.map((l) => l.setor))}
          maquinas={opcoesMaquinas}
          autores={unicos(todas.map((l) => l.autor))}
          encontradas={filtradas.length}
          total={todas.length}
        />
      </Suspense>

      <section className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
              <th className="px-3 py-2">Protocolo</th>
              <th className="px-3 py-2">Ideia</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Setor · máquina</th>
              <th className="px-3 py-2">Autor</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Prazo</th>
              <th className="px-3 py-2">Com quem</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((i) => {
              const s = STATUS[i.status] ?? { n: i.status, tom: "muted" as const };
              return (
                <tr key={i.id} className="border-b border-line align-top hover:bg-surface-2">
                  <td className="px-3 py-2 font-mono">
                    <Link href={`/gestor/ideias/${i.id}`} className="font-semibold text-accent hover:underline">
                      {i.protocolo}
                    </Link>
                    <span className="block text-xs text-muted">
                      {formatarData(i.criada_em)}
                      {i.versao > 1 ? ` · v${i.versao}` : ""}
                    </span>
                  </td>
                  <td className="max-w-[260px] px-3 py-2">
                    <span className="line-clamp-2">{i.texto || (i.tem_audio ? "Ideia por áudio" : "Ideia com anexos")}</span>
                    <span className="text-xs text-muted">
                      {i.anexos} anexo{i.anexos === 1 ? "" : "s"}
                      {i.tem_audio ? " · com áudio" : ""}
                      {i.nota ? ` · nota ${String(i.nota).replace(".", ",")}` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2">{nomeCategoria(i.categoria)}</td>
                  <td className="px-3 py-2">
                    {i.setor}
                    {i.maquina && <span className="block text-xs text-muted">{i.maquina}</span>}
                  </td>
                  <td className="px-3 py-2">{i.autor}</td>
                  <td className="px-3 py-2">
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${CLASSE_TOM[s.tom]}`}>{s.n}</span>
                  </td>
                  <td className={`whitespace-nowrap px-3 py-2 font-semibold ${CLASSE_SITUACAO[i.situacao] ?? ""}`}>
                    {textoPrazo(i.situacao, i.dias_restantes, i.prazo_atual)}
                  </td>
                  <td className="px-3 py-2 text-muted">{i.responsavel ?? "—"}</td>
                </tr>
              );
            })}
            {lista.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-muted">
                  {filtradas.length < todas.length ? "Nenhuma ideia nesta aba atende à busca." : "Nada nesta fila."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="font-display text-2xl font-bold">Alertas e escalonamentos · 7 dias</h2>
        <ul className="mt-2 text-sm">
          {(alertas ?? []).map((a) => (
            <li key={a.id} className="flex flex-wrap items-baseline gap-2 border-t border-line py-2 first:border-t-0">
              <span className="w-24 shrink-0 font-mono text-xs text-muted">{formatarData(a.criado_em)}</span>
              {a.tipo === "escalonamento" && <span className="rounded-full bg-bad-bg px-2 py-0.5 text-xs font-semibold text-bad">Escalado</span>}
              {a.tipo === "alerta" && <span className="rounded-full bg-warn-bg px-2 py-0.5 text-xs font-semibold text-warn">Alerta</span>}
              {a.tipo === "info" && <span className="rounded-full bg-info-bg px-2 py-0.5 text-xs font-semibold text-info">Aviso</span>}
              <Link href={`/gestor/ideias/${a.ideia_id}`} className="min-w-0 flex-1 hover:underline">
                {a.texto}
              </Link>
            </li>
          ))}
          {(alertas ?? []).length === 0 && <li className="py-2 text-muted">Nenhum alerta nos últimos 7 dias.</li>}
        </ul>
      </section>
    </div>
  );
}
