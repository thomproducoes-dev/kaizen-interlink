"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";

export type Resultado = { ok: boolean; mensagem: string } | null;

const PAPEIS_PERMITIDOS = ["colaborador", "encarregado", "comite", "engenharia", "gestor", "rh"];

// Mensagens do banco (ex.: PIN fácil demais) já vêm em português; o resto vira mensagem genérica.
function traduzir(msg: string) {
  if (msg.includes("duplicate key") && msg.includes("matricula")) return "Já existe um colaborador com essa matrícula.";
  if (msg.includes("PIN") || msg.includes("permissão") || msg.includes("não encontrado")) return msg;
  return "Não foi possível salvar. Tente de novo.";
}

// Mesma regra do banco (definir_pin): 4 números, sem repetidos nem sequências óbvias.
function validarPin(pin: string): string | null {
  if (!/^\d{4}$/.test(pin)) return "O PIN deve ter 4 números.";
  if (/^(\d)\1{3}$/.test(pin) || ["1234", "4321", "0123", "9876"].includes(pin)) {
    return "PIN fácil demais. Evite números repetidos ou em sequência.";
  }
  return null;
}

export async function sair() {
  const supabase = await criarClienteServidor();
  await supabase.auth.signOut();
  redirect("/entrar");
}

export async function criarColaborador(_: Resultado, form: FormData): Promise<Resultado> {
  const nome = String(form.get("nome") ?? "").trim();
  const matricula = String(form.get("matricula") ?? "").trim();
  const setorId = String(form.get("setor_id") ?? "") || null;
  const pin = String(form.get("pin") ?? "").trim();
  const papeis = form.getAll("papeis").map(String).filter((p) => PAPEIS_PERMITIDOS.includes(p));

  if (nome.length < 3) return { ok: false, mensagem: "Informe o nome completo." };
  if (!matricula) return { ok: false, mensagem: "Informe a matrícula." };
  const erroPinInicial = validarPin(pin);
  if (erroPinInicial) return { ok: false, mensagem: erroPinInicial };

  const supabase = await criarClienteServidor();
  const { data: empresaId } = await supabase.rpc("minha_empresa");
  if (!empresaId) return { ok: false, mensagem: "Sessão expirada. Entre de novo." };

  const { data: novo, error } = await supabase
    .from("colaboradores")
    .insert({ empresa_id: empresaId, nome, matricula, setor_id: setorId })
    .select("id")
    .single();
  if (error || !novo) return { ok: false, mensagem: traduzir(error?.message ?? "") };

  const { error: erroPin } = await supabase.rpc("definir_pin", { p_colaborador: novo.id, p_pin: pin });
  if (erroPin) {
    // Sem PIN válido o cadastro não serve no totem: desfaz desativando, e o gestor tenta de novo.
    await supabase.from("colaboradores").update({ ativo: false, matricula: `${matricula}-cancelado-${Date.now()}` }).eq("id", novo.id);
    return { ok: false, mensagem: traduzir(erroPin.message) };
  }

  const lista = Array.from(new Set(["colaborador", ...papeis]));
  const { error: erroPapeis } = await supabase
    .from("colaborador_papeis")
    .insert(lista.map((papel) => ({ colaborador_id: novo.id, papel })));
  if (erroPapeis) return { ok: false, mensagem: "Colaborador criado, mas os papéis não foram salvos. Edite os papéis na lista." };

  revalidatePath("/gestor/colaboradores");
  return { ok: true, mensagem: `${nome} cadastrado. O adesivo já está disponível para impressão.` };
}

export async function redefinirPin(_: Resultado, form: FormData): Promise<Resultado> {
  const id = String(form.get("id") ?? "");
  const pin = String(form.get("pin") ?? "").trim();
  const erroValidacao = validarPin(pin);
  if (erroValidacao) return { ok: false, mensagem: erroValidacao };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("definir_pin", { p_colaborador: id, p_pin: pin });
  if (error) return { ok: false, mensagem: traduzir(error.message) };
  revalidatePath("/gestor/colaboradores");
  return { ok: true, mensagem: "PIN redefinido e adesivo desbloqueado." };
}

