import type { SupabaseClient } from "@supabase/supabase-js";

// Dados que o totem carrega logo após a entrada do colaborador.
export type Contexto = {
  eu: { id: string; nome: string; setorId: string | null; empresaId: string };
  config: { maxAnexos: number; videoMax: number; videoSugerido: number; audioMax: number; logout: number };
  setores: { id: string; nome: string }[];
  maquinas: { id: string; nome: string; setorId: string; codigo: string }[];
  colegas: { id: string; nome: string; setorId: string | null }[];
  // Sessão própria da fila offline (vem do login do totem); sobrevive ao "Sair".
  filaSessao?: { access_token: string; refresh_token: string } | null;
};

export async function carregarContexto(sb: SupabaseClient): Promise<Contexto> {
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Sessão não encontrada.");

  const { data: eu, error } = await sb
    .from("colaboradores")
    .select("id, nome, setor_id, empresa_id")
    .eq("auth_user_id", user.id)
    .single();
  if (error || !eu) throw new Error("Colaborador não encontrado.");

  const [empresa, setores, maquinas, colegas] = await Promise.all([
    sb.from("empresas").select("config").single(),
    sb.from("setores").select("id, nome").eq("ativo", true).order("nome"),
    sb.from("maquinas").select("id, nome, setor_id, codigo_qr").eq("ativa", true).order("nome"),
    sb.from("colaboradores").select("id, nome, setor_id").eq("ativo", true).neq("id", eu.id).order("nome"),
  ]);

  const c = (empresa.data?.config ?? {}) as Record<string, number>;
  return {
    eu: { id: eu.id, nome: eu.nome, setorId: eu.setor_id, empresaId: eu.empresa_id },
    config: {
      maxAnexos: c.max_anexos ?? 6,
      // Limite real (aceito) e sugestão mostrada nas telas, que dá margem de segurança.
      videoMax: c.video_max_segundos ?? 35,
      videoSugerido: c.video_sugerido_segundos ?? 30,
      audioMax: c.audio_max_segundos ?? 120,
      logout: c.totem_logout_segundos ?? 60,
    },
    setores: setores.data ?? [],
    maquinas: (maquinas.data ?? []).map((m) => ({ id: m.id, nome: m.nome, setorId: m.setor_id, codigo: m.codigo_qr })),
    colegas: (colegas.data ?? []).map((p) => ({ id: p.id, nome: p.nome, setorId: p.setor_id })),
  };
}
