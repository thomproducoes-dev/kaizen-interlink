"use client";

import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { Icone } from "./icone";

// Assistente de impressão das etiquetas QR (adesivos de pessoas e etiquetas de máquinas):
// 1) tamanho da etiqueta, 2) o que imprimir e quantas cópias, 3) prévia das folhas A4, 4) imprimir.
// Também salva cada etiqueta como imagem PNG (300 dpi) ou todas num ZIP.

export type ItemEtiqueta = {
  id: string;
  grupo: string; // setor, para filtrar
  cabecalho: string;
  titulo: string;
  subtitulo?: string;
  detalhe?: string;
  rodape: string;
  qr: string; // conteúdo do QR
  arquivo: string; // nome do PNG, sem extensão
};

const MODELOS = [
  { k: "6x4", n: "Padrão", w: 60, h: 40 },
  { k: "5x3", n: "Pequena", w: 50, h: 30 },
  { k: "9x6", n: "Grande", w: 90, h: 60 },
] as const;

// Folha A4 com margem de 10 mm e 3 mm entre etiquetas.
const A4 = { w: 210, h: 297, margem: 10, espaco: 3 };
function porFolha(w: number, h: number) {
  const cols = Math.floor((A4.w - 2 * A4.margem + A4.espaco) / (w + A4.espaco));
  const linhas = Math.floor((A4.h - 2 * A4.margem + A4.espaco) / (h + A4.espaco));
  return { cols, linhas, total: cols * linhas };
}

