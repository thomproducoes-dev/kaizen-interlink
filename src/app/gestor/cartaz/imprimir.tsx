"use client";

export function BotaoImprimirCartaz() {
  return (
    <button onClick={() => window.print()} className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-ink">
      Imprimir cartaz
    </button>
  );
}
