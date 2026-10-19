import { Icone } from "@/components/icone";
import { exigirGestor } from "@/lib/gestao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { BotaoImprimirCartaz } from "./imprimir";

// Cartaz A4 para colar ao lado do totem. Cada passo traz uma miniatura da tela real do totem,
// desenhada em vetor (sai nítida na impressão). Cores fixas e claras: imprime igual mesmo com a tela no modo escuro.

const COR = { tinta: "#14202a", suave: "#566673", linha: "#d3dbe0", fundo2: "#f4f6f7", acento: "#0d6466", tinte: "#dcecec", sinal: "#f3b21a", ruim: "#b23a2e", moldura: "#1d2830" };
const condensada = { fontFamily: "var(--font-barlow-condensed), 'Arial Narrow', sans-serif" };

// Moldura de "tablet" com a tela em miniatura.
function Tela({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex shrink-0 flex-col overflow-hidden"
      style={{ width: "30mm", height: "40mm", borderRadius: "3mm", border: `1.4mm solid ${COR.moldura}`, background: "#fff", padding: "1.6mm", gap: "1.2mm", fontSize: "5.5pt", lineHeight: 1.15, color: COR.tinta }}
    >
      {children}
    </div>
  );
}

const Barra = ({ w = "100%", c = COR.linha }: { w?: string; c?: string }) => <span style={{ display: "block", height: "1mm", width: w, background: c, borderRadius: "0.5mm" }} />;
const Titulo = ({ t }: { t: string }) => (
  <b style={{ ...condensada, fontSize: "8pt", lineHeight: 1 }}>{t}</b>
);

function TelaEntrar() {
  return (
    <Tela>
      <Titulo t="Tem uma ideia?" />
      <div style={{ border: `0.5mm dashed ${COR.acento}`, borderRadius: "1.5mm", height: "13mm", display: "grid", placeItems: "center", color: COR.acento }}>
        <Icone nome="qr" tamanho={26} />
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: "1mm" }}>
        {[1, 1, 0, 0].map((x, k) => (
          <span key={k} style={{ width: "1.8mm", height: "1.8mm", borderRadius: "50%", border: `0.35mm solid ${COR.tinta}`, background: x ? COR.tinta : "transparent" }} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "0.7mm" }}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "OK"].map((k) => (
          <span key={k} style={{ textAlign: "center", borderRadius: "0.8mm", background: k === "OK" ? COR.sinal : COR.fundo2, fontWeight: 700, padding: "0.3mm 0" }}>
            {k}
          </span>
        ))}
      </div>
    </Tela>
  );
}

function TelaNovaIdeia() {
  return (
    <Tela>
      <Titulo t="Bom trabalho!" />
      <span style={{ color: COR.suave }}>Usinagem · 40 pontos</span>
      <span style={{ background: COR.sinal, borderRadius: "1.5mm", padding: "2mm 1.5mm", display: "flex", alignItems: "center", gap: "1mm", ...condensada, fontWeight: 700, fontSize: "8.5pt" }}>
        <Icone nome="lampada" tamanho={13} /> Nova ideia
      </span>
      <span style={{ border: `0.3mm solid ${COR.linha}`, background: COR.fundo2, borderRadius: "1.5mm", padding: "1.4mm", ...condensada, fontWeight: 700, fontSize: "6.5pt" }}>Minhas ideias</span>
      <span style={{ border: `0.3mm solid ${COR.linha}`, background: COR.fundo2, borderRadius: "1.5mm", padding: "1.4mm", ...condensada, fontWeight: 700, fontSize: "6.5pt" }}>Mural e ranking</span>
    </Tela>
  );
}

