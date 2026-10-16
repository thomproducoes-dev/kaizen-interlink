import Link from "next/link";
import { redirect } from "next/navigation";
import { PAPEIS_GESTAO, ehGestor, meusPapeis } from "@/lib/gestao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { sair } from "./actions";

export const dynamic = "force-dynamic";

const NOME_PAPEL: Record<string, string> = {
  comite: "Comitê",
  engenharia: "Engenharia",
  encarregado: "Encarregado",
  gestor: "Gestor do programa",
  admin: "Admin",
  rh: "RH",
};

export default async function GestorLayout({ children }: { children: React.ReactNode }) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/entrar");

  const papeis = await meusPapeis(supabase);
  if (!papeis.some((p) => PAPEIS_GESTAO.includes(p))) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <h1 className="font-display text-3xl font-bold">Acesso restrito</h1>
        <p className="mt-2 text-muted">Esta área é do comitê, da engenharia, dos encarregados e do gestor do programa. Para enviar ideias, use o totem.</p>
        <form action={sair} className="mt-4">
          <button className="rounded-lg border border-line px-4 py-2 font-semibold">Sair</button>
        </form>
      </main>
    );
  }

  const [{ data: empresa }, { data: eu }] = await Promise.all([
    supabase.from("empresas").select("nome").single(),
    supabase.from("colaboradores").select("nome").eq("auth_user_id", user.id).single(),
  ]);
  const gestor = ehGestor(papeis);
  const link = "rounded-lg px-3 py-2 hover:bg-surface-2";

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-surface print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="leading-tight">
            <p className="font-display text-xl font-bold">Kaizen 4.0</p>
            <p className="text-xs uppercase tracking-widest text-muted">{empresa?.nome ?? ""}</p>
          </div>
          <nav className="flex flex-wrap gap-1 text-sm font-semibold">
            <Link href="/gestor/fila" className={link}>
              Fila de ideias
            </Link>
            {gestor && (
              <>
                <Link href="/gestor/colaboradores" className={link}>
                  Colaboradores
                </Link>
                <Link href="/gestor/adesivos" className={link}>
                  Adesivos QR
                </Link>
                <Link href="/gestor/maquinas" className={link}>
                  Máquinas
                </Link>
              </>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-right leading-tight sm:block">
              <b className="block">{eu?.nome}</b>
              <span className="text-xs text-muted">
                {papeis
                  .filter((p) => NOME_PAPEL[p])
                  .map((p) => NOME_PAPEL[p])
                  .join(" · ")}
              </span>
            </span>
            <form action={sair}>
              <button className="rounded-lg border border-line px-3 py-1.5 font-semibold">Sair</button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6 print:m-0 print:max-w-none print:p-0">{children}</div>
    </div>
  );
}
