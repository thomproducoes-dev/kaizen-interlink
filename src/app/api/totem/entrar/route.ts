import { NextResponse } from "next/server";
import { lerAdesivo } from "@/lib/adesivo";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";

// Entrada no totem: confere adesivo QR + PIN no banco e abre a sessão do colaborador.
// O colaborador do chão de fábrica não tem e-mail: o servidor cria para ele um usuário
// interno (endereço .invalid, que nunca recebe mensagens) e abre a sessão sem enviar nada.
export async function POST(request: Request) {
  const corpo = await request.json().catch(() => null);
  const token = typeof corpo?.qr === "string" ? lerAdesivo(corpo.qr) : null;
  const pin = typeof corpo?.pin === "string" ? corpo.pin : "";
  // Só vem preenchido quando o PIN atual é provisório e a pessoa já escolheu o próprio.
  const novoPin = typeof corpo?.novoPin === "string" ? corpo.novoPin : null;

  if (!token || !/^\d{4}$/.test(pin) || (novoPin !== null && !/^\d{4}$/.test(novoPin))) {
    return NextResponse.json({ status: "invalido" }, { status: 400 });
  }

  const admin = criarClienteAdmin();

  const { data: verificacao, error: erroVerificacao } = await admin.rpc("verificar_acesso", {
    p_qr: token,
    p_pin: pin,
    p_novo_pin: novoPin,
  });
  if (erroVerificacao) {
    return NextResponse.json({ status: "erro" }, { status: 500 });
  }

  const resultado = verificacao?.[0] as { status: string; colaborador_id: string | null } | undefined;
  // trocar_pin, pin_fraco e pin_igual: PIN certo, mas a sessão só abre depois do PIN próprio.
  if (resultado && ["trocar_pin", "pin_fraco", "pin_igual"].includes(resultado.status)) {
    return NextResponse.json({ status: resultado.status });
  }
  if (!resultado || resultado.status !== "ok" || !resultado.colaborador_id) {
    return NextResponse.json({ status: resultado?.status ?? "invalido" }, { status: 401 });
  }

  const { data: colaborador, error: erroColaborador } = await admin
    .from("colaboradores")
    .select("id, nome, auth_user_id, setores(nome)")
    .eq("id", resultado.colaborador_id)
    .single();
  if (erroColaborador || !colaborador) {
    return NextResponse.json({ status: "erro" }, { status: 500 });
  }

  let email: string;
  if (colaborador.auth_user_id) {
    const { data, error } = await admin.auth.admin.getUserById(colaborador.auth_user_id);
    if (error || !data.user?.email) {
      return NextResponse.json({ status: "erro" }, { status: 500 });
    }
    email = data.user.email;
  } else {
    email = `totem-${colaborador.id}@kaizen.invalid`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { origem: "totem" },
    });
    if (error || !data.user) {
      return NextResponse.json({ status: "erro" }, { status: 500 });
    }
    await admin.from("colaboradores").update({ auth_user_id: data.user.id }).eq("id", colaborador.id);
  }

  const { data: link, error: erroLink } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (erroLink || !link.properties?.hashed_token) {
    return NextResponse.json({ status: "erro" }, { status: 500 });
  }

  const supabase = await criarClienteServidor();
  const { error: erroSessao } = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: link.properties.hashed_token,
  });
  if (erroSessao) {
    return NextResponse.json({ status: "erro" }, { status: 500 });
  }

  const setor = (colaborador.setores as { nome: string } | { nome: string }[] | null);
  return NextResponse.json({
    status: "ok",
    nome: colaborador.nome,
    setor: Array.isArray(setor) ? setor[0]?.nome ?? null : setor?.nome ?? null,
  });
}
