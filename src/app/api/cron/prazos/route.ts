import { NextResponse } from "next/server";
import { enviarEmail, moldura } from "@/lib/email";
import { criarClienteAdmin } from "@/lib/supabase/admin";

// Relógio de prazos (Fase 0, seção 4). Chamado pelo agendador do Supabase (pg_cron):
//  - a cada hora: confere prazos, gera alertas/escalonamentos e envia e-mail dos escalonamentos ao gestor;
//  - dias úteis às 7h (?resumo=1): também envia o resumo diário ao gestor.
// Protegido por CRON_SECRET: só o agendador conhece a chave.

type Admin = ReturnType<typeof criarClienteAdmin>;

async function emailsDosGestores(admin: Admin, empresaId: string): Promise<string[]> {
  const { data } = await admin
    .from("colaborador_papeis")
    .select("colaboradores!inner(auth_user_id, empresa_id, ativo)")
    .eq("papel", "gestor")
    .eq("colaboradores.empresa_id", empresaId)
    .eq("colaboradores.ativo", true);
  const ids = ((data ?? []) as unknown as { colaboradores: { auth_user_id: string | null } }[])
    .map((p) => p.colaboradores.auth_user_id)
    .filter((x): x is string => !!x);
  const emails: string[] = [];
  for (const id of ids) {
    const { data: u } = await admin.auth.admin.getUserById(id);
    const e = u.user?.email;
    // Usuários internos do totem (.invalid) não recebem e-mail.
    if (e && !e.endsWith(".invalid")) emails.push(e);
  }
  return emails;
}

const lista = (itens: string[]) =>
  `<ul style="padding-left:18px;margin:8px 0">${itens.map((t) => `<li style="margin:6px 0">${t}</li>`).join("")}</ul>`;

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  const url = new URL(request.url);
  const origem = url.origin;
  const admin = criarClienteAdmin();

  const { data: eventos, error } = await admin.rpc("verificar_prazos");
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  const relatorio: Record<string, unknown> = { eventos };

  // E-mail dos escalonamentos ainda não avisados, um por empresa.
  const { data: pendentes } = await admin
    .from("alertas_gestao")
    .select("id, empresa_id, texto")
    .eq("tipo", "escalonamento")
    .is("email_enviado_em", null)
    .order("criado_em");
  const porEmpresa = new Map<string, { id: number; texto: string }[]>();
  for (const p of pendentes ?? []) porEmpresa.set(p.empresa_id, [...(porEmpresa.get(p.empresa_id) ?? []), p]);

  const enviados: string[] = [];
  for (const [empresaId, itens] of porEmpresa) {
    const para = await emailsDosGestores(admin, empresaId);
    if (!para.length) continue;
    const r = await enviarEmail({
      para,
      assunto: `Kaizen 4.0: ${itens.length} prazo${itens.length > 1 ? "s" : ""} estourado${itens.length > 1 ? "s" : ""}`,
      html: moldura(
        "Prazos estourados",
        `<p>Estas ideias passaram do prazo e foram escalonadas para você como gestor do programa:</p>${lista(itens.map((i) => i.texto))}
         <p>Abra a fila para destravar ou reatribuir.</p>`,
        { url: `${origem}/gestor/fila`, rotulo: "Abrir a fila" },
      ),
    });
    if (r.ok) {
      await admin.from("alertas_gestao").update({ email_enviado_em: new Date().toISOString() }).in("id", itens.map((i) => i.id));
      enviados.push(empresaId);
    } else relatorio.erroEmail = r.erro;
  }
  relatorio.escalonamentosEnviados = enviados.length;

  // Resumo diário.
  if (url.searchParams.get("resumo") === "1") {
    const { data: empresas } = await admin.from("empresas").select("id, nome");
    let resumos = 0;
    for (const emp of empresas ?? []) {
      const { data: fila } = await admin.rpc("fila_ideias", { p_id: null, p_empresa: emp.id });
      const linhas = (fila ?? []) as { protocolo: string; situacao: string; status: string; criada_em: string; setor: string }[];
      const ontem = Date.now() - 24 * 3600 * 1000;
      const novas = linhas.filter((l) => new Date(l.criada_em).getTime() >= ontem);
      const estouradas = linhas.filter((l) => l.situacao === "estourado");
      const alerta = linhas.filter((l) => l.situacao === "alerta" || l.situacao === "vence_hoje");
      const triagem = linhas.filter((l) => l.status === "em_triagem").length;
      if (!novas.length && !estouradas.length && !alerta.length && !triagem) continue;
      const para = await emailsDosGestores(admin, emp.id);
      if (!para.length) continue;
      const r = await enviarEmail({
        para,
        assunto: `Kaizen 4.0: resumo do dia (${novas.length} nova${novas.length === 1 ? "" : "s"}, ${estouradas.length} estourada${estouradas.length === 1 ? "" : "s"})`,
        html: moldura(
          `Resumo do programa · ${emp.nome}`,
          `<table style="border-collapse:collapse;margin:4px 0 12px">
             <tr><td style="padding:4px 16px 4px 0">Ideias novas (24 h)</td><td><b>${novas.length}</b></td></tr>
             <tr><td style="padding:4px 16px 4px 0">Na triagem agora</td><td><b>${triagem}</b></td></tr>
             <tr><td style="padding:4px 16px 4px 0">Em alerta de prazo</td><td><b>${alerta.length}</b></td></tr>
             <tr><td style="padding:4px 16px 4px 0">Prazo estourado</td><td><b style="color:#b23a2e">${estouradas.length}</b></td></tr>
           </table>
           ${estouradas.length ? `<p><b>Estouradas:</b></p>${lista(estouradas.map((l) => `${l.protocolo} · ${l.setor}`))}` : ""}
           ${alerta.length ? `<p><b>Em alerta:</b></p>${lista(alerta.map((l) => `${l.protocolo} · ${l.setor}`))}` : ""}
           ${novas.length ? `<p><b>Novas:</b></p>${lista(novas.map((l) => `${l.protocolo} · ${l.setor}`))}` : ""}`,
          { url: `${origem}/gestor/fila`, rotulo: "Abrir a fila" },
        ),
      });
      if (r.ok) resumos++;
      else relatorio.erroEmail = r.erro;
    }
    relatorio.resumosEnviados = resumos;
  }

  return NextResponse.json(relatorio);
}
