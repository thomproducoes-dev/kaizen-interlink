"use client";

import { useState } from "react";
import { Icone } from "@/components/icone";
import { mmss } from "@/lib/ideias";
import { comprimirFoto, extensao, tipoBase, useGravador } from "@/lib/midia";
import { criarClienteNavegador } from "@/lib/supabase/client";

// Ações do autor no totem (Fase 0, seção 8):
// - "responder": responde ao pedido de informação do comitê (texto e/ou áudio);
// - "reenviar": ajusta uma ideia reprovada e reenvia como nova versão, com o mesmo protocolo.
export function AcaoAutor({
  tipo,
  ideiaId,
  empresaId,
  textoAtual,
  aoConcluir,
  anonima = false,
}: {
  tipo: "responder" | "reenviar";
  ideiaId: string;
  empresaId: string;
  textoAtual: string;
  aoConcluir: (mensagem: string) => void;
  anonima?: boolean;
}) {
  const [texto, setTexto] = useState(tipo === "reenviar" ? textoAtual : "");
  const [audio, setAudio] = useState<{ blob: Blob; url: string; duracao: number } | null>(null);
  const [fotos, setFotos] = useState<{ blob: Blob; url: string }[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const gravador = useGravador(120);
  const limite = tipo === "responder" ? 500 : 280;

  async function gravar() {
    if (gravador.gravando) return gravador.parar();
    const r = await gravador.iniciar();
    if (r) setAudio({ blob: r.blob, duracao: r.duracao, url: URL.createObjectURL(r.blob) });
  }

  async function adicionarFotos(lista: FileList | null) {
    for (const f of Array.from(lista ?? []).slice(0, 6 - fotos.length)) {
      if (!f.type.startsWith("image/")) continue;
      const blob = await comprimirFoto(f);
      setFotos((l) => [...l, { blob, url: URL.createObjectURL(blob) }]);
    }
  }

  async function enviar() {
    setErro(null);
    if (!texto.trim() && !audio) return setErro(tipo === "responder" ? "Escreva ou grave sua resposta." : "Escreva ou grave a nova versão da ideia.");
    setEnviando(true);
    try {
      const sb = criarClienteNavegador();
      const arquivos = [
        ...(audio ? [{ tipo: "audio", blob: audio.blob, duracao: audio.duracao }] : []),
        ...fotos.map((f) => ({ tipo: "foto", blob: f.blob, duracao: undefined as number | undefined })),
      ];
      const midias = [];
      const marca = Date.now();
      for (let k = 0; k < arquivos.length; k++) {
        const a = arquivos[k];
        const mime = tipoBase(a.blob.type) || (a.tipo === "audio" ? "audio/webm" : "image/jpeg");
        const caminho = `${empresaId}/${ideiaId}/r${marca}-${k + 1}-${a.tipo}.${extensao(mime)}`;
        const { error } = await sb.storage.from("ideias").upload(caminho, a.blob, { contentType: mime });
        if (error) throw new Error("Não foi possível enviar o anexo. Verifique a internet e tente de novo.");
        midias.push({ caminho, tipo: a.tipo, duracao_s: a.duracao ?? null, tamanho: a.blob.size });
      }
      const { error } =
        tipo === "responder"
          ? await sb.rpc("responder_pedido", { p_ideia: ideiaId, p_texto: texto, p_midias: midias })
          : await sb.rpc("reenviar_ideia", { p_ideia: ideiaId, p_texto: texto, p_midias: midias });
      if (error) throw new Error(error.message);
      aoConcluir(tipo === "responder" ? "Resposta enviada. O comitê retoma a análise." : "Nova versão enviada. O comitê vai analisar de novo.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível enviar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border-2 border-signal bg-surface p-4">
      <h2 className="font-display text-2xl font-bold">{tipo === "responder" ? "Responder ao comitê" : "Ajustar e reenviar"}</h2>
      {anonima && (
        <p className="rounded-xl bg-warn-bg px-4 py-3 text-sm font-semibold text-warn">
          Sua ideia é anônima: prefira escrever. Sua voz em áudio pode ser reconhecida pelos colegas.
        </p>
      )}
      <button
        onClick={gravar}
        className={`flex min-h-16 items-center justify-center gap-3 rounded-2xl bg-bad text-lg font-bold text-white ${gravador.gravando ? "animate-pulse" : ""}`}
      >
        <Icone nome="microfone" tamanho={26} />
        {gravador.gravando ? `Parar · ${mmss(gravador.segundos)}` : audio ? "Regravar áudio" : "Gravar áudio"}
      </button>
      {gravador.erro && <p className="text-sm text-warn">{gravador.erro}</p>}
      {audio && !gravador.gravando && <audio src={audio.url} controls className="w-full" />}
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        maxLength={limite}
        rows={3}
        placeholder={tipo === "responder" ? "Ou escreva sua resposta" : "Texto da ideia (ajuste o que for preciso)"}
        className="rounded-xl border border-line bg-surface px-4 py-3 text-lg"
      />
      {tipo === "reenviar" && (
        <>
          {fotos.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {fotos.map((f, k) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={k} src={f.url} alt={`Foto nova ${k + 1}`} className="aspect-square w-full rounded-lg object-cover" />
              ))}
            </div>
          )}
          <label className="relative flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-surface-2 font-semibold">
            <Icone nome="camera" /> Adicionar fotos novas
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="absolute h-px w-px opacity-0"
              onChange={(e) => {
                adicionarFotos(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </>
      )}
      {erro && <p className="rounded-xl bg-bad-bg px-4 py-3 font-semibold text-bad">{erro}</p>}
      <button
        onClick={enviar}
        disabled={enviando || gravador.gravando}
        className="min-h-16 rounded-2xl bg-signal text-xl font-semibold text-signal-ink disabled:opacity-50"
      >
        {enviando ? "Enviando…" : tipo === "responder" ? "Enviar resposta" : "Reenviar ideia"}
      </button>
    </section>
  );
}
