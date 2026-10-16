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

// Etiqueta de máquina: o QR guarda um endereço (…/m/<código>), para que a câmera comum do
// celular também abra o sistema. Aceita ainda o formato curto KZM:<código>.
export function lerMaquina(texto: string): string | null {
  const m = texto.trim().match(/(?:\/m\/|^kzm:)([0-9a-f]{24})\/?$/i);
  return m ? m[1].toLowerCase() : null;
}

export function enderecoMaquina(origem: string, codigo: string) {
  return `${origem.replace(/\/$/, "")}/m/${codigo}`;
}
