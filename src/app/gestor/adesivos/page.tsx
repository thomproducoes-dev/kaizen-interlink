import Link from "next/link";
import { AssistenteEtiquetas, type ItemEtiqueta } from "@/components/assistente-etiquetas";
import { conteudoAdesivo } from "@/lib/adesivo";
import { exigirGestor } from "@/lib/gestao";
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
// Com ?id=<colaborador> (botão "Imprimir adesivo" da lista de colaboradores), mostra só aquela pessoa.
export default async function Adesivos({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const supabase = await criarClienteServidor();
  await exigirGestor(supabase);
  const { data } = await supabase.rpc("listar_adesivos", id ? { p_ids: [id] } : {});
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

  if (!id) {
    return (
      <AssistenteEtiquetas
        itens={itens}
        titulo="Adesivos QR"
        descricao="Escolha o tamanho, marque quem vai receber e confira a prévia antes de imprimir em papel adesivo."
        vazio="Nenhum colaborador ativo. Cadastre colaboradores na aba Colaboradores."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex flex-wrap gap-4 text-sm font-semibold print:hidden">
        <Link href="/gestor/colaboradores" className="text-accent hover:underline">
          ← Voltar para colaboradores
        </Link>
        <Link href="/gestor/adesivos" className="text-accent hover:underline">
          Ver adesivos de todos
        </Link>
      </nav>
      <AssistenteEtiquetas
        itens={itens}
        titulo={itens[0] ? `Adesivo de ${itens[0].titulo}` : "Adesivo QR"}
        descricao="Escolha o tamanho e o número de cópias, confira a prévia e imprima em papel adesivo, ou salve a imagem."
        vazio="Colaborador não encontrado ou desativado."
      />
    </div>
  );
}
