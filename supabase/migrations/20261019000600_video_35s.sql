-- Duração de vídeo: limite real de 35 s (o banco aceita até 36 s, com 1 s de tolerância do aparelho)
-- e sugestão de 30 s mostrada nas telas, como margem de segurança.
-- Já aplicado em 19/10/2026 na Interlink; rodar de novo não muda nada.
update public.empresas
  set config = config || '{"video_max_segundos": 35, "video_sugerido_segundos": 30}'::jsonb;
