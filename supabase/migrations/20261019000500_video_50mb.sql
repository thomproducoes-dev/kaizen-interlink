-- Limite por arquivo do armazenamento de anexos: 20 MB → 50 MB (máximo do plano gratuito).
-- Um vídeo de 30 s em HD gravado no celular fica em torno de 40 MB.
-- Já aplicado pelo painel/API em 19/10/2026; rodar de novo não muda nada.
update storage.buckets set file_size_limit = 52428800 where id = 'ideias';
