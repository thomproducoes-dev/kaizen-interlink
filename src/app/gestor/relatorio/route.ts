import { NextResponse } from "next/server";
import { STATUS, nomeCategoria } from "@/lib/ideias";
import { criarClienteServidor } from "@/lib/supabase/server";

// Relatório de inovação (Tarefa 9 do BPMN): ideias implantadas no período, com ganho, ROI e padrão.
// CSV com ";" e BOM para abrir direto no Excel em português.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const de = url.searchParams.get("de") ?? `${new Date().getFullYear()}-01-01`;
  const ate = url.searchParams.get("ate") ?? new Date().toISOString().slice(0, 10);

  const supabase = await criarClienteServidor();
  const { data: gestao } = await supabase.rpc("sou_gestao");
  if (!gestao) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { data: fila } = await supabase.rpc("fila_ideias");
  const linhas = ((fila ?? []) as { id: string; protocolo: string; status: string; categoria: string; setor: string; maquina: string | null; autor: string; criada_em: string; nota: number | null; texto: string | null }[])
    .filter((l) => ["em_implantacao", "padronizando", "padronizada"].includes(l.status))
    .filter((l) => l.criada_em.slice(0, 10) >= de && l.criada_em.slice(0, 10) <= ate);

  const { data: extras } = linhas.length
    ? await supabase
        .from("ideias")
        .select("id, custo_estimado, ganho_tipo, ganho_estimado, roi, payback_meses, linha_base, ganho_verificado, ganho_qualitativo, sop_codigo, sop_revisao, padronizada_em")
        .in("id", linhas.map((l) => l.id))
    : { data: [] };
  const porId = new Map((extras ?? []).map((e) => [e.id, e]));

  const n = (v: unknown) => (v == null ? "" : String(v).replace(".", ","));
  const c = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const cabecalho = [
    "Protocolo", "Recebida em", "Status", "Setor", "Máquina", "Tipo de melhoria", "Autor", "Ideia", "Nota",
    "Tipo de ganho", "Custo (R$)", "Ganho estimado (R$/ano)", "ROI (%)", "Payback (meses)",
    "Linha de base", "Ganho verificado (R$/ano)", "Ganho qualitativo", "Procedimento (SOP)", "Padronizada em",
  ];
  const corpo = linhas.map((l) => {
    const e = porId.get(l.id) ?? ({} as Record<string, unknown>);
    return [
      c(l.protocolo), c(l.criada_em.slice(0, 10).split("-").reverse().join("/")), c(STATUS[l.status]?.n ?? l.status), c(l.setor), c(l.maquina),
      c(nomeCategoria(l.categoria)), c(l.autor), c(l.texto), n(l.nota),
      c(e.ganho_tipo), n(e.custo_estimado), n(e.ganho_estimado), n(e.roi), n(e.payback_meses),
      c(e.linha_base), n(e.ganho_verificado), c(e.ganho_qualitativo),
      c(e.sop_codigo ? `${e.sop_codigo}${e.sop_revisao ? ` rev. ${e.sop_revisao}` : ""}` : ""),
      c(e.padronizada_em ? String(e.padronizada_em).slice(0, 10).split("-").reverse().join("/") : ""),
    ].join(";");
  });
  const csv = "﻿" + [cabecalho.map(c).join(";"), ...corpo].join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="relatorio-inovacao-${de}-a-${ate}.csv"`,
    },
  });
}
