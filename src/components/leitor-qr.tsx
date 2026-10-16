"use client";

import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";

type Detector = { detect(fonte: CanvasImageSource): Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opcoes: { formats: string[] }) => Detector;

// Lê QR pela câmera. Usa o leitor nativo do navegador quando existe (Android, ChromeOS)
// e cai para o jsQR nos demais (ex.: Chrome no Windows). Chama onLer uma vez por leitura.
export function LeitorQR({ onLer }: { onLer: (texto: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let parado = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    const detector = Ctor ? new Ctor({ formats: ["qr_code"] }) : null;

    const ler = async (v: HTMLVideoElement) => {
      if (detector) {
        try {
          const r = await detector.detect(v);
          return r[0]?.rawValue ?? null;
        } catch {
          return null;
        }
      }
      if (!ctx || !v.videoWidth) return null;
      const escala = Math.min(1, 640 / v.videoWidth);
      canvas.width = Math.round(v.videoWidth * escala);
      canvas.height = Math.round(v.videoHeight * escala);
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return jsQR(img.data, img.width, img.height)?.data ?? null;
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        const v = videoRef.current;
        if (!v || parado) return;
        v.srcObject = stream;
        await v.play();
        const tick = async () => {
          if (parado) return;
          const texto = v.readyState >= 2 ? await ler(v) : null;
          if (texto && !parado) {
            parado = true;
            onLer(texto);
            return;
          }
          timer = setTimeout(tick, 150);
        };
        tick();
      } catch {
        setErro("Não foi possível abrir a câmera. Use o leitor de código ou digite o código do adesivo.");
      }
    })();

    return () => {
      parado = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onLer]);

  if (erro) {
    return <p className="rounded-xl bg-warn-bg p-4 text-center font-semibold text-warn">{erro}</p>;
  }

  return (
    <div className="relative mx-auto aspect-[4/3] w-full max-w-sm overflow-hidden rounded-2xl border-4 border-accent bg-black">
      <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
      <div className="pointer-events-none absolute inset-[18%] rounded-xl border-2 border-dashed border-white/80" />
    </div>
  );
}
