# Kaizen 4.0 · Interlink

Sistema de gestão de ideias de melhoria do chão de fábrica. Piloto na Interlink do Brasil, construído para atender várias empresas (multiempresa) desde o início.

As regras de negócio estão no documento **Fase 0 — Especificação do Sistema de Gestão de Ideias (Kaizen 4.0)**. O protótipo navegável validou o fluxo do totem, do comitê e do painel.

## Tecnologia

| Parte | Escolha |
| --- | --- |
| Aplicação | Next.js 16 (App Router) + React 19 + TypeScript |
| Estilo | Tailwind CSS 4, com a paleta do protótipo em `src/app/globals.css` |
| Banco, login e arquivos | Supabase (PostgreSQL com Row Level Security) |
| Hospedagem | Vercel |

## Rodar no computador

1. Instale as dependências: `npm install`
2. Copie `.env.example` para `.env.local` e preencha com os dados do Supabase.
3. Inicie: `npm run dev` e abra http://localhost:3000

## Banco de dados

- `supabase/migrations/`: estrutura do banco, em ordem. Cada arquivo roda uma única vez.
- `supabase/seed.sql`: dados iniciais do piloto (empresa Interlink e setores).

Para aplicar sem instalar nada: no painel do Supabase, abra **SQL Editor**, cole o conteúdo de cada migração em ordem, execute, e depois faça o mesmo com o `seed.sql`.

## Entregas

| Entrega | Conteúdo | Situação |
| --- | --- | --- |
| 1 | Base multiempresa, setores, colaboradores, papéis, login por adesivo QR + PIN | Concluída |
| 2 | Envio de ideia (fotos, vídeos, áudio), protocolo, "Minhas ideias", modo offline do totem, máquinas com etiqueta QR | Concluída |
| 3 | Triagem, pontuação, feedback automático, alertas e escalonamento de SLA | Concluída |
| 4 | Viabilidade, implantação, padronização (SOP), pontos, ranking, painel, relatório de inovação | Publicada (em teste) |

## Segurança

- Toda tabela tem Row Level Security: um usuário só enxerga dados da própria empresa.
- O PIN é guardado como hash (bcrypt). Cinco PINs errados bloqueiam o adesivo por 15 minutos.
- A chave secreta do Supabase (`SUPABASE_SECRET_KEY`) só é usada no servidor e nunca vai para o GitHub.
