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

  revalidatePath("/gestor");
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
  revalidatePath("/gestor");
  return { ok: true, mensagem: "PIN redefinido e adesivo desbloqueado." };
}

export async function novoAdesivo(form: FormData) {
  const id = String(form.get("id") ?? "");
  const supabase = await criarClienteServidor();
  await supabase.rpc("gerar_qr", { p_colaborador: id });
  revalidatePath("/gestor");
  revalidatePath("/gestor/adesivos");
}

export async function alternarAtivo(form: FormData) {
  const id = String(form.get("id") ?? "");
  const ativo = form.get("ativo") === "true";
  const supabase = await criarClienteServidor();
  await supabase.from("colaboradores").update({ ativo: !ativo }).eq("id", id);
  revalidatePath("/gestor");
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
  revalidatePath("/gestor");
}
