"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";

export type Resultado = { ok: boolean; mensagem: string } | null;

const CRITERIOS = ["impacto", "ganho", "facilidade", "abrangencia"];

// Monta a decisão a partir do formulário e chama a função do banco, que valida todas as regras
// (notas, teto, avaliador de fora da linha, campos obrigatórios) e avisa o autor.
export async function decidir(_: Resultado, form: FormData): Promise<Resultado> {
  const id = String(form.get("id") ?? "");
  const decisao = String(form.get("decisao") ?? "");
  if (!decisao) return { ok: false, mensagem: "Escolha uma decisão." };

  const notas = Object.fromEntries(CRITERIOS.map((c) => [c, Number(form.get(`nota_${c}`) ?? 0)]));
  const avaliadores = form.getAll("avaliadores").map(String);
  const texto = (k: string) => String(form.get(k) ?? "").trim();
  const dados = {
    custo: texto("custo").replace(/\./g, "").replace(",", "."),
    responsavel: texto("responsavel"),
    muda_layout: form.get("muda_layout") === "on",
    parada_longa: form.get("parada_longa") === "on",
    motivo: texto(decisao === "engenharia" ? "motivo_eng" : decisao === "espera" ? "motivo_espera" : "motivo_reprova"),
    pergunta: texto("pergunta"),
    revisao: texto("revisao"),
    frase: texto("frase"),
    aproveita: texto("aproveita"),
  };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("decidir_triagem", {
    p_ideia: id,
    p_decisao: decisao,
    p_notas: notas,
    p_avaliadores: avaliadores,
    p_dados: dados,
  });
  if (error) return { ok: false, mensagem: error.message };
  revalidatePath(`/gestor/ideias/${id}`);
  revalidatePath("/gestor/fila");
  return { ok: true, mensagem: String(data) };
}

export async function retomar(form: FormData) {
  const id = String(form.get("id") ?? "");
  const supabase = await criarClienteServidor();
  await supabase.rpc("retomar_ideia", { p_ideia: id });
  revalidatePath(`/gestor/ideias/${id}`);
  revalidatePath("/gestor/fila");
}
