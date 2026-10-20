import Link from "next/link";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { enderecoMaquina } from "@/lib/adesivo";
import { exigirGestor } from "@/lib/gestao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { BotaoImprimirCartaz } from "../../cartaz/imprimir";
import { COR, TelaEntrar, TelaMaquinaLida, TelaMostre, TelaProtocolo, condensada } from "../../cartaz/telas";

// Cartaz A4 de máquina: mesmo cabeçalho do cartaz do totem, o QR da máquina em destaque
// e o passo a passo resumido em 4 passos. Com ?id=<máquina> mostra só aquela; sem, uma folha por máquina ativa.
export default async function CartazesMaquinas({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const h = await headers();
  const origem = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;

  const supabase = await criarClienteServidor();
  await exigirGestor(supabase);
  let consulta = supabase.from("maquinas").select("id, nome, setor_id, codigo_qr").eq("ativa", true).order("nome");
  if (id) consulta = consulta.eq("id", id);
  const [{ data: empresa }, { data: setores }, { data: maquinas }] = await Promise.all([
    supabase.from("empresas").select("nome, config").single(),
    supabase.from("setores").select("id, nome"),
    consulta,
  ]);
  const nomeSetor = new Map((setores ?? []).map((s) => [s.id as string, s.nome as string]));
  const cfg = (empresa?.config ?? {}) as { sla?: { triagem?: { prazo?: number } }; video_sugerido_segundos?: number };
  const prazo = cfg.sla?.triagem?.prazo ?? 5;
  const video = cfg.video_sugerido_segundos ?? 30;

  const folhas = await Promise.all(
    (maquinas ?? []).map(async (m) => ({
      ...m,
      setor: nomeSetor.get(m.setor_id) ?? "",
      svg: await QRCode.toString(enderecoMaquina(origem, m.codigo_qr), { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: COR.tinta } }),
    })),
  );

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-full flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <Link href="/gestor/maquinas" className="text-sm font-semibold text-accent hover:underline">
            ← Máquinas
          </Link>
          <h1 className="font-display text-4xl font-bold">{id && folhas[0] ? `Cartaz: ${folhas[0].nome}` : "Cartazes das máquinas"}</h1>
          <p className="text-muted">
            Uma folha A4 por máquina. Imprima na vertical, com escala 100% e margens “Nenhuma”, e cole em local visível no posto.
          </p>
        </div>
        {folhas.length > 0 && <BotaoImprimirCartaz />}
      </div>

      {folhas.length === 0 && <p className="py-10 text-muted">Nenhuma máquina ativa. Cadastre na aba Máquinas.</p>}

      <div className="flex max-w-full flex-col gap-6 overflow-x-auto print:block print:overflow-visible">
        {folhas.map((m) => (
          <article
            key={m.id}
            className="folha flex flex-col shadow-lg print:shadow-none"
            style={{ width: "210mm", height: "297mm", background: "#fff", color: COR.tinta, fontFamily: "var(--font-barlow), Arial, sans-serif" }}
          >
            <header style={{ background: COR.sinal, color: "#1c1400", padding: "10mm 15mm 9mm", display: "flex", flexDirection: "column", gap: "2.5mm" }}>
              <span style={{ fontSize: "12pt", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" }}>Kaizen 4.0 · {empresa?.nome ?? ""}</span>
              <h2 style={{ ...condensada, fontSize: "40pt", fontWeight: 700, lineHeight: 0.95, margin: 0 }}>Tem uma ideia de melhoria? Conte para a gente aqui.</h2>
            </header>

            {/* QR da máquina em destaque */}
            <section style={{ margin: "8mm 12mm 0", display: "flex", gap: "8mm", alignItems: "center" }}>
              <div style={{ width: "88mm", height: "88mm", padding: "5mm", border: `0.8mm solid ${COR.tinta}`, borderRadius: "4mm", flexShrink: 0 }}>
                <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: m.svg }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "3mm", minWidth: 0 }}>
                <span style={{ fontSize: "11pt", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: COR.acento }}>Esta máquina</span>
                <b style={{ ...condensada, fontSize: "34pt", lineHeight: 1, overflowWrap: "anywhere" }}>{m.nome}</b>
                <span style={{ fontSize: "15pt", color: COR.suave }}>Setor {m.setor}</span>
                <span style={{ marginTop: "3mm", background: COR.tinte, borderRadius: "3mm", padding: "4mm", fontSize: "12pt", lineHeight: 1.35 }}>
                  Leia este código e a ideia já chega com a <b>máquina e o setor certos</b>. Você só conta o que viu.
                </span>
              </div>
            </section>

            {/* Passo a passo resumido */}
            <ol style={{ listStyle: "none", margin: "9mm 12mm 0", padding: 0, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "5mm" }}>
              {[
                { n: 1, t: "Leia o código", d: "Aponte a câmera do totem ou do celular para o QR acima.", tela: <TelaMaquinaLida maquina={m.nome} /> },
                { n: 2, t: "Entre", d: "Mostre seu adesivo pessoal e digite seu PIN.", tela: <TelaEntrar /> },
                { n: 3, t: "Mostre e conte", d: `Foto ou vídeo curto (até ${video} s). Explique falando ou escrevendo.`, tela: <TelaMostre /> },
                { n: 4, t: "Guarde o protocolo", d: `O comitê responde em até ${prazo} dias úteis.`, tela: <TelaProtocolo /> },
              ].map((p) => (
                <li key={p.n} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2.5mm", textAlign: "center" }}>
                  {p.tela}
                  <span style={{ display: "flex", alignItems: "center", gap: "2mm" }}>
                    <span style={{ ...condensada, width: "9mm", height: "9mm", borderRadius: "50%", background: COR.acento, color: "#fff", display: "grid", placeItems: "center", fontSize: "15pt", fontWeight: 700, flexShrink: 0 }}>
                      {p.n}
                    </span>
                    <span style={{ ...condensada, fontSize: "15pt", fontWeight: 700, lineHeight: 1.05 }}>{p.t}</span>
                  </span>
                  <span style={{ fontSize: "10.5pt", lineHeight: 1.3, color: "#3a4a56" }}>{p.d}</span>
                </li>
              ))}
            </ol>

            <section style={{ margin: "7mm 12mm 0", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "3mm", textAlign: "center" }}>
              {[
                ["Toda ideia", "recebe resposta"],
                ["Sem medo", "pode enviar de forma anônima"],
                ["Vale ponto", "e os pontos podem virar prêmios"],
              ].map(([t, d]) => (
                <div key={t} style={{ background: COR.tinte, borderRadius: "3mm", padding: "3mm" }}>
                  <b style={{ ...condensada, display: "block", fontSize: "17pt", lineHeight: 1 }}>{t}</b>
                  <span style={{ fontSize: "10pt" }}>{d}</span>
                </div>
              ))}
            </section>

            <footer style={{ margin: "auto 12mm 9mm", border: `0.6mm dashed ${COR.sinal}`, borderRadius: "3mm", padding: "3mm 5mm", display: "flex", alignItems: "center", gap: "4mm" }}>
              <span style={{ ...condensada, background: COR.sinal, color: "#1c1400", borderRadius: "2mm", padding: "1mm 3mm", fontSize: "13pt", fontWeight: 700, whiteSpace: "nowrap" }}>Fase de testes</span>
              <span style={{ fontSize: "10.5pt", lineHeight: 1.3 }}>
                O sistema está em <b>fase de testes por 60 dias</b>. Encontrou algum problema ou tem sugestão? Fale com o gestor do programa.
              </span>
            </footer>
          </article>
        ))}
      </div>
    </div>
  );
}
