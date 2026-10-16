// Vocabulário das ideias, igual ao do banco (enums) e ao da Fase 0.

export const CATEGORIAS = [
  { k: "seguranca", n: "Segurança", icone: "seguranca" },
  { k: "qualidade", n: "Qualidade", icone: "qualidade" },
  { k: "produtividade", n: "Produtividade", icone: "produtividade" },
  { k: "material", n: "Desperdício de material", icone: "material" },
  { k: "organizacao", n: "Organização (5S)", icone: "organizacao" },
  { k: "ergonomia", n: "Ergonomia", icone: "ergonomia" },
  { k: "ambiente", n: "Meio ambiente e energia", icone: "ambiente" },
  { k: "outros", n: "Outros", icone: "outros" },
] as const;

export type Categoria = (typeof CATEGORIAS)[number]["k"];

export const nomeCategoria = (k: string) => CATEGORIAS.find((c) => c.k === k)?.n ?? k;

export type Tom = "info" | "warn" | "muted" | "good" | "bad" | "accent";

export const STATUS: Record<string, { n: string; tom: Tom }> = {
  em_triagem: { n: "Em triagem", tom: "info" },
  aguardando_autor: { n: "Aguardando autor", tom: "warn" },
  em_espera: { n: "Em espera", tom: "muted" },
  aprovada: { n: "Aprovada", tom: "good" },
  em_viabilidade: { n: "Em viabilidade", tom: "info" },
  reprovada: { n: "Reprovada", tom: "bad" },
  em_implantacao: { n: "Em implantação", tom: "good" },
  padronizando: { n: "Padronizando", tom: "good" },
  padronizada: { n: "Padronizada", tom: "accent" },
};

export const CLASSE_TOM: Record<Tom, string> = {
  info: "bg-info-bg text-info",
  warn: "bg-warn-bg text-warn",
  muted: "bg-surface-2 text-muted border border-line",
  good: "bg-good-bg text-good",
  bad: "bg-bad-bg text-bad",
  accent: "bg-accent text-accent-ink",
};

export type Modo = "identificado" | "reservado" | "anonimo";

export const MODOS: { k: Modo; n: string; d: string }[] = [
  { k: "identificado", n: "Com meu nome", d: "O comitê vê seu nome. Você pontua e aparece no ranking." },
  { k: "reservado", n: "Reservado", d: "Aparece como “colaborador do setor” até a aprovação. Depois você decide se mostra o nome." },
  { k: "anonimo", n: "Anônimo", d: "Ninguém vê seu nome. Os pontos ficam guardados e o RH entrega o prêmio se você pedir." },
];

// Nome mostrado conforme o modo de identidade escolhido pelo autor (Fase 0, seção 6).
export function rotuloAutor(i: { modo: string; autor: { nome: string } | null; setores: { nome: string } | null }) {
  if (i.modo === "anonimo") return "Anônimo";
  if (i.modo === "reservado") return `Colaborador de ${i.setores?.nome ?? "setor"}`;
  return i.autor?.nome ?? "—";
}

export const formatarData =(iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "";

export const formatarDataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;
