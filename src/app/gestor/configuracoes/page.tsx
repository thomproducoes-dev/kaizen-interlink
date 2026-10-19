import { exigirGestor } from "@/lib/gestao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { FormConfiguracoes } from "./form";

export default async function Configuracoes() {
  const supabase = await criarClienteServidor();
  await exigirGestor(supabase);
  const { data } = await supabase.from("empresas").select("config").single();
  const cfg = (data?.config ?? {}) as { teto_implantacao_direta?: number; valores_unitarios?: Record<string, number | null> };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="font-display text-4xl font-bold">Configurações</h1>
        <p className="text-muted">Valores usados no cálculo de ganho da viabilidade (Fase 0, seção 10). A engenharia ainda pode ajustá-los em cada ideia.</p>
      </div>
      <FormConfiguracoes teto={cfg.teto_implantacao_direta ?? 1000} valores={cfg.valores_unitarios ?? {}} />
    </div>
  );
}
