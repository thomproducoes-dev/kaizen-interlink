-- Dados iniciais do piloto: a empresa Interlink e os setores definidos na Fase 0 (seção 16).
-- Colaboradores são cadastrados depois, pela tela de cadastro do gestor.

with empresa as (
  insert into public.empresas (nome, slug, prefixo_protocolo)
  values ('Interlink do Brasil', 'interlink', 'ITL')
  on conflict (slug) do update set nome = excluded.nome
  returning id
)
insert into public.setores (empresa_id, nome)
select empresa.id, s.nome
from empresa
cross join (values ('Preparação'), ('Usinagem'), ('Pintura'), ('Administrativo')) as s (nome)
on conflict (empresa_id, nome) do nothing;
