import Link from "next/link";
import { CLASSE_TOM, STATUS, formatarData, nomeCategoria, rotuloAutor } from "@/lib/ideias";
import { criarClienteServidor } from "@/lib/supabase/server";

type Linha = {
  id: string;
  protocolo: string;
  status: string;
  categoria: string;
  modo: string;
  texto: string | null;
  tem_audio: boolean;
  criada_em: string;
  prazo_atual: string | null;
  setores: { nome: string } | null;
  maquinas: { nome: string } | null;
  autor: { nome: string } | null;
  ideia_midias: { count: number }[];
};

// Visão de leitura das ideias recebidas. A triagem com decisões e SLA chega na Entrega 3.
export default async function Ideias() {
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("ideias")
    .select(
      "id, protocolo, status, categoria, modo, texto, tem_audio, criada_em, prazo_atual, setores(nome), maquinas(nome), autor:colaboradores!ideias_autor_id_fkey(nome), ideia_midias(count)",
    )
    .order("criada_em", { ascending: false });
  const lista = (data ?? []) as unknown as Linha[];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-4xl font-bold">Ideias recebidas</h1>
        <p className="text-muted">
          {lista.length} ideia{lista.length === 1 ? "" : "s"}. A triagem pelo comitê, com decisões e alertas de prazo, chega na Entrega 3.
        </p>
      </div>
      <section className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
              <th className="px-3 py-2">Protocolo</th>
              <th className="px-3 py-2">Ideia</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Setor · máquina</th>
              <th className="px-3 py-2">Autor</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Prazo</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((i) => {
              const s = STATUS[i.status] ?? { n: i.status, tom: "muted" as const };
              const anexos = i.ideia_midias[0]?.count ?? 0;
              return (
                <tr key={i.id} className="border-b border-line align-top hover:bg-surface-2">
                  <td className="px-3 py-2 font-mono">
                    <Link href={`/gestor/ideias/${i.id}`} className="font-semibold text-accent underline-offset-2 hover:underline">
                      {i.protocolo}
                    </Link>
                    <span className="block text-xs text-muted">{formatarData(i.criada_em)}</span>
                  </td>
                  <td className="max-w-[280px] px-3 py-2">
                    <span className="line-clamp-2">{i.texto || (i.tem_audio ? "Ideia por áudio" : "Ideia com anexos")}</span>
                    <span className="text-xs text-muted">
                      {anexos} anexo{anexos === 1 ? "" : "s"}
                      {i.tem_audio ? " · com áudio" : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2">{nomeCategoria(i.categoria)}</td>
                  <td className="px-3 py-2">
                    {i.setores?.nome}
                    {i.maquinas && <span className="block text-xs text-muted">{i.maquinas.nome}</span>}
                  </td>
                  <td className="px-3 py-2">{rotuloAutor(i)}</td>
                  <td className="px-3 py-2">
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${CLASSE_TOM[s.tom]}`}>{s.n}</span>
                  </td>
                  <td className="px-3 py-2">{formatarData(i.prazo_atual)}</td>
                </tr>
              );
            })}
            {lista.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-muted">
                  Nenhuma ideia ainda. Elas aparecem aqui assim que forem enviadas pelo totem.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
