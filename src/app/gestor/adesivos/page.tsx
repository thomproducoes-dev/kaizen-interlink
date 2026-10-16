import QRCode from "qrcode";
import { conteudoAdesivo } from "@/lib/adesivo";
import { criarClienteServidor } from "@/lib/supabase/server";
import { BotaoImprimir } from "./imprimir";

type Adesivo = {
  colaborador_id: string;
  nome: string;
  matricula: string;
  setor: string | null;
  ativo: boolean;
  qr_token: string;
};

// Folha de adesivos para imprimir. O modelo final do adesivo será definido pela Interlink;
// este layout (6 × 4 cm) serve para o piloto e para testes de leitura no totem.
export default async function Adesivos({ searchParams }: { searchParams: Promise<{ setor?: string }> }) {
  const { setor } = await searchParams;
  const supabase = await criarClienteServidor();
  const [{ data }, { data: setores }] = await Promise.all([
    supabase.rpc("listar_adesivos"),
    supabase.from("setores").select("nome").eq("ativo", true).order("nome"),
  ]);

  const lista = ((data ?? []) as Adesivo[]).filter((a) => a.ativo && (!setor || a.setor === setor));
  const comQr = await Promise.all(
    lista.map(async (a) => ({
      ...a,
      svg: await QRCode.toString(conteudoAdesivo(a.qr_token), { type: "svg", margin: 1, errorCorrectionLevel: "M" }),
    })),
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="font-display text-4xl font-bold">Adesivos QR</h1>
          <p className="text-muted">
            {comQr.length} adesivo{comQr.length === 1 ? "" : "s"}
            {setor ? ` de ${setor}` : ""}. Imprima em papel adesivo e entregue a cada colaborador.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <a href="/gestor/adesivos" className={`rounded-lg border px-3 py-1.5 font-semibold ${!setor ? "border-accent bg-tint" : "border-line"}`}>
            Todos
          </a>
          {(setores ?? []).map((s) => (
            <a
              key={s.nome}
              href={`/gestor/adesivos?setor=${encodeURIComponent(s.nome)}`}
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
          Nenhum colaborador ativo{setor ? " neste setor" : ""}. Cadastre colaboradores na aba Colaboradores.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,6cm)] gap-3 print:gap-2">
          {comQr.map((a) => (
            <div
              key={a.colaborador_id}
              className="flex h-[4cm] w-[6cm] break-inside-avoid items-center gap-2 rounded-lg border border-dashed border-line bg-white p-2 text-black"
            >
              <div className="h-[3.4cm] w-[3.4cm] shrink-0" dangerouslySetInnerHTML={{ __html: a.svg }} />
              <div className="flex min-w-0 flex-col gap-0.5 leading-tight">
                <span className="text-[9px] font-semibold uppercase tracking-wider">Kaizen 4.0 · Interlink</span>
                <span className="text-[13px] font-bold">{a.nome}</span>
                <span className="font-mono text-[10px]">Mat. {a.matricula}</span>
                <span className="text-[10px]">{a.setor ?? ""}</span>
                <span className="mt-1 text-[8px]">Pessoal. Use com seu PIN no totem.</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
