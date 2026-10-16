import Link from "next/link";
import { alternarMaquina } from "../actions";
import { criarClienteServidor } from "@/lib/supabase/server";
import { FormNovaMaquina } from "./form";

export default async function Maquinas() {
  const supabase = await criarClienteServidor();
  const [{ data: setores }, { data: maquinas }] = await Promise.all([
    supabase.from("setores").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("maquinas").select("id, nome, ativa, setor_id").order("nome"),
  ]);
  const nomeSetor = new Map((setores ?? []).map((s) => [s.id as string, s.nome as string]));
  const lista = (maquinas ?? []).sort(
    (a, b) => Number(b.ativa) - Number(a.ativa) || (nomeSetor.get(a.setor_id) ?? "").localeCompare(nomeSetor.get(b.setor_id) ?? "") || a.nome.localeCompare(b.nome),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-bold">Máquinas e postos</h1>
          <p className="text-muted">A etiqueta QR colada na máquina abre o envio de ideia já com setor e máquina preenchidos.</p>
        </div>
        <Link href="/gestor/maquinas/etiquetas" className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-ink">
          Imprimir etiquetas
        </Link>
      </div>

      <FormNovaMaquina setores={(setores ?? []) as { id: string; nome: string }[]} />

      <section className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
              <th className="px-3 py-2">Máquina ou posto</th>
              <th className="px-3 py-2">Setor</th>
              <th className="px-3 py-2">Situação</th>
              <th className="px-3 py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((m) => (
              <tr key={m.id} className={`border-b border-line ${m.ativa ? "" : "text-muted"}`}>
                <td className="px-3 py-2 font-semibold">{m.nome}</td>
                <td className="px-3 py-2">{nomeSetor.get(m.setor_id) ?? "—"}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${m.ativa ? "bg-good-bg text-good" : "bg-surface-2"}`}>
                    {m.ativa ? "Ativa" : "Desativada"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <form action={alternarMaquina}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="ativa" value={String(m.ativa)} />
                    <button className="rounded-md border border-line px-2 py-1 text-xs font-semibold">{m.ativa ? "Desativar" : "Reativar"}</button>
                  </form>
                </td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-10 text-center text-muted">
                  Nenhuma máquina ainda. Cadastre a primeira acima.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
