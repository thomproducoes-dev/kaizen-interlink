import { NextResponse } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";

// Destino do link de acesso enviado por e-mail: troca o código pela sessão.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const destino = next && next.startsWith("/") && !next.startsWith("//") ? next : "/gestor";

  if (code) {
    const supabase = await criarClienteServidor();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${destino}`);
    }
  }

  return NextResponse.redirect(`${origin}/entrar?erro=link`);
}
