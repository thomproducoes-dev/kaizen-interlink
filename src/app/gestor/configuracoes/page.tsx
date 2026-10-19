import { exigirGestor } from "@/lib/gestao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Feriados } from "./feriados";
import { FormConfiguracoes } from "./form";

function anoAtual() {
  return new Date().getFullYear();
}

export default async function Configuracoes() {
  const supabase = await criarClienteServidor();
  await exigirGestor(supabase);
  const [{ data }, { data: feriados }] = await Promise.all([
    supabase.from("empresas").select("config").single(),
    supabase.from("feriados").select("data, descricao").order("data"),
  ]);
  const cfg = (data?.config ?? {}) as { teto_implantacao_direta?: number; valores_unitarios?: Record<string, number | null>; pontos?: { limite_mensal?: number } };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="font-display text-4xl font-bold">Configurações</h1>
        <p className="text-muted">Parâmetros do programa: cálculo de ganho, triagem, pontos e o calendário usado pelo relógio de prazos.</p>
      </div>
      <FormConfiguracoes teto={cfg.teto_implantacao_direta ?? 1000} valores={cfg.valores_unitarios ?? {}} limite={cfg.pontos?.limite_mensal ?? 10} />
      <Feriados lista={(feriados ?? []) as { data: string; descricao: string }[]} anoAtual={anoAtual()} />
    </div>
  );
}