function Etiqueta({ item, svg, w, h, corte }: { item: ItemEtiqueta; svg: string; w: number; h: number; corte: boolean }) {
  const qr = h * 0.86;
  return (
    <div
      className="flex items-center overflow-hidden bg-white text-black"
      style={{
        width: `${w}mm`,
        height: `${h}mm`,
        padding: `${h * 0.05}mm`,
        gap: `${h * 0.05}mm`,
        outline: corte ? "0.2mm dashed #888" : "none",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <div className="shrink-0 [&_svg]:h-full [&_svg]:w-full" style={{ width: `${qr}mm`, height: `${qr}mm` }} dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="flex min-w-0 flex-col" style={{ lineHeight: 1.15, gap: `${h * 0.012}mm` }}>
        <span style={{ fontSize: `${h * 0.055}mm`, letterSpacing: "0.04em" }} className="font-semibold uppercase">
          {item.cabecalho}
        </span>
        <span style={{ fontSize: `${h * 0.085}mm` }} className="break-words font-bold">
          {item.titulo}
        </span>
        {item.subtitulo && (
          <span style={{ fontSize: `${h * 0.062}mm`, fontFamily: "monospace" }}>{item.subtitulo}</span>
        )}
        {item.detalhe && <span style={{ fontSize: `${h * 0.062}mm` }}>{item.detalhe}</span>}
        <span style={{ fontSize: `${h * 0.047}mm`, marginTop: `${h * 0.03}mm` }}>{item.rodape}</span>
      </div>
    </div>
  );
}

// Desenha a etiqueta num canvas a 300 dpi para salvar como PNG.
async function gerarPng(item: ItemEtiqueta, w: number, h: number): Promise<Blob> {
  const px = (mm: number) => Math.round((mm / 25.4) * 300);
  const canvas = document.createElement("canvas");
  canvas.width = px(w);
  canvas.height = px(h);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const pad = px(h * 0.05);
  const lado = px(h * 0.86);
  const qrCanvas = document.createElement("canvas");
  await QRCode.toCanvas(qrCanvas, item.qr, { width: lado, margin: 1, errorCorrectionLevel: "M" });
  ctx.drawImage(qrCanvas, pad, Math.round((canvas.height - lado) / 2), lado, lado);

  const x = pad + lado + pad;
  const larg = canvas.width - x - pad;
  ctx.fillStyle = "#000";
  ctx.textBaseline = "top";
  const linhas: { t: string; mm: number; peso: string; fonte?: string }[] = [
    { t: item.cabecalho.toUpperCase(), mm: h * 0.055, peso: "600" },
    { t: item.titulo, mm: h * 0.085, peso: "700" },
    ...(item.subtitulo ? [{ t: item.subtitulo, mm: h * 0.062, peso: "400", fonte: "monospace" }] : []),
    ...(item.detalhe ? [{ t: item.detalhe, mm: h * 0.062, peso: "400" }] : []),
    { t: item.rodape, mm: h * 0.047, peso: "400" },
  ];
  // Quebra cada texto em linhas que caibam na largura disponível.
  const blocos = linhas.map((l) => {
    const tam = px(l.mm);
    ctx.font = `${l.peso} ${tam}px ${l.fonte ?? "Arial, Helvetica, sans-serif"}`;
    const partes: string[] = [];
    let atual = "";
    for (const palavra of l.t.split(" ")) {
      const teste = atual ? `${atual} ${palavra}` : palavra;
      if (ctx.measureText(teste).width > larg && atual) {
        partes.push(atual);
        atual = palavra;
      } else atual = teste;
    }
    partes.push(atual);
    return { ...l, tam, partes };
  });
  const alturaTotal = blocos.reduce((a, b) => a + b.partes.length * b.tam * 1.15, 0) + px(h * 0.03);
  let y = Math.max(pad, (canvas.height - alturaTotal) / 2);
  blocos.forEach((b, i) => {
    if (i === blocos.length - 1) y += px(h * 0.03);
    ctx.font = `${b.peso} ${b.tam}px ${b.fonte ?? "Arial, Helvetica, sans-serif"}`;
    b.partes.forEach((p) => {
      ctx.fillText(p, x, y, larg);
      y += b.tam * 1.15;
    });
  });

  return new Promise((ok, falha) => canvas.toBlob((bl) => (bl ? ok(bl) : falha(new Error("Falha ao gerar imagem."))), "image/png"));
}

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function AssistenteEtiquetas({ itens, titulo, descricao, vazio }: { itens: ItemEtiqueta[]; titulo: string; descricao: string; vazio: string }) {
  const [modeloK, setModeloK] = useState<(typeof MODELOS)[number]["k"]>("6x4");
  const [grupo, setGrupo] = useState<string | null>(null);
  const [copias, setCopias] = useState<Record<string, number>>(() => Object.fromEntries(itens.map((i) => [i.id, 1])));
  const [corte, setCorte] = useState(true);
  const [svgs, setSvgs] = useState<Record<string, string>>({});
  const [baixando, setBaixando] = useState<string | null>(null);

  const modelo = MODELOS.find((m) => m.k === modeloK)!;
  const grade = porFolha(modelo.w, modelo.h);
  const grupos = useMemo(() => Array.from(new Set(itens.map((i) => i.grupo).filter(Boolean))).sort(), [itens]);
  const visiveis = itens.filter((i) => !grupo || i.grupo === grupo);

  useEffect(() => {
    let vivo = true;
    Promise.all(itens.map(async (i) => [i.id, await QRCode.toString(i.qr, { type: "svg", margin: 1, errorCorrectionLevel: "M" })] as const)).then(
      (pares) => vivo && setSvgs(Object.fromEntries(pares)),
    );
    return () => {
      vivo = false;
    };
  }, [itens]);

  // Lista final na ordem de impressão, repetindo conforme as cópias.
  const fila = visiveis.flatMap((i) => Array.from({ length: copias[i.id] ?? 0 }, () => i));
  const folhas: ItemEtiqueta[][] = [];
  for (let k = 0; k < fila.length; k += grade.total) folhas.push(fila.slice(k, k + grade.total));
  const selecionados = visiveis.filter((i) => (copias[i.id] ?? 0) > 0);

  function alterar(id: string, v: number) {
    setCopias((c) => ({ ...c, [id]: Math.max(0, Math.min(20, v)) }));
  }

  async function salvarUma(i: ItemEtiqueta) {
    setBaixando(i.id);
    try {
      baixar(await gerarPng(i, modelo.w, modelo.h), `${i.arquivo}.png`);
    } finally {
      setBaixando(null);
    }
  }

  async function salvarTodas() {
    setBaixando("todas");
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const i of selecionados) zip.file(`${i.arquivo}.png`, await gerarPng(i, modelo.w, modelo.h));
      baixar(await zip.generateAsync({ type: "blob" }), `${titulo.toLowerCase().replace(/\s+/g, "-")}.zip`);
    } finally {
      setBaixando(null);
    }
  }

  if (!itens.length) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-4xl font-bold">{titulo}</h1>
        <p className="rounded-xl border border-line bg-surface p-10 text-center text-muted">{vazio}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="print:hidden">
        <h1 className="font-display text-4xl font-bold">{titulo}</h1>
        <p className="text-muted">{descricao}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* Painel do assistente */}
        <aside className="flex flex-col gap-4 print:hidden lg:sticky lg:top-20 lg:self-start">
          <section className="rounded-xl border border-line bg-surface p-4">
            <h2 className="font-display text-xl font-bold">1. Tamanho da etiqueta</h2>
            <div className="mt-2 flex flex-col gap-2">
              {MODELOS.map((m) => {
                const g = porFolha(m.w, m.h);
                return (
                  <button
                    key={m.k}
                    onClick={() => setModeloK(m.k)}
                    aria-pressed={modeloK === m.k}
                    className={`flex items-center justify-between rounded-lg border-2 px-3 py-2 text-left text-sm ${
                      modeloK === m.k ? "border-accent bg-tint" : "border-line"
                    }`}
                  >
                    <span>
                      <b>{m.n}</b> · {m.w / 10} × {m.h / 10} cm
                    </span>
                    <span className="text-muted">{g.total} por folha A4</span>
                  </button>
                );
              })}
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={corte} onChange={(e) => setCorte(e.target.checked)} className="h-4 w-4" />
              Mostrar linhas de corte
            </label>
          </section>

          <section className="rounded-xl border border-line bg-surface p-4">
            <h2 className="font-display text-xl font-bold">2. O que imprimir</h2>
            {grupos.length > 1 && (
              <div className="mt-2 flex flex-wrap gap-1.5 text-sm">
                <button onClick={() => setGrupo(null)} className={`rounded-lg border px-2.5 py-1 font-semibold ${!grupo ? "border-accent bg-tint" : "border-line"}`}>
                  Todos
                </button>
                {grupos.map((g) => (
                  <button key={g} onClick={() => setGrupo(g)} className={`rounded-lg border px-2.5 py-1 font-semibold ${grupo === g ? "border-accent bg-tint" : "border-line"}`}>
                    {g}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-2 flex gap-3 text-sm">
              <button className="font-semibold text-accent underline" onClick={() => setCopias((c) => ({ ...c, ...Object.fromEntries(visiveis.map((i) => [i.id, 1])) }))}>
                Marcar todos
              </button>
              <button className="font-semibold text-accent underline" onClick={() => setCopias((c) => ({ ...c, ...Object.fromEntries(visiveis.map((i) => [i.id, 0])) }))}>
                Desmarcar todos
              </button>
            </div>
            <ul className="mt-2 max-h-80 overflow-y-auto pr-1 text-sm">
              {visiveis.map((i) => (
                <li key={i.id} className="flex items-center gap-2 border-t border-line py-2 first:border-t-0">
                  <input
                    type="checkbox"
                    checked={(copias[i.id] ?? 0) > 0}
                    onChange={(e) => alterar(i.id, e.target.checked ? 1 : 0)}
                    aria-label={`Imprimir ${i.titulo}`}
                    className="h-4 w-4 shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{i.titulo}</span>
                    <span className="block truncate text-xs text-muted">{[i.subtitulo, i.grupo].filter(Boolean).join(" · ")}</span>
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={copias[i.id] ?? 0}
                    onChange={(e) => alterar(i.id, Number(e.target.value))}
                    aria-label={`Cópias de ${i.titulo}`}
                    className="w-14 rounded-md border border-line bg-surface px-2 py-1"
                  />
                  <button
                    onClick={() => salvarUma(i)}
                    disabled={!!baixando}
                    title="Salvar etiqueta como imagem"
                    aria-label={`Salvar imagem de ${i.titulo}`}
                    className="grid h-8 w-8 place-items-center rounded-md border border-line disabled:opacity-40"
                  >
                    <Icone nome="download" tamanho={16} />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-line bg-surface p-4">
            <h2 className="font-display text-xl font-bold">3. Imprimir ou salvar</h2>
            <p className="mt-1 text-sm text-muted">
              {fila.length} etiqueta{fila.length === 1 ? "" : "s"} em {folhas.length} folha{folhas.length === 1 ? "" : "s"} A4.
            </p>
            <p className="mt-1 text-xs text-muted">Na janela de impressão, use escala 100% (“Tamanho real”) e margens “Nenhuma”.</p>
            <div className="mt-3 flex flex-col gap-2">
              <button onClick={() => window.print()} disabled={!fila.length} className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-ink disabled:opacity-40">
                Imprimir
              </button>
              <button
                onClick={salvarTodas}
                disabled={!selecionados.length || !!baixando}
                className="rounded-lg border border-line px-4 py-2 font-semibold disabled:opacity-40"
              >
                {baixando === "todas" ? "Gerando…" : `Salvar imagens (${selecionados.length}) em ZIP`}
              </button>
            </div>
          </section>
        </aside>

        {/* Prévia das folhas, exatamente como serão impressas */}
        <section className="min-w-0">
          <p className="mb-2 text-sm font-semibold text-muted print:hidden">Prévia da impressão</p>
          <div className="folhas flex flex-col items-center gap-6 overflow-x-auto rounded-xl bg-surface-2 p-4 print:block print:overflow-visible print:bg-white print:p-0">
            {folhas.length === 0 && <p className="py-16 text-muted">Marque ao menos uma etiqueta.</p>}
            {folhas.map((folha, k) => (
              <div
                key={k}
                className="folha shrink-0 bg-white shadow-lg print:shadow-none"
                style={{
                  width: `${A4.w}mm`,
                  height: `${A4.h}mm`,
                  padding: `${A4.margem}mm`,
                  display: "grid",
                  gridTemplateColumns: `repeat(${grade.cols}, ${modelo.w}mm)`,
                  gridAutoRows: `${modelo.h}mm`,
                  gap: `${A4.espaco}mm`,
                  alignContent: "start",
                }}
              >
                {folha.map((i, j) => (
                  <Etiqueta key={`${i.id}-${j}`} item={i} svg={svgs[i.id] ?? ""} w={modelo.w} h={modelo.h} corte={corte} />
                ))}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
