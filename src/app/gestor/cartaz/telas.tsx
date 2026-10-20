import { Icone } from "@/components/icone";

// Miniaturas das telas do totem, desenhadas em vetor (saem nítidas na impressão). Usadas nos cartazes A4.
// Cores fixas e claras: imprime igual mesmo com a tela no modo escuro.

export const COR = { tinta: "#14202a", suave: "#566673", linha: "#d3dbe0", fundo2: "#f4f6f7", acento: "#0d6466", tinte: "#dcecec", sinal: "#f3b21a", ruim: "#b23a2e", moldura: "#1d2830" };
export const condensada = { fontFamily: "var(--font-barlow-condensed), 'Arial Narrow', sans-serif" };

// Moldura de "tablet" com a tela em miniatura.
export function Tela({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex shrink-0 flex-col overflow-hidden"
      style={{ width: "30mm", height: "40mm", borderRadius: "3mm", border: `1.4mm solid ${COR.moldura}`, background: "#fff", padding: "1.6mm", gap: "1.2mm", fontSize: "5.5pt", lineHeight: 1.15, color: COR.tinta }}
    >
      {children}
    </div>
  );
}

export const Barra = ({ w = "100%", c = COR.linha }: { w?: string; c?: string }) => <span style={{ display: "block", height: "1mm", width: w, background: c, borderRadius: "0.5mm" }} />;
export const Titulo = ({ t }: { t: string }) => (
  <b style={{ ...condensada, fontSize: "8pt", lineHeight: 1 }}>{t}</b>
);

export function TelaEntrar() {
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

export function TelaNovaIdeia() {
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

export function TelaMostre() {
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

export function TelaConte() {
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

export function TelaEscolha() {
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

export function TelaProtocolo() {
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

// Totem logo depois de ler a etiqueta da máquina: pede o adesivo pessoal.
export function TelaMaquinaLida({ maquina }: { maquina: string }) {
  return (
    <Tela>
      <Titulo t="Tem uma ideia?" />
      <span style={{ background: "#e3eef7", color: "#24578a", borderRadius: "1mm", padding: "0.8mm 1mm", fontWeight: 700 }}>
        {maquina} lida. Agora mostre seu adesivo.
      </span>
      <div style={{ flex: 1, border: `0.5mm dashed ${COR.acento}`, borderRadius: "1.5mm", display: "grid", placeItems: "center", color: COR.acento }}>
        <Icone nome="qr" tamanho={26} />
      </div>
    </Tela>
  );
}
