import Link from "next/link";
import { notFound } from "next/navigation";
import { Galeria } from "@/components/visualizador";
import { CLASSE_TOM, MODOS, STATUS, formatarData, formatarDataHora, mmss, nomeCategoria, rotuloAutor } from "@/lib/ideias";
import { criarClienteServidor } from "@/lib/supabase/server";

type Ideia = {
  protocolo: string;
  status: string;
  categoria: string;
  modo: string;
  texto: string | null;
  canal: string;
  criada_em: string;
  prazo_atual: string | null;
  setores: { nome: string } | null;
  maquinas: { nome: string } | null;
  autor: { nome: string } | null;
};

export default async function DetalheIdeia({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await criarClienteServidor();
  const [{ data: ideia }, { data: eventos }, { data: midias }, { data: coautores }] = await Promise.all([
    supabase
      .from("ideias")
      .select("protocolo, status, categoria, modo, texto, canal, criada_em, prazo_atual, setores(nome), maquinas(nome), autor:colaboradores!ideias_autor_id_fkey(nome)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("ideia_eventos").select("para, por_texto, nota, criado_em").eq("ideia_id", id).order("criado_em", { ascending: false }),
    supabase.from("ideia_midias").select("tipo, caminho, duracao_s").eq("ideia_id", id).order("caminho"),
    supabase.from("ideia_coautores").select("colaboradores(nome)").eq("ideia_id", id),
  ]);
  if (!ideia) notFound();
  const i = ideia as unknown as Ideia;

  const caminhos = (midias ?? []).map((m) => m.caminho);
  const assinadas = caminhos.length ? (await supabase.storage.from("ideias").createSignedUrls(caminhos, 3600)).data ?? [] : [];
  const anexos = (midias ?? []).map((m, k) => ({ ...m, url: assinadas[k]?.signedUrl ?? undefined }));
  const s = STATUS[i.status] ?? { n: i.status, tom: "muted" as const };
  const nomesCoautores = ((coautores ?? []) as unknown as { colaboradores: { nome: string } | null }[])
    .map((c) => c.colaboradores?.nome)
    .filter(Boolean);

  return (
    <div className="flex flex-col gap-5">
      <Link href="/gestor/ideias" className="text-sm font-semibold text-muted hover:underline">
        ← Ideias recebidas
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-mono text-3xl font-bold text-accent">{i.protocolo}</h1>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${CLASSE_TOM[s.tom]}`}>{s.n}</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <section className="flex min-w-0 flex-col gap-4 rounded-xl border border-line bg-surface p-5">
          {i.texto ? <p className="text-lg">{i.texto}</p> : <p className="text-muted">Sem texto: ideia enviada por áudio.</p>}
          {anexos
            .filter((a) => a.tipo === "audio" && a.url)
            .map((a, k) => (
              <div key={k} className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2">
                <span className="text-sm font-semibold">Áudio {a.duracao_s ? mmss(a.duracao_s) : ""}</span>
                <audio src={a.url} controls className="h-10 min-w-0 flex-1" />
              </div>
            ))}
          <Galeria
            className="grid grid-cols-2 gap-3 sm:grid-cols-3"
            midias={anexos.filter((a) => a.tipo !== "audio" && a.url).map((a) => ({ tipo: a.tipo as "foto" | "video", url: a.url! }))}
          />
        </section>

        <aside className="flex flex-col gap-4">
          <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 rounded-xl border border-line bg-surface p-5 text-sm">
            <dt className="text-muted">Autor</dt>
            <dd>
              {rotuloAutor(i)}
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
            <dd>{i.setores?.nome}</dd>
            {i.maquinas && (
              <>
                <dt className="text-muted">Máquina</dt>
                <dd>{i.maquinas.nome}</dd>
              </>
            )}
            <dt className="text-muted">Recebida</dt>
            <dd>
              {formatarDataHora(i.criada_em)} pelo {i.canal}
            </dd>
            <dt className="text-muted">Prazo triagem</dt>
            <dd>{formatarData(i.prazo_atual)}</dd>
          </dl>
          <section className="rounded-xl border border-line bg-surface p-5">
            <h2 className="font-display text-xl font-bold">Histórico</h2>
            <ul className="mt-2 text-sm">
              {(eventos ?? []).map((e, k) => (
                <li key={k} className="border-t border-line py-2 first:border-t-0">
                  <span className="font-mono text-xs text-muted">{formatarDataHora(e.criado_em)}</span> ·{" "}
                  <b>{STATUS[e.para]?.n ?? e.para}</b> · {e.por_texto}
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
