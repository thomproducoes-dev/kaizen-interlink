"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LeitorQR } from "@/components/leitor-qr";
import { lerAdesivo } from "@/lib/adesivo";
import { criarClienteNavegador } from "@/lib/supabase/client";

const SEGUNDOS_INATIVIDADE = 60;

type Tela = "ler" | "pin" | "inicio";

export default function Totem() {
  const [tela, setTela] = useState<Tela>("ler");
  const [token, setToken] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [usuario, setUsuario] = useState<{ nome: string; setor: string | null } | null>(null);
  const [restante, setRestante] = useState(SEGUNDOS_INATIVIDADE);
  const [codigo, setCodigo] = useState("");
  const ultimaAcao = useRef(0);

  const sair = useCallback(async () => {
    await criarClienteNavegador().auth.signOut();
    setUsuario(null);
    setToken(null);
    setPin("");
    setErro(null);
    setTela("ler");
  }, []);

  // O totem sempre começa sem sessão aberta.
  useEffect(() => {
    criarClienteNavegador().auth.signOut();
  }, []);

  // Saída automática após 60 s sem uso (Fase 0, seção 7).
  useEffect(() => {
    if (tela === "ler") return;
    ultimaAcao.current = Date.now();
    const marcar = () => {
      ultimaAcao.current = Date.now();
    };
    window.addEventListener("pointerdown", marcar);
    window.addEventListener("keydown", marcar);
    const id = setInterval(() => {
      const falta = SEGUNDOS_INATIVIDADE - Math.floor((Date.now() - ultimaAcao.current) / 1000);
      setRestante(Math.max(0, falta));
      if (falta <= 0) sair();
    }, 1000);
    return () => {
      clearInterval(id);
      window.removeEventListener("pointerdown", marcar);
      window.removeEventListener("keydown", marcar);
    };
  }, [tela, sair]);

  const aoLer = useCallback((texto: string) => {
    const t = lerAdesivo(texto);
    if (!t) {
      setErro("Este código não é um adesivo do programa. Tente de novo.");
      return;
    }
    setErro(null);
    setToken(t);
    setPin("");
    setTela("pin");
  }, []);

  async function entrar(pinCompleto: string) {
    if (!token || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch("/api/totem/entrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qr: token, pin: pinCompleto }),
      });
      const dados = await r.json().catch(() => ({ status: "erro" }));
      if (dados.status === "ok") {
        setUsuario({ nome: dados.nome, setor: dados.setor });
        setTela("inicio");
      } else if (dados.status === "bloqueado") {
        setErro("Adesivo bloqueado por 15 minutos após 5 tentativas. Procure seu encarregado.");
        setPin("");
      } else if (dados.status === "invalido") {
        setErro("Adesivo ou PIN não conferem. Tente de novo.");
        setPin("");
      } else {
        setErro("Não foi possível entrar agora. Tente de novo em instantes.");
        setPin("");
      }
    } finally {
      setEnviando(false);
    }
  }

  function tecla(k: string) {
    setErro(null);
    if (k === "apagar") return setPin((p) => p.slice(0, -1));
    if (k === "ok") {
      if (pin.length === 4) entrar(pin);
      else setErro("Digite os 4 números do PIN.");
      return;
    }
    if (pin.length < 4) setPin((p) => p + k);
  }

  return (
    <main className="min-h-dvh bg-[#1d2830] p-3 sm:p-6">
      <div className="mx-auto flex min-h-[calc(100dvh-1.5rem)] max-w-xl flex-col gap-5 rounded-2xl bg-surface p-6 sm:min-h-[calc(100dvh-3rem)] sm:p-8">
        <header className="flex items-center justify-between text-sm text-muted">
          <span className="font-semibold">Kaizen 4.0 · Interlink</span>
          {tela !== "ler" && (
            <span className="flex items-center gap-3">
              <span>Sai em {restante} s</span>
              <button onClick={sair} className="rounded-lg border border-line px-3 py-1 font-semibold">
                Sair
              </button>
            </span>
          )}
        </header>

        {tela === "ler" && (
          <section className="flex flex-col items-center gap-5 text-center">
            <h1 className="font-display text-4xl font-bold">Tem uma ideia de melhoria?</h1>
            <p className="text-lg text-muted">Mostre seu adesivo QR para a câmera.</p>
            <LeitorQR onLer={aoLer} />
            {erro && <p className="rounded-xl bg-bad-bg px-4 py-3 font-semibold text-bad">{erro}</p>}
            <form
              className="flex w-full max-w-sm flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                aoLer(codigo);
                setCodigo("");
              }}
            >
              <label htmlFor="codigo" className="text-sm text-muted">
                Leitor USB ou código do adesivo
              </label>
              <input
                id="codigo"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                autoComplete="off"
                className="rounded-xl border border-line bg-surface-2 px-4 py-3 font-mono"
                placeholder="KZ1:…"
              />
            </form>
          </section>
        )}

        {tela === "pin" && (
          <section className="flex flex-col items-center gap-5 text-center">
            <h1 className="font-display text-4xl font-bold">Digite seu PIN</h1>
            <p className="text-lg text-muted">4 números.</p>
            <div className="flex gap-4" aria-label={`${pin.length} de 4 dígitos`}>
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`h-5 w-5 rounded-full border-2 border-foreground ${i < pin.length ? "bg-foreground" : ""}`}
                />
              ))}
            </div>
            {erro && <p className="rounded-xl bg-bad-bg px-4 py-3 font-semibold text-bad">{erro}</p>}
            <div className="grid grid-cols-3 gap-3">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "apagar", "0", "ok"].map((k) => (
                <button
                  key={k}
                  onClick={() => tecla(k)}
                  disabled={enviando}
                  aria-label={k === "apagar" ? "Apagar" : k === "ok" ? "Entrar" : k}
                  className={`h-16 w-20 rounded-2xl border text-2xl font-semibold sm:h-20 sm:w-24 ${
                    k === "ok" ? "border-signal bg-signal text-signal-ink" : "border-line bg-surface-2"
                  }`}
                >
                  {k === "apagar" ? "⌫" : k === "ok" ? (enviando ? "…" : "OK") : k}
                </button>
              ))}
            </div>
            <button onClick={sair} className="text-muted underline">
              Não sou eu
            </button>
          </section>
        )}

        {tela === "inicio" && usuario && (
          <section className="flex flex-col gap-4">
            <div>
              <h1 className="font-display text-4xl font-bold">Bom trabalho, {usuario.nome.split(" ")[0]}.</h1>
              {usuario.setor && <p className="text-lg text-muted">{usuario.setor}</p>}
            </div>
            <button
              disabled
              className="flex min-h-24 items-center rounded-2xl bg-signal px-6 text-left font-display text-3xl font-bold text-signal-ink opacity-60"
            >
              <span>
                Nova ideia
                <small className="block font-sans text-base font-medium">Chega na Entrega 2</small>
              </span>
            </button>
            <button
              disabled
              className="flex min-h-20 items-center rounded-2xl border border-line bg-surface-2 px-6 text-left font-display text-2xl font-bold opacity-60"
            >
              <span>
                Minhas ideias
                <small className="block font-sans text-base font-medium">Chega na Entrega 2</small>
              </span>
            </button>
            <p className="rounded-xl bg-good-bg px-4 py-3 text-good">
              Entrada confirmada. Na Entrega 1, o totem só valida o adesivo e o PIN.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
