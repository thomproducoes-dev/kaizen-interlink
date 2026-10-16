"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Midia = { tipo: "foto" | "video"; url: string };

// Visualização em tela cheia de fotos e vídeos: setas, deslizar para o lado, teclado (← → Esc).
export function Visualizador({ midias, indice, aoFechar }: { midias: Midia[]; indice: number; aoFechar: () => void }) {
  const [atual, setAtual] = useState(indice);
  const toque = useRef<number | null>(null);
  const total = midias.length;
  const ir = useCallback((passo: number) => setAtual((a) => (a + passo + total) % total), [total]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
      if (e.key === "ArrowRight") ir(1);
      if (e.key === "ArrowLeft") ir(-1);
    };
    window.addEventListener("keydown", tecla);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", tecla);
      document.body.style.overflow = overflow;
    };
  }, [aoFechar, ir]);

  const m = midias[atual];
  if (!m) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Anexo ${atual + 1} de ${total}`}
      className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white print:hidden"
      onPointerDown={(e) => {
        toque.current = e.clientX;
      }}
      onPointerUp={(e) => {
        if (toque.current == null) return;
        const dx = e.clientX - toque.current;
        toque.current = null;
        if (Math.abs(dx) > 60 && total > 1) ir(dx < 0 ? 1 : -1);
      }}
    >
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <span className="font-semibold">
          {atual + 1} de {total}
        </span>
        <div className="flex items-center gap-2">
          <a href={m.url} target="_blank" rel="noreferrer" className="rounded-lg border border-white/30 px-3 py-1.5 text-sm font-semibold">
            Abrir original
          </a>
          <button onClick={aoFechar} aria-label="Fechar" className="grid h-11 w-11 place-items-center rounded-full bg-white/15 text-2xl leading-none">
            ×
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {m.tipo === "foto" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.url} alt={`Anexo ${atual + 1}`} className="max-h-full max-w-full select-none object-contain" draggable={false} />
        ) : (
          <video key={m.url} src={m.url} controls autoPlay playsInline className="max-h-full max-w-full" />
        )}
        {total > 1 && (
          <>
            <button
              onClick={() => ir(-1)}
              aria-label="Anterior"
              className="absolute left-2 top-1/2 grid h-14 w-14 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-3xl"
            >
              ‹
            </button>
            <button
              onClick={() => ir(1)}
              aria-label="Próximo"
              className="absolute right-2 top-1/2 grid h-14 w-14 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-3xl"
            >
              ›
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// Grade de miniaturas que abre o visualizador ao tocar.
export function Galeria({ midias, className = "grid grid-cols-3 gap-2" }: { midias: Midia[]; className?: string }) {
  const [aberto, setAberto] = useState<number | null>(null);
  if (!midias.length) return null;
  return (
    <>
      <div className={className}>
        {midias.map((m, k) => (
          <button
            key={m.url}
            onClick={() => setAberto(k)}
            aria-label={`Ver ${m.tipo === "foto" ? "foto" : "vídeo"} ${k + 1} em tela cheia`}
            className="relative aspect-square w-full overflow-hidden rounded-xl border border-line bg-black"
          >
            {m.tipo === "foto" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.url} alt="" className="h-full w-full object-cover" />
            ) : (
              <>
                <video src={m.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                <span className="absolute inset-0 grid place-items-center">
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-black/60 text-2xl text-white">▶</span>
                </span>
              </>
            )}
          </button>
        ))}
      </div>
      {aberto != null && <Visualizador midias={midias} indice={aberto} aoFechar={() => setAberto(null)} />}
    </>
  );
}
