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

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
};

// Etapas depois da triagem (Fase 0, seções 10 e 11): viabilidade, início da implantação,
// verificação do ganho e padronização. O banco confere papéis, status e campos obrigatórios.
export async function avancarEtapa(_: Resultado, form: FormData): Promise<Resultado> {
  const id = String(form.get("id") ?? "");
  const etapa = String(form.get("etapa") ?? "");
  const t = (k: string) => String(form.get(k) ?? "").trim();
  const supabase = await criarClienteServidor();
  let resposta: { data: unknown; error: { message: string } | null };
  let mensagem = "";

  if (etapa === "viabilidade") {
    const decisao = t("decisao");
    let calculo: unknown = null;
    try {
      calculo = JSON.parse(t("calculo") || "null");
    } catch {
      calculo = null;
    }
    resposta = await supabase.rpc("decidir_viabilidade", {
      p_ideia: id,
      p_decisao: decisao,
      p_dados: {
        tipo: t("tipo"),
        ganho_anual: num(form.get("ganho_anual")),
        custo: num(form.get("custo")),
        prazo: t("prazo"),
        responsavel: t("responsavel"),
        calculo,
        motivo: decisao === "espera" ? t("motivo_espera") : t("motivo_reprova"),
        revisao: t("revisao"),
        frase: t("frase"),
        aproveita: t("aproveita"),
      },
    });
    mensagem = String(resposta.data ?? "");
  } else if (etapa === "inicio") {
    resposta = await supabase.rpc("iniciar_implantacao", { p_ideia: id, p_responsavel: t("responsavel"), p_prazo: Number(t("prazo") || 0) });
    mensagem = "Implantação iniciada. O autor foi avisado.";
  } else if (etapa === "verificacao") {
    resposta = await supabase.rpc("verificar_implantacao", {
      p_ideia: id,
      p_dados: { tipo: t("tipo"), linha_base: t("linha_base"), ganho_anual: num(form.get("ganho_anual")), descricao: t("descricao") },
    });
    mensagem = "Verificação registrada. Falta a padronização.";
  } else if (etapa === "padronizacao") {
    resposta = await supabase.rpc("padronizar_ideia", {
      p_ideia: id,
      p_dados: { sop: t("sop"), revisao: t("revisao"), difusao: form.get("difusao") === "on" },
    });
    mensagem = `Ideia padronizada. ${resposta.data ?? 0} pontos para cada autor.`;
  } else {
    return { ok: false, mensagem: "Etapa inválida." };
  }

  if (resposta.error) return { ok: false, mensagem: resposta.error.message };
  revalidatePath(`/gestor/ideias/${id}`);
  revalidatePath("/gestor/fila");
  return { ok: true, mensagem };
}

// Ajustes do gestor do programa (corrigir dados / reabrir etapa). Só o gestor; o banco confere e registra tudo.
export async function ajustar(_: Resultado, form: FormData): Promise<Resultado> {
  const id = String(form.get("id") ?? "");
  const campos = [
    "categoria", "setor_id", "maquina_id", "texto", "nota", "custo_estimado", "ganho_estimado", "ganho_verificado",
    "ganho_qualitativo", "linha_base", "sop_codigo", "sop_revisao", "responsavel_implantacao", "prazo_atual", "prazo_implantacao",
  ];
  const numericos = ["nota", "custo_estimado", "ganho_estimado", "ganho_verificado"];
  const dados = Object.fromEntries(
    campos.filter((c) => form.has(c)).map((c) => [c, numericos.includes(c) ? num(form.get(c)) : String(form.get(c) ?? "").trim()]),
  );
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("ajustar_ideia", {
    p_ideia: id,
    p_dados: dados,
    p_motivo: String(form.get("motivo") ?? ""),
    p_avisar: form.get("avisar") === "on",
  });
  if (error) return { ok: false, mensagem: error.message };
  revalidatePath(`/gestor/ideias/${id}`);
  revalidatePath("/gestor/fila");
  return { ok: true, mensagem: data ? `${data} campo${data === 1 ? "" : "s"} ajustado${data === 1 ? "" : "s"} e registrado${data === 1 ? "" : "s"}.` : "Nada mudou: os valores já eram esses." };
}

export async function reabrir(_: Resultado, form: FormData): Promise<Resultado> {
  const id = String(form.get("id") ?? "");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("reabrir_ideia", {
    p_ideia: id,
    p_para: String(form.get("para") ?? ""),
    p_motivo: String(form.get("motivo") ?? ""),
    p_avisar: form.get("avisar") === "on",
  });
  if (error) return { ok: false, mensagem: error.message };
  revalidatePath(`/gestor/ideias/${id}`);
  revalidatePath("/gestor/fila");
  return { ok: true, mensagem: "Etapa reaberta e registrada." };
}
