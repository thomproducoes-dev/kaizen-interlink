"use client";

import { useEffect, useState } from "react";
import { Icone } from "@/components/icone";
import { Galeria } from "@/components/visualizador";
import { AcaoAutor } from "./acao-autor";
import { CLASSE_TOM, STATUS, formatarData, formatarDataHora, nomeCategoria } from "@/lib/ideias";
import { criarClienteNavegador } from "@/lib/supabase/client";

type Resumo = {
  id: string;
  protocolo: string;
  status: string;
  categoria: string;
  texto: string | null;
  tem_audio: boolean;
  setor: string | null;
  criada_em: string;
  atualizada_em: string;
  prazo_atual: string | null;
  sou_coautor: boolean;
  novidades: number;
};

export function Pilula({ status }: { status: string }) {
  const s = STATUS[status] ?? { n: status, tom: "muted" as const };
  return <span className={`whitespace-nowrap rounded-full px-3 py-0.5 text-sm font-semibold ${CLASSE_TOM[s.tom]}`}>{s.n}</span>;
}

export function MinhasIdeias({ aoAbrir, aoVoltar }: { aoAbrir: (id: string) => void; aoVoltar: () => void }) {
  const [lista, setLista] = useState<Resumo[] | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    criarClienteNavegador()
      .rpc("minhas_ideias")
      .then(({ data, error }) => (error ? setErro(true) : setLista(data as Resumo[])));
  }, []);

  return (
    <section className="flex flex-1 flex-col gap-4">
      <h1 className="font-display text-4xl font-bold">Minhas ideias</h1>
      {erro && <p className="rounded-xl bg-bad-bg px-4 py-3 text-bad">Não foi possível carregar. Tente de novo.</p>}
      {!lista && !erro && <p className="text-muted">Carregando…</p>}
      {lista && lista.length === 0 && <p className="py-10 text-center text-muted">Você ainda não enviou ideias. Que tal a primeira?</p>}
      <div className="flex flex-col gap-2">
        {lista?.map((i) => (
          <button key={i.id} onClick={() => aoAbrir(i.id)} className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-3 text-left hover:border-accent">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-sm">{i.protocolo}</span>
              <span className="flex items-center gap-2">
                {i.novidades > 0 && <span className="h-2.5 w-2.5 rounded-full bg-bad" title="Novidade" />}
                <Pilula status={i.status} />
              </span>
            </span>
            <span className="line-clamp-2">{i.texto || (i.tem_audio ? "Ideia por áudio" : "Ideia com anexos")}</span>
            <span className="text-sm text-muted">
              {nomeCategoria(i.categoria)} · enviada {formatarData(i.criada_em)}
              {i.sou_coautor ? " · você é coautor" : ""}
            </span>
          </button>
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

type Detalhe = {
  ideia: { protocolo: string; status: string; categoria: string; texto: string | null; prazo_atual: string | null; modo: string; setores: { nome: string } | null; maquinas: { nome: string } | null };
  eventos: { para: string; por_texto: string; nota: string | null; criado_em: string }[];
  midias: { tipo: string; url: string | null; duracao_s: number | null }[];
  mensagens: { texto: string; criada_em: string }[];
  souAutor: boolean;
};

export function DetalheIdeia({ id, euId, empresaId, aoVoltar }: { id: string; euId: string; empresaId: string; aoVoltar: () => void }) {
  const [d, setD] = useState<Detalhe | null>(null);
  const [erro, setErro] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    const sb = criarClienteNavegador();
    (async () => {
      const [ideia, eventos, midias, mensagens, selada] = await Promise.all([
        sb.from("ideias").select("protocolo, status, categoria, texto, prazo_atual, autor_id, modo, setores(nome), maquinas(nome)").eq("id", id).single(),
        sb.from("ideia_eventos").select("para, por_texto, nota, criado_em").eq("ideia_id", id).order("criado_em", { ascending: false }),
        sb.from("ideia_midias").select("tipo, caminho, duracao_s").eq("ideia_id", id).order("caminho"),
        sb.from("notificacoes").select("texto, criada_em").eq("ideia_id", id).eq("colaborador_id", euId).order("criada_em", { ascending: false }),
        sb.from("ideia_autoria_selada").select("colaborador_id").eq("ideia_id", id),
      ]);
      if (ideia.error) return setErro(true);
      const caminhos = (midias.data ?? []).map((m) => m.caminho);
      const assinadas = caminhos.length ? (await sb.storage.from("ideias").createSignedUrls(caminhos, 600)).data ?? [] : [];
      setD({
        ideia: ideia.data as unknown as Detalhe["ideia"],
        eventos: eventos.data ?? [],
        midias: (midias.data ?? []).map((m, k) => ({ tipo: m.tipo, duracao_s: m.duracao_s, url: assinadas[k]?.signedUrl ?? null })),
        mensagens: mensagens.data ?? [],
        souAutor: ideia.data.autor_id === euId || (selada.data ?? []).some((s) => s.colaborador_id === euId),
      });
      await sb.from("notificacoes").update({ lida_em: new Date().toISOString() }).eq("ideia_id", id).eq("colaborador_id", euId).is("lida_em", null);
    })();
  }, [id, euId, recarga]);

  return (
    <section className="flex flex-1 flex-col gap-4">
      {erro && <p className="rounded-xl bg-bad-bg px-4 py-3 text-bad">Não foi possível abrir esta ideia.</p>}
      {!d && !erro && <p className="text-muted">Carregando…</p>}
      {d && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-2xl font-bold text-accent">{d.ideia.protocolo}</span>
            <Pilula status={d.ideia.status} />
          </div>
          <p className="text-sm text-muted">
            {nomeCategoria(d.ideia.categoria)} · {d.ideia.setores?.nome}
            {d.ideia.maquinas ? ` · ${d.ideia.maquinas.nome}` : ""}
          </p>
          {d.ideia.texto && <p className="text-lg">{d.ideia.texto}</p>}
          <Galeria
            midias={d.midias
              .filter((m) => m.tipo !== "audio" && m.url)
              .map((m) => ({ tipo: m.tipo as "foto" | "video", url: m.url! }))}
          />
          {d.midias
            .filter((m) => m.tipo === "audio" && m.url)
            .map((m, k) => (
              <div key={k} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2">
                <Icone nome="microfone" />
                <audio src={m.url!} controls className="h-10 min-w-0 flex-1" />
              </div>
            ))}
          {d.mensagens.map((m, k) => (
            <div key={k} className="rounded-xl bg-tint px-4 py-3">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted">Mensagem · {formatarData(m.criada_em)}</span>
              <p>{m.texto}</p>
            </div>
          ))}
          {aviso && <p className="rounded-xl bg-good-bg px-4 py-3 font-semibold text-good">{aviso}</p>}
          {d.souAutor && (d.ideia.status === "aguardando_autor" || d.ideia.status === "reprovada") && (
            <AcaoAutor
              key={`${d.ideia.status}-${recarga}`}
              tipo={d.ideia.status === "aguardando_autor" ? "responder" : "reenviar"}
              ideiaId={id}
              empresaId={empresaId}
              textoAtual={d.ideia.texto ?? ""}
              anonima={d.ideia.modo === "anonimo"}
              aoConcluir={(m) => {
                setAviso(m);
                setRecarga((r) => r + 1);
              }}
            />
          )}
          <div>
            <span className="text-xs font-semibold uppercase tracking-widest text-muted">Andamento</span>
            <ul className="mt-1">
              {d.eventos.map((e, k) => (
                <li key={k} className="grid grid-cols-[88px_1fr] gap-2 border-t border-line py-2 first:border-t-0">
                  <span className="font-mono text-sm text-muted">{formatarDataHora(e.criado_em)}</span>
                  <span>
                    <b>{STATUS[e.para]?.n ?? e.para}</b>
                    {e.nota && <span className="block text-sm text-muted">{e.nota}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      <div className="mt-auto flex pt-2">
        <button onClick={aoVoltar} className="min-h-16 flex-1 rounded-2xl border border-line bg-surface-2 text-xl font-semibold">
          Voltar
        </button>
      </div>
    </section>
  );
}
