import { createBrowserClient } from "@supabase/ssr";

// Cliente para componentes que rodam no navegador. Usa a chave pública: o acesso
// aos dados é limitado pelas políticas de RLS do banco.
export function criarClienteNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