export async function novoAdesivo(form: FormData) {
  const id = String(form.get("id") ?? "");
  const supabase = await criarClienteServidor();
  await supabase.rpc("gerar_qr", { p_colaborador: id });
  revalidatePath("/gestor/colaboradores");
  revalidatePath("/gestor/adesivos");
}

export async function alternarAtivo(form: FormData) {
  const id = String(form.get("id") ?? "");
  const ativo = form.get("ativo") === "true";
  const supabase = await criarClienteServidor();
  await supabase.from("colaboradores").update({ ativo: !ativo }).eq("id", id);
  revalidatePath("/gestor/colaboradores");
}

export async function criarMaquina(_: Resultado, form: FormData): Promise<Resultado> {
  const nome = String(form.get("nome") ?? "").trim();
  const setorId = String(form.get("setor_id") ?? "");
  if (nome.length < 2) return { ok: false, mensagem: "Informe o nome da máquina ou posto." };
  if (!setorId) return { ok: false, mensagem: "Escolha o setor." };
  const supabase = await criarClienteServidor();
  const { data: empresaId } = await supabase.rpc("minha_empresa");
  const { error } = await supabase.from("maquinas").insert({ empresa_id: empresaId, setor_id: setorId, nome });
  if (error) return { ok: false, mensagem: "Não foi possível salvar. Tente de novo." };
  revalidatePath("/gestor/maquinas");
  return { ok: true, mensagem: `${nome} cadastrada. A etiqueta já está disponível para impressão.` };
}

export async function alternarMaquina(form: FormData) {
  const id = String(form.get("id") ?? "");
  const ativa = form.get("ativa") === "true";
  const supabase = await criarClienteServidor();
  await supabase.from("maquinas").update({ ativa: !ativa }).eq("id", id);
  revalidatePath("/gestor/maquinas");
}

export async function salvarPapeis(form: FormData) {
  const id = String(form.get("id") ?? "");
  const papeis = form.getAll("papeis").map(String).filter((p) => PAPEIS_PERMITIDOS.includes(p));
  const supabase = await criarClienteServidor();
  const desejados = new Set(["colaborador", ...papeis]);
  const { data: atuais } = await supabase.from("colaborador_papeis").select("papel").eq("colaborador_id", id);
  const atuaisSet = new Set((atuais ?? []).map((p) => p.papel as string));
  const remover = [...atuaisSet].filter((p) => !desejados.has(p) && p !== "admin");
  const incluir = [...desejados].filter((p) => !atuaisSet.has(p));
  if (remover.length) await supabase.from("colaborador_papeis").delete().eq("colaborador_id", id).in("papel", remover);
  if (incluir.length) await supabase.from("colaborador_papeis").insert(incluir.map((papel) => ({ colaborador_id: id, papel })));
  revalidatePath("/gestor/colaboradores");
}

