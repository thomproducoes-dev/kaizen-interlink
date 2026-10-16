"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Limite do plano gratuito do Supabase definido para o piloto (o bucket recusa acima disso).
export const LIMITE_ARQUIVO_BYTES = 20 * 1024 * 1024;

// "audio/webm;codecs=opus" → "audio/webm": o armazenamento compara só o tipo base.
export const tipoBase = (mime: string) => mime.split(";")[0].trim().toLowerCase();

const EXTENSOES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/aac": "aac",
};
export const extensao = (mime: string) => EXTENSOES[tipoBase(mime)] ?? "bin";

// Reduz a foto para no máximo 1600 px no lado maior, em JPEG. Fotos de celular caem de 4–8 MB para ~300 KB.
export async function comprimirFoto(arquivo: Blob): Promise<Blob> {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, falha) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => falha(new Error("Não foi possível abrir a foto."));
      i.src = url;
    });
    const escala = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * escala);
    canvas.height = Math.round(img.naturalHeight * escala);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((ok, falha) =>
      canvas.toBlob((b) => (b ? ok(b) : falha(new Error("Não foi possível processar a foto."))), "image/jpeg", 0.8),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function duracaoVideo(arquivo: Blob): Promise<number> {
  return new Promise((ok, falha) => {
    const url = URL.createObjectURL(arquivo);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      ok(v.duration);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      falha(new Error("Não foi possível abrir o vídeo."));
    };
    v.src = url;
  });
}

// Gravação de áudio pelo microfone do aparelho. Para sozinha ao atingir o limite.
export function useGravador(maxSegundos: number) {
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const resolverRef = useRef<((r: { blob: Blob; duracao: number } | null) => void) | null>(null);
  const inicioRef = useRef(0);

  const parar = useCallback(() => {
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
  }, []);

  useEffect(() => {
    if (!gravando) return;
    const id = setInterval(() => {
      const s = Math.floor((Date.now() - inicioRef.current) / 1000);
      setSegundos(s);
      if (s >= maxSegundos) parar();
    }, 250);
    return () => clearInterval(id);
  }, [gravando, maxSegundos, parar]);

  useEffect(() => () => parar(), [parar]);

  const iniciar = useCallback(async (): Promise<{ blob: Blob; duracao: number } | null> => {
    setErro(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErro("Não foi possível usar o microfone. Escreva sua ideia no campo de texto.");
      return null;
    }
    const tipo = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
    const partes: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && partes.push(e.data);
    recRef.current = rec;
    return new Promise((resolver) => {
      resolverRef.current = resolver;
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setGravando(false);
        const duracao = Math.max(1, Math.round((Date.now() - inicioRef.current) / 1000));
        const blob = new Blob(partes, { type: tipoBase(rec.mimeType || "audio/webm") });
        resolverRef.current?.(blob.size ? { blob, duracao: Math.min(duracao, maxSegundos) } : null);
        resolverRef.current = null;
      };
      inicioRef.current = Date.now();
      setSegundos(0);
      setGravando(true);
      rec.start(1000);
    });
  }, [maxSegundos]);

  return { gravando, segundos, erro, iniciar, parar };
}
