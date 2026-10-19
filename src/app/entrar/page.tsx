"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { LeitorQR } from "@/components/leitor-qr";
import { lerAdesivo } from "@/lib/adesivo";
import { MENSAGEM_TROCA, validarPin } from "@/lib/pin";
import { criarClienteNavegador } from "@/lib/supabase/client";

// Entrada da área da gestão (comitê, engenharia, encarregados, gestor):
// - pelo adesivo QR + PIN, igual ao totem (não depende de e-mail);
// - ou por link enviado ao e-mail cadastrado (sem senha). O link não cria usuários novos.
export default function Entrar() {
  const [modo, setModo] = useState<"adesivo" | "email">("adesivo");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-12">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">Kaizen 4.0 · Interlink</p>
        <h1 className="font-display text-4xl font-bold">Área da gestão</h1>
        <p className="mt-1 text-muted">Comitê, engenharia, encarregados e gestor do programa.</p>
      </div>
      <div className="grid grid-cols-2 rounded-xl border border-line bg-surface-2 p-1 text-sm font-semibold" role="tablist">
        {(
          [
            ["adesivo", "Adesivo QR + PIN"],
            ["email", "Link por e-mail"],
          ] as const
        ).map(([k, n]) => (
          <button
            key={k}
            role="tab"
            aria-selected={modo === k}
            onClick={() => setModo(k)}
            className={`rounded-lg px-3 py-2 ${modo === k ? "bg-accent text-accent-ink" : ""}`}
          >
            {n}
          </button>
        ))}
      </div>
      {modo === "adesivo" ? <PorAdesivo /> : <PorEmail />}
    </main>
  );
}

function PorAdesivo() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [pin, setPin] = useState("");
  // PIN provisório: antes de entrar, a pessoa cria o próprio PIN (digitado duas vezes).
  const [trocando, setTrocando] = useState(false);
  const [novo, setNovo] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const aoLer = useCallback((texto: string) => {
    const t = lerAdesivo(texto);
    if (!t) return setErro("Este código não é um adesivo do programa.");
    setErro(null);
    setToken(t);
  }, []);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !/^\d{4}$/.test(pin)) return setErro("Digite os 4 números do PIN.");
    if (trocando) {
      const recusa = validarPin(novo) ?? (novo === pin ? MENSAGEM_TROCA.pin_igual : novo !== confirma ? "Os dois PINs novos não ficaram iguais." : null);
      if (recusa) return setErro(recusa);
    }
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch("/api/totem/entrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qr: token, pin, novoPin: trocando ? novo : undefined }),
      });
      const d = await r.json().catch(() => ({ status: "erro" }));
      if (d.status === "ok") {
        router.replace("/gestor/fila");
        router.refresh();
        return;
      }
      if (d.status === "trocar_pin" || d.status in MENSAGEM_TROCA) {
        setTrocando(true);
        setNovo("");
        setConfirma("");
        setErro(MENSAGEM_TROCA[d.status] ?? null);
        return;
      }
      setPin("");
      setTrocando(false);
      setErro(
        d.status === "bloqueado"
          ? "Adesivo bloqueado por 15 minutos após 5 tentativas."
          : d.status === "invalido"
            ? "Adesivo ou PIN não conferem."
            : "Não foi possível entrar agora. Tente de novo.",
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
      {!token ? (
        <>
          <p className="text-sm text-muted">Mostre seu adesivo QR para a câmera, use o leitor USB ou digite o código.</p>
          <LeitorQR onLer={aoLer} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              aoLer(codigo);
            }}
            className="flex flex-col gap-1"
          >
            <label htmlFor="codigo" className="text-sm font-semibold">
              Código do adesivo
            </label>
            <input
              id="codigo"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              autoComplete="off"
              placeholder="KZ1:…"
              className="rounded-lg border border-line bg-surface px-3 py-2 font-mono"
            />
          </form>
        </>
      ) : (
        <form onSubmit={entrar} className="flex flex-col gap-3">
          <p className="rounded-lg bg-good-bg px-3 py-2 text-sm font-semibold text-good">Adesivo lido.</p>
          {!trocando ? (
            <>
              <label htmlFor="pin" className="text-sm font-semibold">
                PIN (4 números)
              </label>
              <input
                id="pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={pin}
                autoFocus
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                className="rounded-lg border border-line bg-surface px-3 py-2 text-center font-mono text-2xl tracking-[0.5em]"
              />
            </>
          ) : (
            <>
              <p className="rounded-lg bg-info-bg px-3 py-2 text-sm text-info">
                <b>Primeiro acesso.</b> O PIN que você recebeu era provisório. Crie o seu: 4 números, sem repetidos nem sequências (1111, 1234).
              </p>
              {(
                [
                  ["novo", "Novo PIN", novo, setNovo],
                  ["confirma", "Repita o novo PIN", confirma, setConfirma],
                ] as const
              ).map(([id, rotulo, valor, mudar], k) => (
                <label key={id} className="flex flex-col gap-1 text-sm font-semibold">
                  {rotulo}
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    maxLength={4}
                    value={valor}
                    autoFocus={k === 0}
                    onChange={(e) => mudar(e.target.value.replace(/\D/g, ""))}
                    className="rounded-lg border border-line bg-surface px-3 py-2 text-center font-mono text-2xl tracking-[0.5em]"
                  />
                </label>
              ))}
            </>
          )}
          <button disabled={enviando} className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-ink disabled:opacity-50">
            {enviando ? "Entrando…" : trocando ? "Salvar PIN e entrar" : "Entrar"}
          </button>
          <button
            type="button"
            onClick={() => {
              setToken(null);
              setPin("");
              setTrocando(false);
            }}
            className="text-sm text-muted underline"
          >
            Ler outro adesivo
          </button>
        </form>
      )}
      {erro && <p className="rounded-lg bg-bad-bg px-3 py-2 text-sm font-semibold text-bad">{erro}</p>}
    </section>
  );
}

function PorEmail() {
  const [email, setEmail] = useState("");
  const [estado, setEstado] = useState<"livre" | "enviando" | "enviado" | "erro">("livre");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEstado("enviando");
    const { error } = await criarClienteNavegador().auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth/callback?next=/gestor/fila` },
    });
    setEstado(error ? "erro" : "enviado");
  }

  if (estado === "enviado") {
    return (
      <p className="rounded-xl bg-good-bg p-4 text-good">
        Link enviado para <b>{email}</b>. Abra o e-mail neste mesmo navegador e clique no link.
      </p>
    );
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
      <label htmlFor="email" className="text-sm font-semibold">
        E-mail cadastrado
      </label>
      <input
        id="email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-lg border border-line bg-surface px-3 py-2"
        autoComplete="email"
      />
      {estado === "erro" && (
        <p className="text-sm font-semibold text-bad">Não foi possível enviar o link. Confira o e-mail ou aguarde alguns minutos e tente de novo.</p>
      )}
      <button type="submit" disabled={estado === "enviando"} className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-ink disabled:opacity-50">
        {estado === "enviando" ? "Enviando…" : "Enviar link de acesso"}
      </button>
    </form>
  );
}
