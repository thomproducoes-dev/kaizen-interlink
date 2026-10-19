import type { NextConfig } from "next";

// Cabeçalhos de segurança em todas as páginas:
// - o site não pode ser aberto dentro de outro site (evita telas falsas por cima do PIN);
// - câmera e microfone só para o próprio sistema (totem), nada de localização;
// - o navegador não "adivinha" o tipo de arquivo e não repassa endereços completos a outros sites.
const cabecalhos = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: cabecalhos }];
  },
};

export default nextConfig;
