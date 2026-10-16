import Link from "next/link";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { sair } from "./actions";

export const dynamic = "force-dynamic";

export default async function GestorLayout({ children }: { children: React.ReactNode }) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/entrar");

  const { data: ehGestor } = await supabase.rpc("sou_gestor");
  if (!ehGestor) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <h1 className="font-display text-3xl font-bold">Acesso restrito</h1>
        <p className="mt-2 text-muted">Esta área é do gestor do programa.</p>
        <form action={sair} className="mt-4">
          <button className="rounded-lg border border-line px-4 py-2 font-semibold">Sair</button>
        </form>
      </main>
    );
  }

  const { data: empresa } = await supabase.from("empresas").select("nome").single();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-surface print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="leading-tight">
            <p className="font-display text-xl font-bold">Kaizen 4.0</p>
            <p className="text-xs uppercase tracking-widest text-muted">{empresa?.nome ?? ""}</p>
          </div>
          <nav className="flex gap-1 text-sm font-semibold">
            <Link href="/gestor" className="rounded-lg px-3 py-2 hover:bg-surface-2">
              Colaboradores
            </Link>
            <Link href="/gestor/adesivos" className="rounded-lg px-3 py-2 hover:bg-surface-2">
              Adesivos QR
            </Link>
          </nav>
          <form action={sair} className="ml-auto">
            <button className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold">Sair</button>
          </form>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}
