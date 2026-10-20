import { Icone } from "@/components/icone";
import { exigirGestor } from "@/lib/gestao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { BotaoImprimirCartaz } from "./imprimir";
import { COR, TelaConte, TelaEntrar, TelaEscolha, TelaMostre, TelaNovaIdeia, TelaProtocolo, condensada } from "./telas";

// Cartaz A4 para colar ao lado do totem. Cada passo traz uma miniatura da tela real do totem (telas.tsx).

const PASSOS = [
  { n: 1, titulo: "Entre", texto: "Mostre seu adesivo QR para a câmera e digite seu PIN de 4 números.", tela: <TelaEntrar /> },
  { n: 2, titulo: "Toque em Nova ideia", texto: "O botão amarelo. Leva menos de 2 minutos e não precisa escrever.", tela: <TelaNovaIdeia /> },
  { n: 3, titulo: "Mostre", texto: "Tire foto ou grave um vídeo curto (até 30 s) do problema ou do local.", tela: <TelaMostre /> },
  { n: 4, titulo: "Conte", texto: "Toque no botão vermelho e explique como contaria para um colega.", tela: <TelaConte /> },
  { n: 5, titulo: "Escolha", texto: "Setor, máquina e tipo de melhoria. Pode enviar com seu nome ou anônimo.", tela: <TelaEscolha /> },
  { n: 6, titulo: "Guarde o protocolo", texto: "Acompanhe as respostas do comitê em Minhas ideias.", tela: <TelaProtocolo /> },
];

export default async function Cartaz() {
  const supabase = await criarClienteServidor();
  await exigirGestor(supabase);
  const { data: empresa } = await supabase.from("empresas").select("nome, config").single();
  const cfg = (empresa?.config ?? {}) as { sla?: { triagem?: { prazo?: number } } };
  const prazo = cfg.sla?.triagem?.prazo ?? 5;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-full flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="font-display text-4xl font-bold">Cartaz do totem</h1>
          <p className="text-muted">Imprima em A4, na vertical, com escala 100% e margens “Nenhuma”, e cole ao lado do totem.</p>
        </div>
        <BotaoImprimirCartaz />
      </div>

      <div className="max-w-full overflow-x-auto print:overflow-visible">
        <article
          className="folha flex flex-col shadow-lg print:shadow-none"
          style={{ width: "210mm", height: "297mm", background: "#fff", color: COR.tinta, fontFamily: "var(--font-barlow), Arial, sans-serif" }}
        >
          <header style={{ background: COR.sinal, color: "#1c1400", padding: "11mm 15mm 10mm", display: "flex", flexDirection: "column", gap: "2.5mm" }}>
            <span style={{ fontSize: "12pt", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" }}>Kaizen 4.0 · {empresa?.nome ?? ""}</span>
            <h2 style={{ ...condensada, fontSize: "42pt", fontWeight: 700, lineHeight: 0.95, margin: 0 }}>Tem uma ideia de melhoria? Conte para a gente aqui.</h2>
          </header>

          <ol style={{ listStyle: "none", margin: 0, padding: "8mm 12mm 4mm", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5mm 8mm" }}>
            {PASSOS.map((p) => (
              <li key={p.n} style={{ display: "flex", gap: "4mm", alignItems: "center" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "1.8mm", flex: 1, minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "2.5mm" }}>
                    <span style={{ ...condensada, width: "12mm", height: "12mm", borderRadius: "50%", background: COR.acento, color: "#fff", display: "grid", placeItems: "center", fontSize: "20pt", fontWeight: 700, flexShrink: 0 }}>
                      {p.n}
                    </span>
                    <span style={{ ...condensada, fontSize: "17pt", fontWeight: 700, lineHeight: 1.05 }}>{p.titulo}</span>
                  </span>
                  <span style={{ fontSize: "11.5pt", lineHeight: 1.3, color: "#3a4a56" }}>{p.texto}</span>
                </div>
                {p.tela}
              </li>
            ))}
          </ol>

          <section style={{ margin: "3mm 12mm 0", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "3mm", textAlign: "center" }}>
            {[
              [`${prazo} dias úteis`, "para o comitê responder. Toda ideia recebe resposta."],
              ["Sem medo", "você pode enviar de forma anônima"],
              ["Vale ponto", "a cada ideia aceita e quando ela vira padrão"],
            ].map(([t, d]) => (
              <div key={t} style={{ background: COR.tinte, borderRadius: "3mm", padding: "4mm 3mm" }}>
                <b style={{ ...condensada, display: "block", fontSize: "20pt", lineHeight: 1 }}>{t}</b>
                <span style={{ fontSize: "10.5pt" }}>{d}</span>
              </div>
            ))}
          </section>

          <section style={{ margin: "5mm 12mm 0", background: COR.acento, color: "#fff", borderRadius: "3mm", padding: "5mm 6mm", display: "flex", alignItems: "center", gap: "5mm" }}>
            <Icone nome="lampada" tamanho={44} />
            <div>
              <b style={{ ...condensada, display: "block", fontSize: "26pt", lineHeight: 1 }}>Seus pontos podem virar prêmios. Aguarde!</b>
              <span style={{ fontSize: "11pt", opacity: 0.9 }}>Acompanhe seus pontos e o ranking na tela inicial do totem.</span>
            </div>
          </section>

          <footer style={{ margin: "auto 12mm 9mm", border: `0.6mm dashed ${COR.sinal}`, borderRadius: "3mm", padding: "3.5mm 5mm", display: "flex", alignItems: "center", gap: "4mm" }}>
            <span style={{ ...condensada, background: COR.sinal, color: "#1c1400", borderRadius: "2mm", padding: "1mm 3mm", fontSize: "13pt", fontWeight: 700, whiteSpace: "nowrap" }}>Fase de testes</span>
            <span style={{ fontSize: "11pt", lineHeight: 1.3 }}>
              O sistema está em <b>fase de testes por 60 dias</b>. Encontrou algum problema ou tem sugestão? Fale com o gestor do programa.
            </span>
          </footer>
        </article>
      </div>
    </div>
  );
}
