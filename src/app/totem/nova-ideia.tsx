"use client";

import { useEffect, useMemo, useState } from "react";
import { Icone } from "@/components/icone";
import { LeitorQR } from "@/components/leitor-qr";
import { Visualizador } from "@/components/visualizador";
import { lerMaquina } from "@/lib/adesivo";
import { enviarItem, ehFalhaDeRede, guardarNaFila, removerDaFila, type ItemFila } from "@/lib/fila-offline";
import { CATEGORIAS, MODOS, mmss, type Modo } from "@/lib/ideias";
import { comprimirFoto, duracaoVideo, LIMITE_ARQUIVO_BYTES, useGravador } from "@/lib/midia";
import { criarClienteNavegador } from "@/lib/supabase/client";
import type { Contexto } from "./contexto";

type Anexo = { id: string; tipo: "foto" | "video"; blob: Blob; url: string; duracao?: number };
type Audio = { blob: Blob; url: string; duracao: number };

const btnNav = "flex-1 min-h-16 rounded-2xl text-xl font-semibold";

function BotaoArquivo({
  rotulo,
  icone,
  accept,
  capture,
  multiplo,
  grande,
  desativado,
  className = "",
  aoEscolher,
}: {
  rotulo: string;
  icone: string;
  accept: string;
  capture?: boolean;
  multiplo?: boolean;
  grande: boolean;
  desativado?: boolean;
  className?: string;
  aoEscolher: (l: FileList | null) => void;
}) {
  return (
    <label
      className={`relative flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-line bg-surface-2 text-center font-semibold ${
        grande ? "min-h-36 text-xl" : "min-h-20 text-base"
      } ${desativado ? "pointer-events-none opacity-50" : ""} ${className}`}
    >
      <Icone nome={icone} tamanho={grande ? 44 : 26} />
      {rotulo}
      <input
        type="file"
        accept={accept}
        multiple={multiplo}
        // "environment" abre direto a câmera traseira no celular e no tablet.
        capture={capture ? "environment" : undefined}
        className="absolute h-px w-px opacity-0"
        onChange={(e) => {
          aoEscolher(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}

export function NovaIdeia({
  ctx,
  maquinaInicial,
  setOcupado,
  aoEnviar,
  aoGuardar,
  aoCancelar,
}: {
  ctx: Contexto;
  maquinaInicial: string | null;
  setOcupado: (b: boolean) => void;
  aoEnviar: (r: { protocolo: string; prazo: string }) => void;
  aoGuardar: () => void;
  aoCancelar: () => void;
}) {
  const maqIni = ctx.maquinas.find((m) => m.codigo === maquinaInicial) ?? null;
  const [id] = useState(() => crypto.randomUUID());
  const [passo, setPasso] = useState(1);
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [audio, setAudio] = useState<Audio | null>(null);
  const [texto, setTexto] = useState("");
  const [setorId, setSetorId] = useState<string | null>(maqIni?.setorId ?? ctx.eu.setorId ?? ctx.setores[0]?.id ?? null);
  const [maquinaId, setMaquinaId] = useState<string | null>(maqIni?.id ?? null);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [modo, setModo] = useState<Modo>("identificado");
  const [coautores, setCoautores] = useState<string[]>([]);
  const [busca, setBusca] = useState("");
  const [lendoMaquina, setLendoMaquina] = useState(false);
  const [vendo, setVendo] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const gravador = useGravador(ctx.config.audioMax);

  // Libera a memória das prévias ao sair.
  useEffect(
    () => () => {
      anexos.forEach((a) => URL.revokeObjectURL(a.url));
      if (audio) URL.revokeObjectURL(audio.url);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => setOcupado(gravador.gravando || processando || lendoMaquina), [gravador.gravando, processando, lendoMaquina, setOcupado]);

  async function adicionar(lista: FileList | null) {
    if (!lista?.length) return;
    setErro(null);
    setProcessando(true);
    const novos: Anexo[] = [];
    const problemas: string[] = [];
    for (const f of Array.from(lista)) {
      if (anexos.length + novos.length >= ctx.config.maxAnexos) {
        problemas.push(`Máximo de ${ctx.config.maxAnexos} anexos por ideia.`);
        break;
      }
      try {
        if (f.type.startsWith("image/")) {
          const blob = await comprimirFoto(f);
          novos.push({ id: crypto.randomUUID(), tipo: "foto", blob, url: URL.createObjectURL(blob) });
        } else if (f.type.startsWith("video/")) {
          if (f.size > LIMITE_ARQUIVO_BYTES) {
            problemas.push(`O vídeo "${f.name}" passa de 20 MB. Grave um vídeo mais curto.`);
            continue;
          }
          const d = await duracaoVideo(f);
          if (d > ctx.config.videoMax + 1) {
            problemas.push(`O vídeo "${f.name}" tem ${Math.round(d)} s. Envie vídeos de até ${ctx.config.videoMax} s.`);
            continue;
          }
          novos.push({ id: crypto.randomUUID(), tipo: "video", blob: f, url: URL.createObjectURL(f), duracao: d });
        } else {
          problemas.push(`"${f.name}" não é foto nem vídeo.`);
        }
      } catch (e) {
        problemas.push(e instanceof Error ? e.message : "Não foi possível abrir o arquivo.");
      }
    }
    setAnexos((a) => [...a, ...novos]);
    setErro(problemas[0] ?? null);
    setProcessando(false);
  }

  function remover(aid: string) {
    setAnexos((a) => {
      const x = a.find((y) => y.id === aid);
      if (x) URL.revokeObjectURL(x.url);
      return a.filter((y) => y.id !== aid);
    });
  }

  async function gravar() {
    if (gravador.gravando) return gravador.parar();
    const r = await gravador.iniciar();
    if (r) {
      if (audio) URL.revokeObjectURL(audio.url);
      setAudio({ blob: r.blob, duracao: r.duracao, url: URL.createObjectURL(r.blob) });
    }
  }

  function aoLerMaquina(t: string) {
    setLendoMaquina(false);
    const cod = lerMaquina(t);
    const m = cod ? ctx.maquinas.find((x) => x.codigo === cod) : null;
    if (!m) return setErro("Esta etiqueta não é de uma máquina cadastrada.");
    setErro(null);
    setSetorId(m.setorId);
    setMaquinaId(m.id);
  }

  async function enviar() {
    setErro(null);
    setProcessando(true);
    setProgresso("Preparando…");
    const sb = criarClienteNavegador();
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (!session) {
      setProcessando(false);
      setProgresso(null);
      return setErro("Sua sessão terminou. Saia e entre de novo.");
    }
    const item: ItemFila = {
      id,
      criadoEm: Date.now(),
      empresaId: ctx.eu.empresaId,
      autorNome: ctx.eu.nome,
      sessao: { access_token: session.access_token, refresh_token: session.refresh_token },
      dados: { modo, setorId: setorId!, maquinaId, categoria: categoria!, texto: texto.trim(), coautores, canal: "totem" },
      arquivos: [
        ...anexos.map((a) => ({ tipo: a.tipo, blob: a.blob, duracao: a.duracao })),
        ...(audio ? [{ tipo: "audio" as const, blob: audio.blob, duracao: audio.duracao }] : []),
      ],
      tentativas: 0,
    };
    try {
      await guardarNaFila(item);
      const r = await enviarItem(sb, item, (f, t) => setProgresso(`Enviando anexos: ${f} de ${t}`));
      await removerDaFila(id);
      aoEnviar(r);
    } catch (e) {
      if (ehFalhaDeRede(e)) {
        aoGuardar();
      } else {
        await removerDaFila(id);
        setErro((e as { message?: string })?.message ?? "Não foi possível enviar. Tente de novo.");
      }
    } finally {
      setProcessando(false);
      setProgresso(null);
    }
  }

  function avancar() {
    setErro(null);
    if (passo === 2 && !audio && !texto.trim()) return setErro("Grave um áudio ou escreva sua ideia.");
    if (passo === 3 && !setorId) return setErro("Escolha o setor.");
    if (passo === 3 && !categoria) return setErro("Escolha o tipo de melhoria.");
    if (passo < 4) return setPasso(passo + 1);
    enviar();
  }

  const maquinasDoSetor = ctx.maquinas.filter((m) => m.setorId === setorId);
  const colegasVisiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const base = q ? ctx.colegas.filter((c) => c.nome.toLowerCase().includes(q)) : ctx.colegas.filter((c) => c.setorId === ctx.eu.setorId);
    return base.slice(0, 8);
  }, [busca, ctx]);
  const nomeSetor = ctx.setores.find((s) => s.id === setorId)?.nome ?? "seu setor";

  return (
    <section className="flex flex-1 flex-col gap-4">
      <div className="flex gap-1.5" aria-label={`Passo ${passo} de 4`}>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= passo ? "bg-accent" : "bg-line"}`} />
        ))}
      </div>
      <span className="text-xs font-semibold uppercase tracking-widest text-muted">Passo {passo} de 4</span>

      {passo === 1 && (
        <>
          <h1 className="font-display text-4xl font-bold">O que você viu?</h1>
          <p className="text-lg text-muted">
            Fotos ou vídeos curtos (até {ctx.config.videoMax} s) do problema ou do local. Se não der, pule.
          </p>
          {anexos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {anexos.map((a, k) => (
                <div key={a.id} className="relative aspect-square overflow-hidden rounded-xl border border-line bg-black">
                  <button onClick={() => setVendo(k)} aria-label={`Ver anexo ${k + 1} em tela cheia`} className="h-full w-full">
                    {a.tipo === "foto" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <video src={a.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                    )}
                  </button>
                  {a.tipo === "video" && (
                    <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/65 px-1.5 text-xs text-white">▶ {mmss(a.duracao ?? 0)}</span>
                  )}
                  <button
                    onClick={() => remover(a.id)}
                    aria-label={`Remover anexo ${k + 1}`}
                    className="absolute right-1 top-1 h-9 w-9 rounded-full bg-black/65 text-xl leading-none text-white"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {anexos.length < ctx.config.maxAnexos ? (
            <>
              {/* Botões separados: no Android, um campo único "fotos ou vídeos, vários" abre só a galeria. */}
              <div className={`grid gap-2 ${anexos.length ? "grid-cols-3" : "grid-cols-2"}`}>
                <BotaoArquivo
                  rotulo="Tirar foto"
                  icone="camera"
                  accept="image/*"
                  capture
                  grande={!anexos.length}
                  aoEscolher={adicionar}
                  desativado={processando}
                />
                <BotaoArquivo
                  rotulo="Gravar vídeo"
                  icone="video"
                  accept="video/*"
                  capture
                  grande={!anexos.length}
                  aoEscolher={adicionar}
                  desativado={processando}
                />
                <BotaoArquivo
                  rotulo="Da galeria"
                  icone="galeria"
                  accept="image/*,video/*"
                  multiplo
                  grande={false}
                  aoEscolher={adicionar}
                  desativado={processando}
                  className={anexos.length ? "" : "col-span-2"}
                />
              </div>
              <p className="text-center text-sm text-muted">
                {processando ? "Processando…" : `${anexos.length} de ${ctx.config.maxAnexos} anexos`}
              </p>
            </>
          ) : (
            <p className="text-center text-muted">Limite de {ctx.config.maxAnexos} anexos atingido. Remova um para trocar.</p>
          )}
          {vendo != null && (
            <Visualizador midias={anexos.map((a) => ({ tipo: a.tipo, url: a.url }))} indice={vendo} aoFechar={() => setVendo(null)} />
          )}
        </>
      )}

      {passo === 2 && (
        <>
          <h1 className="font-display text-4xl font-bold">Conte sua ideia</h1>
          <p className="text-lg text-muted">Fale como explicaria para um colega. Até {mmss(ctx.config.audioMax)} min.</p>
          <button
            onClick={gravar}
            aria-pressed={gravador.gravando}
            className={`mx-auto grid h-36 w-36 place-items-center rounded-full bg-bad text-lg font-bold text-white ${
              gravador.gravando ? "animate-pulse" : ""
            }`}
          >
            {gravador.gravando ? (
              <span>
                Parar
                <span className="block font-mono">{mmss(gravador.segundos)}</span>
              </span>
            ) : (
              <span className="flex flex-col items-center gap-1">
                <Icone nome="microfone" tamanho={34} />
                {audio ? "Regravar" : "Gravar"}
              </span>
            )}
          </button>
          {gravador.erro && <p className="rounded-xl bg-warn-bg px-4 py-3 text-warn">{gravador.erro}</p>}
          {audio && !gravador.gravando && (
            <div className="flex items-center gap-3 rounded-xl bg-good-bg px-4 py-3 text-good">
              <span className="font-semibold">Áudio de {mmss(audio.duracao)}</span>
              <audio src={audio.url} controls className="h-10 min-w-0 flex-1" />
              <button
                onClick={() => {
                  URL.revokeObjectURL(audio.url);
                  setAudio(null);
                }}
                className="font-semibold underline"
              >
                Apagar
              </button>
            </div>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted">Ou escreva (opcional)</span>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={280}
              rows={3}
              placeholder="Ex.: a proteção da serra 2 vibra quando liga"
              className="rounded-xl border border-line bg-surface px-4 py-3 text-lg"
            />
            <span className="self-end text-xs text-muted">{texto.length}/280</span>
          </label>
        </>
      )}

      {passo === 3 && (
        <>
          <h1 className="font-display text-4xl font-bold">Onde e sobre o quê?</h1>
          <span className="text-xs font-semibold uppercase tracking-widest text-muted">Setor</span>
          <div className="grid grid-cols-2 gap-2">
            {ctx.setores.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setSetorId(s.id);
                  if (maquinaId && !ctx.maquinas.some((m) => m.id === maquinaId && m.setorId === s.id)) setMaquinaId(null);
                }}
                aria-pressed={setorId === s.id}
                className={`min-h-14 rounded-xl border-2 font-semibold ${setorId === s.id ? "border-accent bg-tint" : "border-line bg-surface-2"}`}
              >
                {s.nome}
              </button>
            ))}
          </div>
          <span className="text-xs font-semibold uppercase tracking-widest text-muted">Máquina (opcional)</span>
          {lendoMaquina ? (
            <div className="flex flex-col gap-2">
              <LeitorQR onLer={aoLerMaquina} />
              <button onClick={() => setLendoMaquina(false)} className="text-muted underline">
                Cancelar leitura
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <select
                value={maquinaId ?? ""}
                onChange={(e) => setMaquinaId(e.target.value || null)}
                className="min-h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3"
                aria-label="Máquina"
              >
                <option value="">{maquinasDoSetor.length ? "Nenhuma / não sei" : "Nenhuma máquina cadastrada no setor"}</option>
                {maquinasDoSetor.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setLendoMaquina(true)}
                className="flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface-2 px-4 font-semibold"
              >
                <Icone nome="qr" tamanho={20} />
                Ler etiqueta
              </button>
            </div>
          )}
          <span className="text-xs font-semibold uppercase tracking-widest text-muted">Tipo de melhoria</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CATEGORIAS.map((c) => (
              <button
                key={c.k}
                onClick={() => setCategoria(c.k)}
                aria-pressed={categoria === c.k}
                className={`flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-xl border-2 p-2 text-center text-sm font-semibold ${
                  categoria === c.k ? "border-accent bg-tint" : "border-line bg-surface-2"
                }`}
              >
                <Icone nome={c.icone} tamanho={30} />
                {c.n}
              </button>
            ))}
          </div>
        </>
      )}

      {passo === 4 && (
        <>
          <h1 className="font-display text-4xl font-bold">Como quer aparecer?</h1>
          <div className="flex flex-col gap-2">
            {MODOS.map((m) => (
              <button
                key={m.k}
                onClick={() => setModo(m.k)}
                aria-pressed={modo === m.k}
                className={`rounded-xl border-2 px-4 py-3 text-left ${modo === m.k ? "border-accent bg-tint" : "border-line bg-surface-2"}`}
              >
                <b className="block text-lg">{m.n}</b>
                <span className="text-sm text-muted">{m.k === "reservado" ? m.d.replace("colaborador do setor", `colaborador de ${nomeSetor}`) : m.d}</span>
              </button>
            ))}
          </div>
          <span className="text-xs font-semibold uppercase tracking-widest text-muted">Teve ajuda de colegas? (coautores)</span>
          {coautores.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {coautores.map((cid) => (
                <button
                  key={cid}
                  onClick={() => setCoautores((l) => l.filter((x) => x !== cid))}
                  className="rounded-full bg-tint px-3 py-1 font-semibold"
                  aria-label={`Remover coautor ${ctx.colegas.find((c) => c.id === cid)?.nome}`}
                >
                  {ctx.colegas.find((c) => c.id === cid)?.nome} ×
                </button>
              ))}
            </div>
          )}
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar colega pelo nome"
            className="min-h-12 rounded-xl border border-line bg-surface px-4"
            aria-label="Buscar colega"
          />
          <div className="flex flex-wrap gap-2">
            {colegasVisiveis
              .filter((c) => !coautores.includes(c.id))
              .map((c) => (
                <button key={c.id} onClick={() => setCoautores((l) => [...l, c.id])} className="rounded-full border border-line bg-surface-2 px-3 py-1.5 text-sm font-semibold">
                  + {c.nome}
                </button>
              ))}
          </div>
        </>
      )}

      {erro && <p className="rounded-xl bg-bad-bg px-4 py-3 font-semibold text-bad">{erro}</p>}
      {progresso && <p className="rounded-xl bg-info-bg px-4 py-3 font-semibold text-info">{progresso}</p>}

      <div className="mt-auto flex gap-3 pt-2">
        <button
          onClick={() => (passo === 1 ? aoCancelar() : setPasso(passo - 1))}
          disabled={processando}
          className={`${btnNav} border border-line bg-surface-2 disabled:opacity-50`}
        >
          {passo === 1 ? "Cancelar" : "Voltar"}
        </button>
        <button
          onClick={avancar}
          disabled={processando || gravador.gravando}
          className={`${btnNav} bg-signal text-signal-ink disabled:opacity-50`}
        >
          {passo === 1 && !anexos.length ? "Pular" : passo === 4 ? (processando ? "Enviando…" : "Enviar ideia") : "Próximo"}
        </button>
      </div>
    </section>
  );
}
