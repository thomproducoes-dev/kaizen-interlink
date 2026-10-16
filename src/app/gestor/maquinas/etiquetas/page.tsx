import { headers } from "next/headers";
import QRCode from "qrcode";
import { BotaoImprimir } from "../../adesivos/imprimir";
import { enderecoMaquina } from "@/lib/adesivo";
import { criarClienteServidor } from "@/lib/supabase/server";

// Etiquetas das máquinas. O QR guarda o endereço do sistema: a câmera comum do celular também abre.
export default async function Etiquetas({ searchParams }: { searchParams: Promise<{ setor?: string }> }) {
  const { setor } = await searchParams;
  const h = await headers();
  const origem = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;

  const supabase = await criarClienteServidor();
  const [{ data: setores }, { data: maquinas }] = await Promise.all([
    supabase.from("setores").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("maquinas").select("id, nome, setor_id, codigo_qr").eq("ativa", true).order("nome"),
  ]);
  const nomeSetor = new Map((setores ?? []).map((s) => [s.id as string, s.nome as string]));
  const lista = (maquinas ?? []).filter((m) => !setor || nomeSetor.get(m.setor_id) === setor);
  const comQr = await Promise.all(
    lista.map(async (m) => ({
      ...m,
      svg: await QRCode.toString(enderecoMaquina(origem, m.codigo_qr), { type: "svg", margin: 1, errorCorrectionLevel: "M" }),
    })),
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="font-display text-4xl font-bold">Etiquetas das máquinas</h1>
          <p className="text-muted">
            {comQr.length} etiqueta{comQr.length === 1 ? "" : "s"}
            {setor ? ` de ${setor}` : ""}. Cole em local visível, perto do posto de trabalho.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <a href="/gestor/maquinas/etiquetas" className={`rounded-lg border px-3 py-1.5 font-semibold ${!setor ? "border-accent bg-tint" : "border-line"}`}>
            Todas
          </a>
          {(setores ?? []).map((s) => (
            <a
              key={s.id}
              href={`/gestor/maquinas/etiquetas?setor=${encodeURIComponent(s.nome)}`}
              className={`rounded-lg border px-3 py-1.5 font-semibold ${setor === s.nome ? "border-accent bg-tint" : "border-line"}`}
            >
              {s.nome}
            </a>
          ))}
          <BotaoImprimir />
        </div>
      </div>

      {comQr.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-10 text-center text-muted print:hidden">
          Nenhuma máquina ativa{setor ? " neste setor" : ""}. Cadastre na aba Máquinas.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,6cm)] gap-3 print:gap-2">
          {comQr.map((m) => (
            <div
              key={m.id}
              className="flex h-[4cm] w-[6cm] break-inside-avoid items-center gap-2 rounded-lg border-2 border-black bg-white p-2 text-black"
            >
              <div className="h-[3.4cm] w-[3.4cm] shrink-0" dangerouslySetInnerHTML={{ __html: m.svg }} />
              <div className="flex min-w-0 flex-col gap-0.5 leading-tight">
                <span className="text-[9px] font-semibold uppercase tracking-wider">Kaizen 4.0 · Ideias</span>
                <span className="text-[13px] font-bold">{m.nome}</span>
                <span className="text-[10px]">{nomeSetor.get(m.setor_id)}</span>
                <span className="mt-1 text-[8px]">Tem uma ideia para esta máquina? Leia este código no totem.</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