// Valores unitários do cálculo de ganho e teto da triagem (Fase 0, seções 5 e 10).
export async function salvarConfiguracoes(_: Resultado, form: FormData): Promise<Resultado> {
  const ler = (k: string): number | null | "erro" => {
    const s = String(form.get(k) ?? "").trim();
    if (!s) return null;
    const n = parseFloat(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
    return isFinite(n) && n >= 0 ? n : "erro";
  };
  const valores = Object.fromEntries(["custo_minuto", "hora_homem", "m2_chapa", "kwh"].map((k) => [k, ler(k)]));
  const teto = ler("teto");
  if (Object.values(valores).includes("erro") || teto === "erro") return { ok: false, mensagem: "Use apenas números, com vírgula para os centavos." };
  if (teto == null) return { ok: false, mensagem: "Informe o teto para implantação direta." };
  const limite = parseInt(String(form.get("limite_mensal") ?? ""), 10);
  if (!(limite >= 1 && limite <= 100)) return { ok: false, mensagem: "O limite mensal deve ficar entre 1 e 100 ideias." };

  const supabase = await criarClienteServidor();
  const { data: emp } = await supabase.from("empresas").select("id, config").single();
  if (!emp) return { ok: false, mensagem: "Empresa não encontrada." };
  const atual = emp.config as Record<string, unknown> & { pontos?: Record<string, unknown> };
  const config = { ...atual, valores_unitarios: valores, teto_implantacao_direta: teto, pontos: { ...(atual.pontos ?? {}), limite_mensal: limite } };
  const { error } = await supabase.from("empresas").update({ config }).eq("id", emp.id);
  if (error) return { ok: false, mensagem: "Não foi possível salvar. Tente de novo." };
  revalidatePath("/gestor/configuracoes");
  return { ok: true, mensagem: "Configurações salvas." };
}

// Feriados e férias coletivas: o relógio de prazos não conta esses dias (Fase 0, seção 4).
// Feriados nacionais (Lei 662/1949, Lei 14.759/2023) e datas móveis, calculadas a partir da Páscoa.
const FERIADOS_NACIONAIS: Record<number, [string, string][]> = {
  2026: [
    ["2026-01-01", "Confraternização Universal"], ["2026-02-16", "Carnaval (ponto facultativo)"], ["2026-02-17", "Carnaval (ponto facultativo)"],
    ["2026-04-03", "Sexta-feira Santa"], ["2026-04-21", "Tiradentes"], ["2026-05-01", "Dia do Trabalho"],
    ["2026-06-04", "Corpus Christi (ponto facultativo)"], ["2026-09-07", "Independência"], ["2026-10-12", "Nossa Senhora Aparecida"],
    ["2026-11-02", "Finados"], ["2026-11-15", "Proclamação da República"], ["2026-11-20", "Dia da Consciência Negra"], ["2026-12-25", "Natal"],
  ],
  2027: [
    ["2027-01-01", "Confraternização Universal"], ["2027-02-08", "Carnaval (ponto facultativo)"], ["2027-02-09", "Carnaval (ponto facultativo)"],
    ["2027-03-26", "Sexta-feira Santa"], ["2027-04-21", "Tiradentes"], ["2027-05-01", "Dia do Trabalho"],
    ["2027-05-27", "Corpus Christi (ponto facultativo)"], ["2027-09-07", "Independência"], ["2027-10-12", "Nossa Senhora Aparecida"],
    ["2027-11-02", "Finados"], ["2027-11-15", "Proclamação da República"], ["2027-11-20", "Dia da Consciência Negra"], ["2027-12-25", "Natal"],
  ],
};

export async function adicionarFeriado(_: Resultado, form: FormData): Promise<Resultado> {
  const data = String(form.get("data") ?? "");
  const descricao = String(form.get("descricao") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { ok: false, mensagem: "Escolha a data." };
  if (!descricao) return { ok: false, mensagem: "Descreva o feriado ou a folga (ex.: Aniversário de São Bento do Sul)." };
  const supabase = await criarClienteServidor();
  const { data: empresaId } = await supabase.rpc("minha_empresa");
  const { error } = await supabase.from("feriados").upsert({ empresa_id: empresaId, data, descricao }, { onConflict: "empresa_id,data" });
  if (error) return { ok: false, mensagem: "Não foi possível salvar. Tente de novo." };
  revalidatePath("/gestor/configuracoes");
  return { ok: true, mensagem: "Data salva. O relógio de prazos já desconta este dia." };
}

export async function importarFeriadosNacionais(form: FormData) {
  const ano = Number(form.get("ano"));
  const lista = FERIADOS_NACIONAIS[ano];
  if (!lista) return;
  const supabase = await criarClienteServidor();
  const { data: empresaId } = await supabase.rpc("minha_empresa");
  await supabase
    .from("feriados")
    .upsert(lista.map(([data, descricao]) => ({ empresa_id: empresaId, data, descricao })), { onConflict: "empresa_id,data", ignoreDuplicates: true });
  revalidatePath("/gestor/configuracoes");
}

export async function removerFeriado(form: FormData) {
  const data = String(form.get("data") ?? "");
  const supabase = await criarClienteServidor();
  await supabase.from("feriados").delete().eq("data", data);
  revalidatePath("/gestor/configuracoes");
}