function TelaMostre() {
  const botao = (icone: string, t: string, largo = false) => (
    <span
      style={{ gridColumn: largo ? "span 2" : undefined, border: `0.35mm dashed ${COR.linha}`, background: COR.fundo2, borderRadius: "1.2mm", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5mm", padding: "1.2mm 0.5mm", fontWeight: 700 }}
    >
      <Icone nome={icone} tamanho={12} />
      {t}
    </span>
  );
  return (
    <Tela>
      <Barra c={COR.acento} w="40%" />
      <Titulo t="O que você viu?" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1mm" }}>
        {botao("camera", "Tirar foto")}
        {botao("video", "Gravar vídeo")}
        {botao("galeria", "Da galeria", true)}
      </div>
      <span style={{ marginTop: "auto", background: COR.sinal, borderRadius: "1mm", textAlign: "center", fontWeight: 700, padding: "0.8mm" }}>Próximo</span>
    </Tela>
  );
}

function TelaConte() {
  return (
    <Tela>
      <Barra c={COR.acento} w="60%" />
      <Titulo t="Conte sua ideia" />
      <span style={{ alignSelf: "center", width: "13mm", height: "13mm", borderRadius: "50%", background: COR.ruim, color: "#fff", display: "grid", placeItems: "center", fontWeight: 700 }}>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Icone nome="microfone" tamanho={12} />
          Gravar
        </span>
      </span>
      <span style={{ border: `0.3mm solid ${COR.linha}`, borderRadius: "1mm", padding: "1mm", color: COR.suave }}>Ou escreva aqui…</span>
      <span style={{ marginTop: "auto", background: COR.sinal, borderRadius: "1mm", textAlign: "center", fontWeight: 700, padding: "0.8mm" }}>Próximo</span>
    </Tela>
  );
}

function TelaEscolha() {
  const cats = ["seguranca", "qualidade", "produtividade", "material", "organizacao", "ergonomia"];
  return (
    <Tela>
      <Barra c={COR.acento} w="80%" />
      <Titulo t="Onde e sobre o quê?" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.7mm" }}>
        {["Usinagem", "Pintura"].map((s, k) => (
          <span key={s} style={{ border: `0.35mm solid ${k ? COR.linha : COR.acento}`, background: k ? COR.fundo2 : COR.tinte, borderRadius: "0.8mm", textAlign: "center", fontWeight: 700, padding: "0.5mm" }}>
            {s}
          </span>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "0.7mm" }}>
        {cats.map((c, k) => (
          <span key={c} style={{ border: `0.35mm solid ${k === 1 ? COR.acento : COR.linha}`, background: k === 1 ? COR.tinte : COR.fundo2, borderRadius: "0.8mm", display: "grid", placeItems: "center", padding: "0.6mm 0" }}>
            <Icone nome={c} tamanho={10} />
          </span>
        ))}
      </div>
      <span style={{ border: `0.35mm solid ${COR.acento}`, background: COR.tinte, borderRadius: "0.8mm", padding: "0.6mm", fontWeight: 700 }}>Com meu nome · Anônimo</span>
    </Tela>
  );
}

function TelaProtocolo() {
  return (
    <Tela>
      <span style={{ alignSelf: "center", background: "#e1f1e7", color: "#2b7a4b", borderRadius: "3mm", padding: "0.4mm 2mm", fontWeight: 700 }}>Ideia enviada</span>
      <span style={{ textAlign: "center", fontWeight: 600 }}>Guarde seu protocolo:</span>
      <b style={{ textAlign: "center", fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: "7.5pt", color: COR.acento }}>ITL-2026-0012</b>
      <span style={{ textAlign: "center", color: COR.suave }}>O comitê responde até sex, 23/10</span>
      <div style={{ marginTop: "auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8mm" }}>
        <span style={{ background: COR.fundo2, border: `0.3mm solid ${COR.linha}`, borderRadius: "1mm", textAlign: "center", padding: "0.8mm", fontWeight: 700 }}>Minhas ideias</span>
        <span style={{ background: COR.sinal, borderRadius: "1mm", textAlign: "center", padding: "0.8mm", fontWeight: 700 }}>Sair</span>
      </div>
    </Tela>
  );
}

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
