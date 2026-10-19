import { redirect } from "next/navigation";
import { meusPapeis } from "@/lib/gestao";
import { formatarDataHora } from "@/lib/ideias";
import { criarClienteServidor } from "@/lib/supabase/server";
import { LinhaAnonima, type IdeiaAnonima } from "./linha";

// Autoria anônima (Fase 0, seção 6): só o RH revela, sempre com motivo, e cada revelação fica registrada.
export default async function Rh() {
  const supabase = await criarClienteServidor();
  const papeis = await meusPapeis(supabase);
  if (!papeis.includes("rh")) redirect("/gestor/fila");

  const [{ data: ideias }, { data: registro }] = await Promise.all([
    supabase.rpc("ideias_anonimas"),
    supabase
      .from("autoria_revelacoes")
      .select("id, acao, motivo, criado_em, ideias(protocolo), colaboradores(nome)")
      .order("criado_em", { ascending: false })
      .limit(30),
  ]);
  const lista = (ideias ?? []) as IdeiaAnonima[];
  const log = (registro ?? []) as unknown as { id: number; acao: string; motivo: string; criado_em: string; ideias: { protocolo: string } | null; colaboradores: { nome: string } | null }[];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-4xl font-bold">Autoria anônima</h1>
        <p className="max-w-3xl text-muted">
          Revele a autoria só quando o autor pedir o prêmio ou houver motivo formal. O nome aparece apenas para você, nesta tela, e a revelação fica registrada com
          motivo, data e hora. O gestor do programa vê o registro, mas nunca o nome revelado.
        </p>
      </div>

      <section className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
              <th className="px-3 py-2">Protocolo</th>
              <th className="px-3 py-2">Ideia</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Pontos guardados</th>
              <th className="px-3 py-2">Ações do RH</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((i) => (
              <LinhaAnonima key={i.id} i={i} />
            ))}
            {lista.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-muted">
                  Nenhuma ideia anônima até agora.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="font-display text-2xl font-bold">Registro de revelações</h2>
        <ul className="mt-2 text-sm">
          {log.map((r) => (
            <li key={r.id} className="border-t border-line py-2 first:border-t-0">
              <span className="font-mono text-xs text-muted">{formatarDataHora(r.criado_em)}</span> · <b>{r.ideias?.protocolo}</b> ·{" "}
              {r.acao === "revelar" ? "Autoria revelada" : "Pontos liberados para o ranking"} por {r.colaboradores?.nome ?? "RH"}
              <span className="block text-muted">Motivo: {r.motivo}</span>
            </li>
          ))}
          {log.length === 0 && <li className="py-2 text-muted">Nenhuma revelação registrada.</li>}
        </ul>
      </section>
    </div>
  );
}
