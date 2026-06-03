-- BLUPrINT SQL PARA CONFIGURAR O BANCO DE DADOS NO SUPABASE
-- Copie todo o conteúdo abaixo, abra o console da Supabase (supabase.com),
-- acesse o seu projeto, clique em "SQL Editor" no menu lateral e clique em "New Query".
-- Cole esse código lá e clique em "Run" (Executar).

-- 1. Tabela de Usuários (copabolao_users)
CREATE TABLE IF NOT EXISTS copabolao_users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    avatar TEXT NOT NULL,
    deleted BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Tabela de Grupos/Ligas (copabolao_groups)
CREATE TABLE IF NOT EXISTS copabolao_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    league TEXT NOT NULL,
    entry_fee NUMERIC DEFAULT 0 NOT NULL,
    creator_id TEXT REFERENCES copabolao_users(id) ON DELETE CASCADE,
    code TEXT UNIQUE NOT NULL,
    members JSONB DEFAULT '[]'::jsonb NOT NULL,
    deleted BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Tabela de Partidas oficiais/personalizadas (copabolao_matches)
CREATE TABLE IF NOT EXISTS copabolao_matches (
    id TEXT PRIMARY KEY,
    home_team JSONB NOT NULL,
    away_team JSONB NOT NULL,
    date TEXT NOT NULL,
    status TEXT NOT NULL,
    home_score INT,
    away_score INT,
    scorers JSONB DEFAULT '[]'::jsonb NOT NULL,
    league TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Tabela de Palpites (copabolao_predictions)
CREATE TABLE IF NOT EXISTS copabolao_predictions (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES copabolao_users(id) ON DELETE CASCADE,
    match_id TEXT NOT NULL,
    home_score INT NOT NULL,
    away_score INT NOT NULL,
    points_earned INT,
    group_id TEXT, -- Associado a um bolão/grupo específico (`copabolao_groups(id)`)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Tabela de Comentários / Chats (copabolao_comments)
CREATE TABLE IF NOT EXISTS copabolao_comments (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    user_id TEXT REFERENCES copabolao_users(id) ON DELETE CASCADE,
    user_name TEXT NOT NULL,
    user_avatar TEXT NOT NULL,
    text TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    reactions JSONB DEFAULT '[]'::jsonb NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Criar índices de performance para consultas frequentes
CREATE INDEX IF NOT EXISTS idx_comments_match ON copabolao_comments(match_id);
CREATE INDEX IF NOT EXISTS idx_predictions_user ON copabolao_predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_predictions_match ON copabolao_predictions(match_id);

-- Desativar RLS (Row Level Security) temporariamente ou permitir acesso público total para facilidade no protótipo de bolão
ALTER TABLE copabolao_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE copabolao_groups DISABLE ROW LEVEL SECURITY;
ALTER TABLE copabolao_matches DISABLE ROW LEVEL SECURITY;
ALTER TABLE copabolao_predictions DISABLE ROW LEVEL SECURITY;
ALTER TABLE copabolao_comments DISABLE ROW LEVEL SECURITY;

-- ==========================================
-- SCRIPT DE MIGRAÇÃO PARA QUEM JÁ TEM O BANCO ATIVO:
-- Execute os comandos abaixo no SQL Editor do Supabase se você já possuía tabelas criadas:
-- 
-- ALTER TABLE copabolao_users ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT false NOT NULL;
-- ALTER TABLE copabolao_groups ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT false NOT NULL;
-- ALTER TABLE copabolao_predictions ADD COLUMN IF NOT EXISTS group_id TEXT;
-- ==========================================
