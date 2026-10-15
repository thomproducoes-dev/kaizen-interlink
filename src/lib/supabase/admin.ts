import { createClient } from "@supabase/supabase-js";

// Cliente com a chave secreta: ignora o RLS. Use APENAS no servidor e só para
// operações que o usuário não pode fazer por conta própria (ex.: verificar adesivo QR + PIN).
export function criarClienteAdmin() {
  if (typeof window !== "undefined") {
    throw new Error("criarClienteAdmin só pode ser usado no servidor.");
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
