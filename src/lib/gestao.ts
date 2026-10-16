import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

// Papéis que dão acesso à área da gestão (Fase 0, seção 2).
export const PAPEIS_GESTAO = ["comite", "engenharia", "encarregado", "gestor", "admin", "rh"];

export async function meusPapeis(sb: SupabaseClient): Promise<string[]> {
  const { data } = await sb.rpc("meus_papeis");
  return (data ?? []) as string[];
}

export const ehGestor = (papeis: string[]) => papeis.includes("gestor") || papeis.includes("admin");
export const decideTriagem = (papeis: string[]) => papeis.includes("comite") || ehGestor(papeis);

// Para páginas só do gestor do programa (cadastros, adesivos, máquinas).
export async function exigirGestor(sb: SupabaseClient) {
  const { data } = await sb.rpc("sou_gestor");
  if (!data) redirect("/gestor/fila");
}
