"use client";

import { Icone } from "@/components/icone";

// Comemoração da primeira ideia do colaborador: parabeniza e explica como os pontos funcionam.
// Os confetes são só decoração (ocultos para leitores de tela) e param se o aparelho pedir menos movimento.

const CORES = ["#f3b21a", "#0d6466", "#b23a2e", "#2f5f8a", "#2b7a4b"];
const CONFETES = Array.from({ length: 28 }, (_, k) => ({
  esquerda: (k * 37) % 100,
  atraso: ((k * 13) % 20) / 10,
  duracao: 2.4 + ((k * 7) % 10) / 10,
  cor: CORES[k % CORES.length],
  giro: (k * 47) % 360,
}));

export function BoasVindas({ nome, limiteMensal }: { nome: string; limiteMensal: number }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-signal bg-surface p-4 text-left">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {CONFETES.map((c, k) => (
          <span
            key={k}
            className="confete absolute top-0 block h-3 w-2 rounded-sm"
            style={{ left: `${c.esquerda}%`, background: c.cor, animationDelay: `${c.atraso}s`, animationDuration: `${c.duracao}s`, rotate: `${c.giro}deg` }}
          />
        ))}
      </div>
      <div className="relative flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-signal text-signal-ink">
            <Icone nome="lampada" tamanho={32} />
          </span>
          <div>
            <h2 className="font-display text-3xl font-bold leading-tight">Parabéns pela sua primeira ideia, {nome}!</h2>
            <p className="text-muted">Você agora faz parte do programa de melhorias da fábrica.</p>
          </div>
        </div>
        <p className="font-semibold">Veja como você ganha pontos:</p>
        <ul className="grid gap-2 text-base sm:grid-cols-2">
          <li className="rounded-xl bg-tint px-3 py-2">
            <b className="font-display text-2xl">+10</b> quando o comitê aceita a ideia
          </li>
          <li className="rounded-xl bg-tint px-3 py-2">
            <b className="font-display text-2xl">+5</b> pela participação, mesmo se ela não for aprovada (menos se for repetida)
          </li>
          <li className="rounded-xl bg-tint px-3 py-2">
            <b className="font-display text-2xl">+30</b> e mais a nota × 10 quando ela vira padrão na fábrica
          </li>
          <li className="rounded-xl bg-tint px-3 py-2">
            <b className="font-display text-2xl">+50</b> se o ganho passar de R$ 5.000 por ano
          </li>
        </ul>
        <p className="text-sm text-muted">
          Níveis: Bronze com 50 pontos, Prata com 200 e Ouro com 500. Até {limiteMensal} ideias por mês somam pontos.
        </p>
        <p className="rounded-xl bg-signal px-4 py-2 text-center font-display text-xl font-bold text-signal-ink">Seus pontos podem virar prêmios. Aguarde!</p>
      </div>
    </div>
  );
}
