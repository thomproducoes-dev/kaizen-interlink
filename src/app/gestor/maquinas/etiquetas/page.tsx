import { headers } from "next/headers";
import { AssistenteEtiquetas, type ItemEtiqueta } from "@/components/assistente-etiquetas";
import { enderecoMaquina } from "@/lib/adesivo";
import { criarClienteServidor } from "@/lib/supabase/server";

// Etiquetas das máquinas. O QR guarda o endereço do sistema: a câmera comum do celular também abre.
export default async function Etiquetas() {
  const h = await headers();
  const origem = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;

  const supabase = await criarClienteServidor();
  const [{ data: setores }, { data: maquinas }] = await Promise.all([
    supabase.from("setores").select("id, nome"),
    supabase.from("maquinas").select("id, nome, setor_id, codigo_qr").eq("ativa", true).order("nome"),
  ]);
  const nomeSetor = new Map((setores ?? []).map((s) => [s.id as string, s.nome as string]));

  const itens: ItemEtiqueta[] = (maquinas ?? []).map((m) => ({
    id: m.id,
    grupo: nomeSetor.get(m.setor_id) ?? "",
    cabecalho: "Kaizen 4.0 · Ideias",
    titulo: m.nome,
    detalhe: nomeSetor.get(m.setor_id),
    rodape: "Tem uma ideia para esta máquina? Leia este código no totem.",
    qr: enderecoMaquina(origem, m.codigo_qr),
    arquivo: `maquina-${m.nome}`.replace(/[^\w-]+/g, "_"),
  }));

  return (
    <AssistenteEtiquetas
      itens={itens}
      titulo="Etiquetas das máquinas"
      descricao="Cole em local visível, perto do posto. A etiqueta abre o envio de ideia já com setor e máquina preenchidos."
      vazio="Nenhuma máquina ativa. Cadastre na aba Máquinas."
    />
  );
}
