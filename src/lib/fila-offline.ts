"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { extensao, tipoBase } from "./midia";

// Fila de envio do totem (Fase 0, seção 7: "o envio fica na fila do aparelho e sobe quando a rede voltar").
// Cada ideia é guardada no IndexedDB do aparelho ANTES de tentar enviar. Se a rede cair, ela fica na fila
// com a sessão do autor e é enviada depois, mesmo que o autor já tenha saído do totem.
// O id da ideia é gerado aqui: reenviar a mesma ideia nunca cria duplicata.

export type DadosIdeia = {
  modo: "identificado" | "reservado" | "anonimo";
  setorId: string;
  maquinaId: string | null;
  categoria: string;
  texto: string;
  coautores: string[];
  canal: "totem" | "celular";
};

export type ArquivoFila = { tipo: "foto" | "video" | "audio"; blob: Blob; duracao?: number };

export type ItemFila = {
  id: string;
  criadoEm: number;
  empresaId: string;
  autorNome: string;
  sessao: { access_token: string; refresh_token: string };
  dados: DadosIdeia;
  arquivos: ArquivoFila[];
  tentativas: number;
  ultimoErro?: string;
};

type Sessao = ItemFila["sessao"];
type SessaoGuardada = Sessao & { usuario: string };

const BANCO = "kaizen-totem";
const LOJA = "fila";
// Sessão mais recente de cada autor com ideia na fila. A cada renovação o Supabase troca o
// refresh_token e invalida o anterior, então a versão nova precisa ficar guardada aqui.
const SESSOES = "sessoes";

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, falha) => {
    const req = indexedDB.open(BANCO, 2);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(LOJA)) req.result.createObjectStore(LOJA, { keyPath: "id" });
      if (!req.result.objectStoreNames.contains(SESSOES)) req.result.createObjectStore(SESSOES, { keyPath: "usuario" });
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => falha(req.error);
  });
}

async function transacao<T>(modo: IDBTransactionMode, fn: (loja: IDBObjectStore) => IDBRequest<T>, nome = LOJA): Promise<T> {
  const db = await abrir();
  try {
    return await new Promise<T>((ok, falha) => {
      const req = fn(db.transaction(nome, modo).objectStore(nome));
      req.onsuccess = () => ok(req.result);
      req.onerror = () => falha(req.error);
    });
  } finally {
    db.close();
  }
}

// Usuário dono da sessão, lido do próprio token (campo "sub").
function usuarioDe(s: Sessao): string {
  try {
    const parte = s.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(parte)).sub ?? "";
  } catch {
    return "";
  }
}

const guardarSessao = (s: Sessao) => transacao("readwrite", (l) => l.put({ ...s, usuario: usuarioDe(s) }), SESSOES);
const lerSessao = (usuario: string) => transacao<SessaoGuardada | undefined>("readonly", (l) => l.get(usuario), SESSOES);

export async function guardarNaFila(item: ItemFila) {
  await guardarSessao(item.sessao);
  return transacao("readwrite", (l) => l.put(item));
}
export const removerDaFila = (id: string) => transacao("readwrite", (l) => l.delete(id));
export const listarFila = () => transacao<ItemFila[]>("readonly", (l) => l.getAll() as IDBRequest<ItemFila[]>);

// Quando o autor entra de novo no totem, a sessão nova dele destrava ideias que ficaram presas.
export async function adotarSessaoDaFila(s: Sessao) {
  const u = usuarioDe(s);
  if ((await listarFila()).some((i) => usuarioDe(i.sessao) === u)) await guardarSessao(s);
}

export function ehFalhaDeRede(e: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : String(e);
  return /fetch|network|load failed|timeout|ERR_/i.test(msg);
}

// Envia anexos e registra a ideia. Idempotente: se a ideia já existe, devolve o protocolo.
export async function enviarItem(
  sb: SupabaseClient,
  item: ItemFila,
  aoProgresso?: (feitos: number, total: number) => void,
): Promise<{ protocolo: string; prazo: string }> {
  const existente = await sb.from("ideias").select("protocolo, prazo_atual").eq("id", item.id).maybeSingle();
  if (existente.error) throw existente.error;
  if (existente.data) return { protocolo: existente.data.protocolo, prazo: existente.data.prazo_atual };

  const midias: { caminho: string; tipo: string; duracao_s: number | null; tamanho: number }[] = [];
  const total = item.arquivos.length;
  for (let i = 0; i < total; i++) {
    const a = item.arquivos[i];
    const tipo = tipoBase(a.blob.type) || (a.tipo === "foto" ? "image/jpeg" : a.tipo === "video" ? "video/mp4" : "audio/webm");
    const caminho = `${item.empresaId}/${item.id}/${i + 1}-${a.tipo}.${extensao(tipo)}`;
    const { error } = await sb.storage.from("ideias").upload(caminho, a.blob, { contentType: tipo, upsert: false });
    if (error && !/exist|duplicate/i.test(error.message)) throw error;
    midias.push({ caminho, tipo: a.tipo, duracao_s: a.duracao != null ? Math.round(a.duracao) : null, tamanho: a.blob.size });
    aoProgresso?.(i + 1, total);
  }

  const { data, error } = await sb.rpc("enviar_ideia", {
    p_id: item.id,
    p_modo: item.dados.modo,
    p_setor: item.dados.setorId,
    p_maquina: item.dados.maquinaId,
    p_categoria: item.dados.categoria,
    p_texto: item.dados.texto,
    p_coautores: item.dados.coautores,
    p_midias: midias,
    p_canal: item.dados.canal,
  });
  if (error) throw error;
  const r = (data as { protocolo: string; prazo: string }[])[0];
  return { protocolo: r.protocolo, prazo: r.prazo };
}

// Envia o que ficou na fila, cada item com a sessão do próprio autor, num cliente isolado
// (não interfere em quem estiver usando o totem agora).
export async function processarFila(): Promise<number> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return 0;
  let enviados = 0;
  for (const item of await listarFila()) {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    try {
      const guardada = await lerSessao(usuarioDe(item.sessao));
      const { data, error } = await sb.auth.setSession(guardada ?? item.sessao);
      if (error) throw error;
      // Se a sessão foi renovada, guarda já a versão nova (a antiga deixou de valer).
      if (data.session) await guardarSessao({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
      await enviarItem(sb, item);
      await removerDaFila(item.id);
      enviados++;
    } catch (e) {
      if (ehFalhaDeRede(e)) break;
      await guardarNaFila({ ...item, tentativas: item.tentativas + 1, ultimoErro: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) });
    }
  }
  return enviados;
}
