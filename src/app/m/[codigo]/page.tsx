import { redirect } from "next/navigation";

// Destino do QR colado na máquina: abre o totem já sabendo de qual máquina é a ideia.
export default async function EtiquetaMaquina({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  redirect(/^[0-9a-f]{24}$/i.test(codigo) ? `/totem?maquina=${codigo.toLowerCase()}` : "/totem");
}
