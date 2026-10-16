// Conteúdo gravado no adesivo QR do colaborador: prefixo + token.
// O prefixo separa adesivos de pessoas (KZ1) das etiquetas de máquinas (KZM), que virão na Entrega 2.
export const PREFIXO_ADESIVO = "KZ1:";

export function conteudoAdesivo(token: string) {
  return `${PREFIXO_ADESIVO}${token}`;
}

// Aceita o texto lido pela câmera, por leitor USB ou digitado. Devolve o token ou null.
export function lerAdesivo(texto: string): string | null {
  const limpo = texto.trim().toLowerCase().replace(/^kz1:/, "");
  return /^[0-9a-f]{32}$/.test(limpo) ? limpo : null;
}
