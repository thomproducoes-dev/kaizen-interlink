// Envio de e-mails pelo Resend. Use só no servidor (a chave nunca vai para o navegador).
//
// Enquanto não houver domínio próprio verificado no Resend, o remetente é o endereço de testes
// (onboarding@resend.dev) e o Resend só entrega para o e-mail dono da conta. Quando o domínio
// estiver verificado, basta definir EMAIL_REMETENTE, ex.: "Kaizen 4.0 <kaizen@ideias.interlink.com.br>".

const REMETENTE_PADRAO = "Kaizen 4.0 <onboarding@resend.dev>";

export type Email = { para: string | string[]; assunto: string; html: string; texto?: string };

export async function enviarEmail({ para, assunto, html, texto }: Email): Promise<{ ok: boolean; erro?: string }> {
  if (typeof window !== "undefined") throw new Error("enviarEmail só pode ser usado no servidor.");
  const chave = process.env.RESEND_API_KEY;
  if (!chave) return { ok: false, erro: "RESEND_API_KEY não configurada." };

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_REMETENTE || REMETENTE_PADRAO,
      to: Array.isArray(para) ? para : [para],
      subject: assunto,
      html,
      text: texto,
    }),
  });
  if (r.ok) return { ok: true };
  return { ok: false, erro: `${r.status} ${await r.text()}` };
}

// Moldura simples e legível em qualquer cliente de e-mail.
export function moldura(titulo: string, corpo: string, link?: { url: string; rotulo: string }) {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#eaeef0;font-family:Arial,Helvetica,sans-serif;color:#14202a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px">
<tr><td style="padding:20px 24px;border-bottom:1px solid #d3dbe0;font-weight:bold;font-size:15px">Kaizen 4.0 · Interlink</td></tr>
<tr><td style="padding:24px"><h1 style="margin:0 0 12px;font-size:22px">${titulo}</h1>${corpo}
${link ? `<p style="margin:24px 0 0"><a href="${link.url}" style="background:#0d6466;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">${link.rotulo}</a></p>` : ""}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #d3dbe0;font-size:12px;color:#566673">Mensagem automática do programa de ideias. Não responda este e-mail.</td></tr>
</table></td></tr></table></body></html>`;
}
