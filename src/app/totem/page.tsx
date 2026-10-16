"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Icone } from "@/components/icone";
import { LeitorQR } from "@/components/leitor-qr";
import { lerAdesivo, lerMaquina } from "@/lib/adesivo";
import { listarFila, processarFila } from "@/lib/fila-offline";
import { formatarData } from "@/lib/ideias";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { carregarContexto, type Contexto } from "./contexto";
import { DetalheIdeia, MinhasIdeias } from "./minhas-ideias";
import { NovaIdeia } from "./nova-ideia";

type Tela = "ler" | "pin" | "inicio" | "nova" | "protocolo" | "guardada" | "minhas" | "detalhe";

export default function PaginaTotem() {
  return (
    <Suspense>
      <Totem />
    </Suspense>
  );
}

function Totem() {
  const params = useSearchParams();
  const [tela, setTela] = useState<Tela>("ler");
  const [token, setToken] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [ctx, setCtx] = useState<Contexto | null>(null);
  const [novidades, setNovidades] = useState(0);
  const [maquina, setMaquina] = useState<string | null>(() => lerMaquina(`/m/${params.get("maquina") ?? ""}`));
  const [protocolo, setProtocolo] = useState<{ protocolo: string; prazo: string } | null>(null);
  const [ideiaAberta, setIdeiaAberta] = useState<string | null>(null);
  const [pendentes, setPendentes] = useState(0);
  const [restante, setRestante] = useState(60);
  const [codigo, setCodigo] = useState("");
  const ultimaAcao = useRef(0);
  const ocupado = useRef(false);
  const setOcupado = useCallback((b: boolean) => {
    ocupado.current = b;
  }, []);

  const sair = useCallback(async () => {
    // "local": encerra só neste aparelho, para a fila ainda conseguir enviar ideias pendentes deste autor.
    await criarClienteNavegador().auth.signOut({ scope: "local" });
    setCtx(null);
    setToken(null);
    setPin("");
    setErro(null);
    setMaquina(null);
    setProtocolo(null);
    setIdeiaAberta(null);
    setTela("ler");
  }, []);

  // O totem sempre começa sem sessão aberta.
  useEffect(() => {
    criarClienteNavegador().auth.signOut({ scope: "local" });
  }, []);

  // Fila de envio: tenta ao abrir, quando a rede volta e a cada 30 s.
  useEffect(() => {
    const rodar = async () => {
      await processarFila().catch(() => 0);
      setPendentes((await listarFila().catch(() => [])).length);
    };
    rodar();
    window.addEventListener("online", rodar);
    const id = setInterval(rodar, 30000);
    return () => {
      window.removeEventListener("online", rodar);
      clearInterval(id);
    };
  }, []);

  // Saída automática por inatividade (Fase 0, seção 7). Pausa durante gravação, leitura e envio.
  const limite = ctx?.config.logout ?? 60;
  useEffect(() => {
    if (tela === "ler") return;
    ultimaAcao.current = Date.now();
    const marcar = () => {
      ultimaAcao.current = Date.now();
    };
    const eventos = ["pointerdown", "keydown", "input"];
    eventos.forEach((e) => window.addEventListener(e, marcar, true));
    const id = setInterval(() => {
      if (ocupado.current) ultimaAcao.current = Date.now();
      const falta = limite - Math.floor((Date.now() - ultimaAcao.current) / 1000);
      setRestante(Math.max(0, falta));
      if (falta <= 0) sair();
    }, 1000);
    return () => {
      clearInterval(id);
      eventos.forEach((e) => window.removeEventListener(e, marcar, true));
    };
  }, [tela, sair, limite]);

  const atualizarNovidades = useCallback(async () => {
    const { data } = await criarClienteNavegador().rpc("minhas_ideias");
    setNovidades(((data ?? []) as { novidades: number }[]).reduce((a, i) => a + i.novidades, 0));
  }, []);

  const aoLer = useCallback((texto: string) => {
    const m = lerMaquina(texto);
    if (m) {
      setMaquina(m);
      setErro(null);
      return;
    }
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
        const sb = criarClienteNavegador();
        const contexto = await carregarContexto(sb);
        setCtx(contexto);
        atualizarNovidades();
        setTela(maquina && contexto.maquinas.some((x) => x.codigo === maquina) ? "nova" : "inicio");
      } else {
        setPin("");
        setErro(
          dados.status === "bloqueado"
            ? "Adesivo bloqueado por 15 minutos após 5 tentativas. Procure seu encarregado."
            : dados.status === "invalido"
              ? "Adesivo ou PIN não conferem. Tente de novo."
              : "Não foi possível entrar agora. Tente de novo em instantes.",
        );
      }
    } catch {
      setPin("");
      setErro("Sem conexão com o servidor. Verifique a internet do totem.");
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

  const nomeMaquina = ctx?.maquinas.find((m) => m.codigo === maquina)?.nome;

  return (
    <main className="min-h-dvh bg-[#1d2830] p-3 sm:p-6">
      <div className="mx-auto flex min-h-[calc(100dvh-1.5rem)] max-w-xl flex-col gap-5 rounded-2xl bg-surface p-5 sm:min-h-[calc(100dvh-3rem)] sm:p-8">
        <header className="flex items-center justify-between gap-2 text-sm text-muted">
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
            {maquina && (
              <p className="rounded-xl bg-info-bg px-4 py-2 font-semibold text-info">
                Etiqueta de máquina lida. Agora mostre seu adesivo pessoal.
              </p>
            )}
            <LeitorQR onLer={aoLer} />
            {erro && <p className="rounded-xl bg-bad-bg px-4 py-3 font-semibold text-bad">{erro}</p>}
            {pendentes > 0 && (
              <p className="rounded-xl bg-warn-bg px-4 py-2 text-sm font-semibold text-warn">
                {pendentes} ideia{pendentes > 1 ? "s" : ""} guardada{pendentes > 1 ? "s" : ""} neste totem, aguardando internet.
              </p>
            )}
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
                <span key={i} className={`h-5 w-5 rounded-full border-2 border-foreground ${i < pin.length ? "bg-foreground" : ""}`} />
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

        {tela === "inicio" && ctx && (
          <section className="flex flex-col gap-4">
            <div>
              <h1 className="font-display text-4xl font-bold">Bom trabalho, {ctx.eu.nome.split(" ")[0]}.</h1>
              <p className="text-lg text-muted">{ctx.setores.find((s) => s.id === ctx.eu.setorId)?.nome ?? ""}</p>
            </div>
            <button
              onClick={() => setTela("nova")}
              className="flex min-h-28 items-center gap-4 rounded-2xl bg-signal px-6 text-left font-display text-3xl font-bold text-signal-ink"
            >
              <Icone nome="lampada" tamanho={40} />
              <span>
                Nova ideia
                <small className="block font-sans text-base font-medium">Foto, vídeo, áudio ou texto curto</small>
              </span>
            </button>
            <button
              onClick={() => setTela("minhas")}
              className="flex min-h-20 items-center gap-4 rounded-2xl border border-line bg-surface-2 px-6 text-left font-display text-2xl font-bold"
            >
              <Icone nome="lista" tamanho={30} />
              <span>
                Minhas ideias
                <small className="block font-sans text-base font-medium text-muted">Andamento e respostas do comitê</small>
              </span>
              {novidades > 0 && (
                <span className="ml-auto rounded-full bg-bad px-3 py-0.5 font-sans text-base text-white">
                  {novidades} nova{novidades > 1 ? "s" : ""}
                </span>
              )}
            </button>
          </section>
        )}

        {tela === "nova" && ctx && (
          <>
            {nomeMaquina && (
              <p className="rounded-xl bg-info-bg px-4 py-2 text-sm font-semibold text-info">Ideia sobre a máquina: {nomeMaquina}</p>
            )}
            <NovaIdeia
              ctx={ctx}
              maquinaInicial={maquina}
              setOcupado={setOcupado}
              aoEnviar={(r) => {
                setProtocolo(r);
                setMaquina(null);
                setTela("protocolo");
              }}
              aoGuardar={() => {
                setMaquina(null);
                listarFila().then((l) => setPendentes(l.length));
                setTela("guardada");
              }}
              aoCancelar={() => {
                setMaquina(null);
                setTela("inicio");
              }}
            />
          </>
        )}

        {tela === "protocolo" && protocolo && (
          <section className="flex flex-1 flex-col items-center gap-4 pt-6 text-center">
            <span className="rounded-full bg-good-bg px-4 py-1 font-semibold text-good">Ideia enviada</span>
            <h1 className="font-display text-4xl font-bold">Obrigado! Guarde seu protocolo:</h1>
            <p className="font-mono text-4xl font-bold text-accent">{protocolo.protocolo}</p>
            <p className="text-lg text-muted">
              O comitê responde até <b className="text-foreground">{formatarData(protocolo.prazo)}</b>.
              <br />
              Você recebe um aviso a cada mudança.
            </p>
            <div className="mt-auto flex w-full gap-3">
              <button onClick={() => setTela("minhas")} className="min-h-16 flex-1 rounded-2xl border border-line bg-surface-2 text-xl font-semibold">
                Minhas ideias
              </button>
              <button onClick={sair} className="min-h-16 flex-1 rounded-2xl bg-signal text-xl font-semibold text-signal-ink">
                Sair
              </button>
            </div>
          </section>
        )}

        {tela === "guardada" && (
          <section className="flex flex-1 flex-col items-center gap-4 pt-6 text-center">
            <span className="rounded-full bg-warn-bg px-4 py-1 font-semibold text-warn">Sem internet agora</span>
            <h1 className="font-display text-4xl font-bold">Sua ideia ficou guardada no totem</h1>
            <p className="text-lg text-muted">
              Ela será enviada sozinha quando a conexão voltar. O protocolo aparece em “Minhas ideias” no seu próximo acesso.
            </p>
            <button onClick={sair} className="mt-auto min-h-16 w-full rounded-2xl bg-signal text-xl font-semibold text-signal-ink">
              Sair
            </button>
          </section>
        )}

        {tela === "minhas" && (
          <MinhasIdeias
            aoAbrir={(id) => {
              setIdeiaAberta(id);
              setTela("detalhe");
            }}
            aoVoltar={() => {
              atualizarNovidades();
              setTela("inicio");
            }}
          />
        )}

        {tela === "detalhe" && ideiaAberta && ctx && (
          <DetalheIdeia id={ideiaAberta} euId={ctx.eu.id} aoVoltar={() => setTela("minhas")} />
        )}
      </div>
    </main>
  );
}
