import { AssistenteEtiquetas, type ItemEtiqueta } from "@/components/assistente-etiquetas";
import { conteudoAdesivo } from "@/lib/adesivo";
import { criarClienteServidor } from "@/lib/supabase/server";

type Adesivo = {
  colaborador_id: string;
  nome: string;
  matricula: string;
  setor: string | null;
  ativo: boolean;
  qr_token: string;
};

// Adesivos QR pessoais. O modelo final do adesivo será definido pela Interlink.
export default async function Adesivos() {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.rpc("listar_adesivos");
  const itens: ItemEtiqueta[] = ((data ?? []) as Adesivo[])
    .filter((a) => a.ativo)
    .map((a) => ({
      id: a.colaborador_id,
      grupo: a.setor ?? "Sem setor",
      cabecalho: "Kaizen 4.0 · Interlink",
      titulo: a.nome,
      subtitulo: `Mat. ${a.matricula}`,
      detalhe: a.setor ?? undefined,
      rodape: "Pessoal. Use com seu PIN no totem.",
      qr: conteudoAdesivo(a.qr_token),
      arquivo: `adesivo-${a.matricula}`.replace(/[^\w-]+/g, "_"),
    }));

  return (
    <AssistenteEtiquetas
      itens={itens}
      titulo="Adesivos QR"
      descricao="Escolha o tamanho, marque quem vai receber e confira a prévia antes de imprimir em papel adesivo."
      vazio="Nenhum colaborador ativo. Cadastre colaboradores na aba Colaboradores."
    />
  );
}
