"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Midia = { tipo: "foto" | "video"; url: string };

const ZOOM_MIN = 1;
const ZOOM_MAX = 6;
const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

type Ponto = { x: number; y: number };

// Visualização em tela cheia de fotos e vídeos: setas, deslizar para o lado, teclado (← → Esc).
// Fotos: girar de 90 em 90 graus (R), zoom por botões, roda do mouse, pinça ou toque duplo (+ − 0),
// e arrastar para mover quando ampliada.
export function Visualizador({ midias, indice, aoFechar }: { midias: Midia[]; indice: number; aoFechar: () => void }) {
  const [atual, setAtual] = useState(indice);
  const [giro, setGiro] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [desloc, setDesloc] = useState<Ponto>({ x: 0, y: 0 });
  const [palco, setPalco] = useState({ w: 0, h: 0 });
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [arrastando, setArrastando] = useState(false);
  const palcoRef = useRef<HTMLDivElement>(null);
  const ponteiros = useRef(new Map<number, Ponto>());
  const gesto = useRef<{ inicio: Ponto; moveu: boolean; pinca: { dist: number; zoom: number } | null; ultimoToque: number }>({
    inicio: { x: 0, y: 0 },
    moveu: false,
    pinca: null,
    ultimoToque: 0,
  });
  const total = midias.length;
  const m = midias[atual];

  const ir = useCallback(
    (passo: number) => {
      setAtual((a) => (a + passo + total) % total);
      setGiro(0);
      setZoom(1);
      setDesloc({ x: 0, y: 0 });
      setNatural({ w: 0, h: 0 });
    },
    [total],
  );

  // Tamanho da foto na tela com zoom 1: cabe inteira no palco já considerando o giro.
  const deitada = giro % 180 !== 0;
  const nw = deitada ? natural.h : natural.w;
  const nh = deitada ? natural.w : natural.h;
  const base = nw && nh && palco.w && palco.h ? Math.min(palco.w / nw, palco.h / nh, 1) : 0;
  const tela = { w: nw * base, h: nh * base };

  // Não deixa a foto ampliada sair do palco ao arrastar.
  const prender = useCallback(
    (p: Ponto, z: number): Ponto => {
      const mx = Math.max(0, (tela.w * z - palco.w) / 2);
      const my = Math.max(0, (tela.h * z - palco.h) / 2);
      return { x: limitar(p.x, -mx, mx), y: limitar(p.y, -my, my) };
    },
    [tela.w, tela.h, palco.w, palco.h],
  );

  // Zoom mantendo parado o ponto indicado (cursor ou centro da pinça), relativo ao centro do palco.
  const aplicarZoom = useCallback(
    (novo: number, foco: Ponto = { x: 0, y: 0 }) => {
      const z2 = limitar(novo, ZOOM_MIN, ZOOM_MAX);
      setDesloc((d) => prender({ x: foco.x - (foco.x - d.x) * (z2 / zoom), y: foco.y - (foco.y - d.y) * (z2 / zoom) }, z2));
      setZoom(z2);
    },
    [prender, zoom],
  );

  const girar = useCallback((passo: number) => {
    setGiro((g) => (g + passo + 360) % 360);
    setZoom(1);
    setDesloc({ x: 0, y: 0 });
  }, []);

  const ajustar = useCallback(() => {
    setZoom(1);
    setDesloc({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
      if (e.key === "ArrowRight") ir(1);
      if (e.key === "ArrowLeft") ir(-1);
      if (m?.tipo !== "foto") return;
      if (e.key === "r" || e.key === "R") girar(e.shiftKey ? -90 : 90);
      if (e.key === "+" || e.key === "=") aplicarZoom(zoom * 1.5);
      if (e.key === "-") aplicarZoom(zoom / 1.5);
      if (e.key === "0") ajustar();
    };
    window.addEventListener("keydown", tecla);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", tecla);
      document.body.style.overflow = overflow;
    };
  }, [aoFechar, ir, girar, aplicarZoom, ajustar, zoom, m?.tipo]);

  // Acompanha o tamanho do palco (girar o celular, redimensionar a janela).
  useEffect(() => {
    const el = palcoRef.current;
    if (!el) return;
    const medir = () => setPalco({ w: el.clientWidth, h: el.clientHeight });
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!m) return null;
  const foto = m.tipo === "foto";

  const relativo = (e: { clientX: number; clientY: number }): Ponto => {
    const r = palcoRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
  };

  function aoTocar(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("button, a, video")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    ponteiros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setArrastando(true);
    if (ponteiros.current.size === 1) {
      gesto.current.inicio = { x: e.clientX, y: e.clientY };
      gesto.current.moveu = false;
    }
    if (ponteiros.current.size === 2 && foto) {
      const [a, b] = [...ponteiros.current.values()];
      gesto.current.pinca = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
      gesto.current.moveu = true;
    }
  }

  function aoMover(e: React.PointerEvent) {
    const anterior = ponteiros.current.get(e.pointerId);
    if (!anterior) return;
    ponteiros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (Math.hypot(e.clientX - gesto.current.inicio.x, e.clientY - gesto.current.inicio.y) > 8) gesto.current.moveu = true;
    const p = gesto.current.pinca;
    if (p && ponteiros.current.size >= 2) {
      const [a, b] = [...ponteiros.current.values()];
      aplicarZoom(p.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / p.dist), relativo({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 }));
      return;
    }
    if (foto && zoom > 1) {
      setDesloc((d) => prender({ x: d.x + e.clientX - anterior.x, y: d.y + e.clientY - anterior.y }, zoom));
    }
  }

  function aoSoltar(e: React.PointerEvent) {
    if (!ponteiros.current.has(e.pointerId)) return;
    ponteiros.current.delete(e.pointerId);
    if (ponteiros.current.size > 0) return;
    setArrastando(false);
    const g = gesto.current;
    const pinca = g.pinca;
    g.pinca = null;
    if (pinca) return;
    const dx = e.clientX - g.inicio.x;
    // Deslizar troca de anexo só quando a foto não está ampliada.
    if (zoom === 1 && Math.abs(dx) > 60 && total > 1) return ir(dx < 0 ? 1 : -1);
    // Toque duplo: aproxima no ponto tocado, ou volta ao tamanho normal.
    if (foto && !g.moveu) {
      const agora = Date.now();
      if (agora - g.ultimoToque < 300) {
        g.ultimoToque = 0;
        if (zoom > 1) ajustar();
        else aplicarZoom(2.5, relativo(e));
      } else g.ultimoToque = agora;
    }
  }

  const botao = "grid h-11 min-w-11 place-items-center rounded-full bg-white/15 px-3 text-lg font-semibold disabled:opacity-40";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Anexo ${atual + 1} de ${total}`}
      className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white print:hidden"
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

      <div
        ref={palcoRef}
        className="relative min-h-0 flex-1 touch-none overflow-hidden"
        onPointerDown={aoTocar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
        onWheel={(e) => foto && aplicarZoom(zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2), relativo(e))}
      >
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={m.url}
            src={m.url}
            alt={`Anexo ${atual + 1}`}
            draggable={false}
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            className={`absolute left-1/2 top-1/2 max-w-none select-none ${base ? "" : "invisible"} ${zoom > 1 ? "cursor-grab" : ""}`}
            style={{
              width: natural.w * base || undefined,
              height: natural.h * base || undefined,
              transform: `translate(-50%, -50%) translate(${desloc.x}px, ${desloc.y}px) rotate(${giro}deg) scale(${zoom})`,
              transition: arrastando ? "none" : "transform 150ms ease-out",
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-2">
            <video key={m.url} src={m.url} controls autoPlay playsInline className="max-h-full max-w-full" />
          </div>
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

      {foto && (
        <div className="flex flex-wrap items-center justify-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
          <button onClick={() => girar(-90)} aria-label="Girar para a esquerda" title="Girar para a esquerda (Shift+R)" className={botao}>
            ⟲
          </button>
          <span className="w-14 text-center font-mono text-sm" aria-live="polite">
            {giro}°
          </span>
          <button onClick={() => girar(90)} aria-label="Girar para a direita" title="Girar para a direita (R)" className={botao}>
            ⟳
          </button>
          <span className="mx-2 h-8 w-px bg-white/25" aria-hidden />
          <button onClick={() => aplicarZoom(zoom / 1.5)} disabled={zoom <= ZOOM_MIN} aria-label="Diminuir zoom" title="Diminuir (−)" className={botao}>
            −
          </button>
          <span className="w-16 text-center font-mono text-sm" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <button onClick={() => aplicarZoom(zoom * 1.5)} disabled={zoom >= ZOOM_MAX} aria-label="Aumentar zoom" title="Aumentar (+)" className={botao}>
            +
          </button>
          <button onClick={ajustar} disabled={zoom === 1} title="Voltar ao tamanho da tela (0)" className={`${botao} text-sm`}>
            Ajustar
          </button>
        </div>
      )}
      {!foto && <div className="pb-[max(1rem,env(safe-area-inset-bottom))]" />}
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
