// Mesma regra do banco (_pin_recusado): 4 números, sem repetidos nem sequências óbvias.
export function validarPin(pin: string): string | null {
  if (!/^\d{4}$/.test(pin)) return "O PIN deve ter 4 números.";
  if (/^(\d)\1{3}$/.test(pin) || ["1234", "4321", "0123", "9876"].includes(pin)) {
    return "PIN fácil demais. Evite números repetidos ou em sequência.";
  }
  return null;
}

// Respostas de /api/totem/entrar que pedem (ou recusam) o PIN próprio no primeiro acesso.
export const MENSAGEM_TROCA: Record<string, string> = {
  pin_fraco: "PIN fácil demais. Evite números repetidos ou em sequência.",
  pin_igual: "O novo PIN precisa ser diferente do provisório.",
};
