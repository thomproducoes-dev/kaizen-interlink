"use client";

export function BotaoImprimir() {
  return (
    <button onClick={() => window.print()} className="rounded-lg bg-accent px-4 py-1.5 font-semibold text-accent-ink">
      Imprimir
    </button>
  );
}
