// Página provisória da Entrega 1: mostra se o ambiente está configurado.
// Será substituída pela tela de entrada do totem (adesivo QR + PIN).

export const dynamic = "force-dynamic";

const variaveis = [
  { nome: "NEXT_PUBLIC_SUPABASE_URL", ok: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) },
  { nome: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", ok: Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) },
  { nome: "SUPABASE_SECRET_KEY", ok: Boolean(process.env.SUPABASE_SECRET_KEY) },
];

export default function Home() {
  const pronto = variaveis.every((v) => v.ok);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-4 py-12">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">Entrega 1 em construção</p>
        <h1 className="font-display text-5xl font-bold">Kaizen 4.0 · Interlink</h1>
        <p className="mt-2 text-lg text-muted">Gestão de ideias de melhoria do chão de fábrica.</p>
      </div>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="font-display text-2xl font-bold">Ambiente</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {variaveis.map((v) => (
            <li key={v.nome} className="flex items-center justify-between gap-4">
              <code className="font-mono text-sm">{v.nome}</code>
              <span
                className={`rounded-full px-3 py-0.5 text-sm font-semibold ${
                  v.ok ? "bg-good-bg text-good" : "bg-warn-bg text-warn"
                }`}
              >
                {v.ok ? "Configurada" : "Pendente"}
              </span>
            </li>
          ))}
        </ul>
        {!pronto && (
          <p className="mt-4 text-sm text-muted">
            Copie <code className="font-mono">.env.example</code> para{" "}
            <code className="font-mono">.env.local</code> e preencha com os dados do projeto no Supabase.
          </p>
        )}
      </section>
    </main>
  );
}
