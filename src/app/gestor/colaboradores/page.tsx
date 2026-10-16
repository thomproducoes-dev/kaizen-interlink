import { exigirGestor } from "@/lib/gestao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { FormNovoColaborador, LinhaColaborador, type Colaborador } from "../componentes";

export default async function Colaboradores() {
  const supabase = await criarClienteServidor();
  await exigirGestor(supabase);

  const [{ data: setores }, { data: colaboradores }, { data: adesivos }] = await Promise.all([
    supabase.from("setores").select("id, nome").eq("ativo", true).order("nome"),
    supabase
      .from("colaboradores")
      .select("id, nome, matricula, ativo, setor_id, colaborador_papeis(papel)")
      .order("ativo", { ascending: false })
      .order("nome"),
    supabase.rpc("listar_adesivos"),
  ]);

  const nomeSetor = new Map((setores ?? []).map((s) => [s.id as string, s.nome as string]));
  const credenciais = new Map(
    ((adesivos ?? []) as { colaborador_id: string; tem_pin: boolean; qr_gerado_em: string }[]).map((a) => [a.colaborador_id, a]),
  );

  const lista: Colaborador[] = (colaboradores ?? []).map((c) => ({
    id: c.id,
    nome: c.nome,
    matricula: c.matricula,
    ativo: c.ativo,
    setor: c.setor_id ? nomeSetor.get(c.setor_id) ?? "—" : "—",
    papeis: ((c.colaborador_papeis ?? []) as { papel: string }[]).map((p) => p.papel),
    temPin: credenciais.get(c.id)?.tem_pin ?? false,
    adesivoEm: credenciais.get(c.id)?.qr_gerado_em ?? null,
  }));

  const ativos = lista.filter((c) => c.ativo).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-4xl font-bold">Colaboradores</h1>
        <p className="text-muted">
          {ativos} ativo{ativos === 1 ? "" : "s"}. Cada um entra no totem, e quem tem papel na gestão também entra aqui, com o adesivo QR e um PIN de 4 números.
        </p>
      </div>

      <FormNovoColaborador setores={(setores ?? []) as { id: string; nome: string }[]} />

      <section className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">Matrícula</th>
              <th className="px-3 py-2">Setor</th>
              <th className="px-3 py-2">Papéis</th>
              <th className="px-3 py-2">Acesso</th>
              <th className="px-3 py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => (
              <LinhaColaborador key={c.id} c={c} />
            ))}
            {lista.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-muted">
                  Nenhum colaborador ainda. Cadastre o primeiro acima.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
