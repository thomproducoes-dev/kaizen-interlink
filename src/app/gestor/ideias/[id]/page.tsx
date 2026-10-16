import Link from "next/link";
import { notFound } from "next/navigation";
import { Galeria } from "@/components/visualizador";
import { decideTriagem, meusPapeis } from "@/lib/gestao";
import { CLASSE_SITUACAO, CLASSE_TOM, MODOS, STATUS, formatarData, formatarDataHora, mmss, nomeCategoria, textoPrazo } from "@/lib/ideias";
import { criarClienteServidor } from "@/lib/supabase/server";
import { retomar } from "./acoes";
import { PainelTriagem } from "./painel";

type Linha = {
  id: string;
  protocolo: string;
  status: string;
  categoria: string;
  setor: string;
  maquina: string | null;
  modo: string;
  autor: string;
  texto: string | null;
  versao: number;
  nota: number | null;
  criada_em: string;
  prazo_atual: string | null;
  dias_restantes: number | null;
  situacao: string;
  responsavel: string | null;
};

export default async function DetalheIdeia({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await criarClienteServidor();
  const [{ data: fila }, { data: extra }, { data: eventos }, { data: midias }, { data: coautores }, { data: empresa }, papeis] = await Promise.all([
    supabase.rpc("fila_ideias", { p_id: id }),
    supabase.from("ideias").select("canal, notas, custo_estimado, motivo_espera, revisao").eq("id", id).maybeSingle(),
    supabase.from("ideia_eventos").select("para, por_texto, nota, criado_em").eq("ideia_id", id).order("criado_em", { ascending: false }),
    supabase.from("ideia_midias").select("tipo, caminho, duracao_s, versao").eq("ideia_id", id).order("versao").order("caminho"),
    supabase.from("ideia_coautores").select("colaboradores(nome)").eq("ideia_id", id),
    supabase.from("empresas").select("config").single(),
    meusPapeis(supabase),
  ]);
  const i = ((fila ?? []) as Linha[])[0];
  if (!i) notFound();

  const caminhos = (midias ?? []).map((m) => m.caminho);
  const assinadas = caminhos.length ? (await supabase.storage.from("ideias").createSignedUrls(caminhos, 3600)).data ?? [] : [];
  const anexos = (midias ?? []).map((m, k) => ({ ...m, url: assinadas[k]?.signedUrl ?? undefined }));
  const s = STATUS[i.status] ?? { n: i.status, tom: "muted" as const };
  const nomesCoautores =
    i.modo === "identificado"
      ? ((coautores ?? []) as unknown as { colaboradores: { nome: string } | null }[]).map((c) => c.colaboradores?.nome).filter(Boolean)
      : [];
  const config = (empresa?.config ?? {}) as { teto_implantacao_direta?: number; pesos?: Record<string, number> };
  const podeDecidir = decideTriagem(papeis);

  return (
    <div className="flex flex-col gap-5">
      <Link href="/gestor/fila" className="text-sm font-semibold text-muted hover:underline">
        ← Fila de ideias
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-mono text-3xl font-bold text-accent">
          {i.protocolo}
          {i.versao > 1 && <span className="ml-2 align-middle text-base text-muted">versão {i.versao}</span>}
        </h1>
        <div className="flex items-center gap-3">
          <span className={`font-semibold ${CLASSE_SITUACAO[i.situacao] ?? ""}`}>{textoPrazo(i.situacao, i.dias_restantes, i.prazo_atual)}</span>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${CLASSE_TOM[s.tom]}`}>{s.n}</span>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <div className="flex min-w-0 flex-col gap-5">
          <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
            {i.texto ? <p className="text-lg">{i.texto}</p> : <p className="text-muted">Sem texto: ideia enviada por áudio.</p>}
            {anexos
              .filter((a) => a.tipo === "audio" && a.url)
              .map((a, k) => (
                <div key={k} className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2">
                  <span className="text-sm font-semibold">
                    Áudio{a.versao > 1 ? ` (v${a.versao})` : ""} {a.duracao_s ? mmss(a.duracao_s) : ""}
                  </span>
                  <audio src={a.url} controls className="h-10 min-w-0 flex-1" />
                </div>
              ))}
            <Galeria
              className="grid grid-cols-2 gap-3 sm:grid-cols-3"
              midias={anexos.filter((a) => a.tipo !== "audio" && a.url).map((a) => ({ tipo: a.tipo as "foto" | "video", url: a.url! }))}
            />
          </section>

          {i.status === "em_triagem" && (
            <section className="rounded-xl border-2 border-accent bg-surface p-5">
              <h2 className="font-display text-2xl font-bold">Triagem</h2>
              {podeDecidir ? (
                <div className="mt-3">
                  <PainelTriagem id={i.id} teto={config.teto_implantacao_direta ?? 1000} pesos={config.pesos ?? {}} />
                </div>
              ) : (
                <p className="mt-2 text-muted">Somente membros do comitê registram a decisão de triagem.</p>
              )}
            </section>
          )}

          {i.status === "aguardando_autor" && (
            <section className="rounded-xl border border-line bg-surface p-5">
              <h2 className="font-display text-2xl font-bold">Aguardando o autor</h2>
              <p className="mt-1 text-muted">
                A pergunta foi enviada. O autor responde pelo totem até {formatarData(i.prazo_atual)}. O prazo da triagem está pausado.
              </p>
            </section>
          )}

          {i.status === "em_espera" && (
            <section className="rounded-xl border border-line bg-surface p-5">
              <h2 className="font-display text-2xl font-bold">Em espera</h2>
              <p className="mt-1 text-muted">
                {extra?.motivo_espera}. Volta sozinha para análise em {formatarData(extra?.revisao)}.
              </p>
              {podeDecidir && (
                <form action={retomar} className="mt-3">
                  <input type="hidden" name="id" value={i.id} />
                  <button className="rounded-lg border border-line px-4 py-2 font-semibold">Retomar agora</button>
                </form>
              )}
            </section>
          )}

          {["em_viabilidade", "aprovada", "em_implantacao", "padronizando"].includes(i.status) && (
            <section className="rounded-xl border border-dashed border-line bg-surface p-5 text-muted">
              Viabilidade econômica, implantação e padronização chegam na Entrega 4.
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 rounded-xl border border-line bg-surface p-5 text-sm">
            <dt className="text-muted">Autor</dt>
            <dd>
              {i.autor}
              <span className="block text-xs text-muted">{MODOS.find((m) => m.k === i.modo)?.n}</span>
            </dd>
            {nomesCoautores.length > 0 && (
              <>
                <dt className="text-muted">Coautores</dt>
                <dd>{nomesCoautores.join(", ")}</dd>
              </>
            )}
            <dt className="text-muted">Tipo</dt>
            <dd>{nomeCategoria(i.categoria)}</dd>
            <dt className="text-muted">Setor</dt>
            <dd>{i.setor}</dd>
            {i.maquina && (
              <>
                <dt className="text-muted">Máquina</dt>
                <dd>{i.maquina}</dd>
              </>
            )}
            <dt className="text-muted">Recebida</dt>
            <dd>
              {formatarDataHora(i.criada_em)}
              {extra?.canal ? ` pelo ${extra.canal}` : ""}
            </dd>
            {i.nota != null && (
              <>
                <dt className="text-muted">Nota</dt>
                <dd>
                  <b>{String(i.nota).replace(".", ",")}</b> de 5
                </dd>
              </>
            )}
            {extra?.custo_estimado != null && (
              <>
                <dt className="text-muted">Custo estimado</dt>
                <dd>{Number(extra.custo_estimado).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</dd>
              </>
            )}
            <dt className="text-muted">Com quem</dt>
            <dd>{i.responsavel ?? "—"}</dd>
          </dl>
          <section className="rounded-xl border border-line bg-surface p-5">
            <h2 className="font-display text-xl font-bold">Histórico</h2>
            <ul className="mt-2 text-sm">
              {(eventos ?? []).map((e, k) => (
                <li key={k} className="border-t border-line py-2 first:border-t-0">
                  <span className="font-mono text-xs text-muted">{formatarDataHora(e.criado_em)}</span> · <b>{STATUS[e.para]?.n ?? e.para}</b> · {e.por_texto}
                  {e.nota && <span className="block text-muted">{e.nota}</span>}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
