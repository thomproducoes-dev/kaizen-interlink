import { Icone } from "@/components/icone";
import { exigirGestor } from "@/lib/gestao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { BotaoImprimirCartaz } from "./imprimir";

// Cartaz A4 para colar ao lado do totem. Cores fixas (claras) para sair igual em qualquer impressora,
// mesmo quando a tela está no modo escuro.
const PASSOS = [
  { n: 1, icone: "qr", titulo: "Entre", texto: "Mostre seu adesivo para a câmera e digite seu PIN." },
  { n: 2, icone: "lampada", titulo: "Toque em Nova ideia", texto: "Leva menos de 2 minutos. Não precisa escrever." },
  { n: 3, icone: "camera", titulo: "Mostre", texto: "Tire foto ou grave um vídeo curto do problema ou do local." },
  { n: 4, icone: "microfone", titulo: "Conte", texto: "Grave um áudio explicando, como contaria para um colega." },
  { n: 5, icone: "organizacao", titulo: "Escolha", texto: "Setor, máquina e tipo de melhoria. Com seu nome, reservado ou anônimo." },
  { n: 6, icone: "lista", titulo: "Guarde o protocolo", texto: "Acompanhe as respostas do comitê em Minhas ideias." },
];

export default async function Cartaz() {
  const supabase = await criarClienteServidor();
  await exigirGestor(supabase);
  const { data: empresa } = await supabase.from("empresas").select("nome, config").single();
  const cfg = (empresa?.config ?? {}) as { sla?: { triagem?: { prazo?: number } }; pontos?: { limite_mensal?: number } };
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
          className="folha flex flex-col bg-white text-[#14202a] shadow-lg print:shadow-none"
          style={{ width: "210mm", height: "297mm", fontFamily: "var(--font-barlow), Arial, sans-serif" }}
        >
          <header className="flex flex-col gap-[3mm] bg-[#f3b21a] px-[15mm] py-[12mm] text-[#1c1400]">
            <span className="text-[13pt] font-semibold uppercase tracking-[0.12em]">Kaizen 4.0 · {empresa?.nome ?? ""}</span>
            <h2 className="font-display text-[44pt] font-bold leading-[0.95]" style={{ fontFamily: "var(--font-barlow-condensed), Arial Narrow, sans-serif" }}>
              Tem uma ideia de melhoria? Conte para a gente aqui.
            </h2>
          </header>

          <ol className="grid flex-1 grid-cols-2 gap-x-[10mm] gap-y-[8mm] px-[15mm] py-[12mm]">
            {PASSOS.map((p) => (
              <li key={p.n} className="flex gap-[5mm]">
                <span
                  className="grid h-[17mm] w-[17mm] shrink-0 place-items-center rounded-full bg-[#0d6466] text-[26pt] font-bold text-white"
                  style={{ fontFamily: "var(--font-barlow-condensed), Arial Narrow, sans-serif" }}
                >
                  {p.n}
                </span>
                <span className="flex flex-col gap-[1.5mm]">
                  <span className="flex items-center gap-[2mm] text-[19pt] font-bold leading-tight">
                    <Icone nome={p.icone} tamanho={26} className="shrink-0 text-[#0d6466]" />
                    {p.titulo}
                  </span>
                  <span className="text-[13pt] leading-snug text-[#3a4a56]">{p.texto}</span>
                </span>
              </li>
            ))}
          </ol>

          <section className="mx-[15mm] mb-[8mm] grid grid-cols-3 gap-[4mm] rounded-[4mm] bg-[#dcecec] p-[6mm] text-center">
            <div>
              <b className="block text-[24pt] leading-none" style={{ fontFamily: "var(--font-barlow-condensed), Arial Narrow, sans-serif" }}>
                {prazo} dias úteis
              </b>
              <span className="text-[11pt]">para o comitê responder</span>
            </div>
            <div>
              <b className="block text-[24pt] leading-none" style={{ fontFamily: "var(--font-barlow-condensed), Arial Narrow, sans-serif" }}>
                Pontos
              </b>
              <span className="text-[11pt]">a cada ideia aceita e quando ela vira padrão</span>
            </div>
            <div>
              <b className="block text-[24pt] leading-none" style={{ fontFamily: "var(--font-barlow-condensed), Arial Narrow, sans-serif" }}>
                Sem medo
              </b>
              <span className="text-[11pt]">você pode enviar de forma anônima</span>
            </div>
          </section>

          <footer className="flex items-center justify-between gap-[6mm] border-t-[0.4mm] border-[#d3dbe0] px-[15mm] py-[6mm] text-[11pt] text-[#566673]">
            <span>O totem sai sozinho depois de 60 segundos sem uso. Ao terminar, toque em Sair.</span>
            <span className="whitespace-nowrap">Dúvidas: gestor do programa</span>
          </footer>
        </article>
      </div>
    </div>
  );
}
