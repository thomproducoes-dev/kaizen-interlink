import { exigirGestor } from "@/lib/gestao";
import { formatarDataHora } from "@/lib/ideias";
import { criarClienteServidor } from "@/lib/supabase/server";
import { FormNovoColaborador, LinhaColaborador, type Colaborador } from "../componentes";

export default async function Colaboradores() {
  const supabase = await criarClienteServidor();
  await exigirGestor(supabase);

  const [{ data: setores }, { data: colaboradores }, { data: adesivos }, { data: auditoria }] = await Promise.all([
    supabase.from("setores").select("id, nome").eq("ativo", true).order("nome"),
    supabase
      .from("colaboradores")
      .select("id, nome, matricula, ativo, setor_id, colaborador_papeis(papel)")
      .order("ativo", { ascending: false })
      .order("nome"),
    supabase.rpc("listar_adesivos"),
    supabase
      .from("auditoria_cadastro")
      .select("id, acao, criado_em, alvo:colaboradores!auditoria_cadastro_colaborador_id_fkey(nome), por:colaboradores!auditoria_cadastro_por_colaborador_fkey(nome)")
      .order("criado_em", { ascending: false })
      .limit(40),
  ]);
  type Registro = { id: number; acao: string; criado_em: string; alvo: { nome: string } | null; por: { nome: string } | null };

  const nomeSetor = new Map((setores ?? []).map((s) => [s.id as string, s.nome as string]));
  const credenciais = new Map(
    ((adesivos ?? []) as { colaborador_id: string; tem_pin: boolean; pin_provisorio: boolean | null; qr_gerado_em: string }[]).map((a) => [a.colaborador_id, a]),
  );

  const lista: Colaborador[] = (colaboradores ?? []).map((c) => ({
    id: c.id,
    nome: c.nome,
    matricula: c.matricula,
    ativo: c.ativo,
    setor: c.setor_id ? nomeSetor.get(c.setor_id) ?? "—" : "—",
    setorId: c.setor_id,
    papeis: ((c.colaborador_papeis ?? []) as { papel: string }[]).map((p) => p.papel),
    temPin: credenciais.get(c.id)?.tem_pin ?? false,
    pinProvisorio: credenciais.get(c.id)?.pin_provisorio ?? false,
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
              <LinhaColaborador key={c.id} c={c} setores={(setores ?? []) as { id: string; nome: string }[]} />
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

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="font-display text-2xl font-bold">Histórico do cadastro</h2>
        <p className="text-sm text-muted">
          Registro automático de papéis, PINs, adesivos, bloqueios e edições. Ninguém consegue apagar ou alterar estas linhas.
        </p>
        <ul className="mt-2 text-sm">
          {((auditoria ?? []) as unknown as Registro[]).map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 border-t border-line py-2 first:border-t-0">
              <span className="w-28 shrink-0 font-mono text-xs text-muted">{formatarDataHora(r.criado_em)}</span>
              <b>{r.alvo?.nome ?? "—"}</b>
              <span className="min-w-0 flex-1">{r.acao}</span>
              <span className="text-xs text-muted">por {r.por?.nome ?? "sistema / o próprio"}</span>
            </li>
          ))}
          {(auditoria ?? []).length === 0 && <li className="py-2 text-muted">Nada registrado ainda.</li>}
        </ul>
      </section>
    </div>
  );
}
