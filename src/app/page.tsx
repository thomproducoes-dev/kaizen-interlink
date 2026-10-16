import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-4 py-12">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">Interlink do Brasil</p>
        <h1 className="font-display text-5xl font-bold">Kaizen 4.0</h1>
        <p className="mt-2 text-lg text-muted">Gestão de ideias de melhoria do chão de fábrica.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/totem" className="rounded-2xl bg-signal p-6 text-signal-ink">
          <span className="font-display text-3xl font-bold">Totem</span>
          <span className="block">Entrada com adesivo QR e PIN</span>
        </Link>
        <Link href="/gestor" className="rounded-2xl border border-line bg-surface p-6">
          <span className="font-display text-3xl font-bold">Área da gestão</span>
          <span className="block text-muted">Cadastros, adesivos e acompanhamento</span>
        </Link>
      </div>
    </main>
  );
}
