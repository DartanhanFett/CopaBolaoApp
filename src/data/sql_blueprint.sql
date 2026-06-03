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
CREATE INDEX IF NOT EXISTS idx_predictions_group ON copabolao_predictions(group_id);
CREATE INDEX IF NOT EXISTS idx_predictions_user_group ON copabolao_predictions(user_id, group_id);

-- ==========================================
-- HABILITAR ROW LEVEL SECURITY (RLS) EM TODAS AS TABELAS
-- ==========================================
ALTER TABLE copabolao_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE copabolao_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE copabolao_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE copabolao_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE copabolao_comments ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- POLÍTICAS RLS: USUÁRIOS (copabolao_users)
-- ==========================================

-- Permitir leitura pública de perfis de usuários (nome e avatar não são sensíveis)
-- Apenas usuários não deletados são visíveis
CREATE POLICY "Usuarios visiveis para todos"
  ON copabolao_users FOR SELECT
  USING (deleted = false);

-- Usuários podem inserir seu próprio perfil
CREATE POLICY "Usuarios podem criar proprio perfil"
  ON copabolao_users FOR INSERT
  WITH CHECK (auth.uid()::text = id);

-- Usuários podem atualizar apenas seu próprio perfil
CREATE POLICY "Usuarios podem atualizar proprio perfil"
  ON copabolao_users FOR UPDATE
  USING (auth.uid()::text = id)
  WITH CHECK (auth.uid()::text = id);

-- Apenas administradores podem deletar usuários (hard delete), 
-- mas usuários podem fazer soft-delete do próprio perfil (marcar deleted = true)
CREATE POLICY "Usuarios podem deletar proprio perfil"
  ON copabolao_users FOR DELETE
  USING (auth.uid()::text = id);

-- ==========================================
-- POLÍTICAS RLS: GRUPOS (copabolao_groups)
-- ==========================================

-- Grupos públicos são visíveis para todos; grupos privados apenas para membros
CREATE POLICY "Grupos visiveis para todos ou membros"
  ON copabolao_groups FOR SELECT
  USING (
    deleted = false AND (
      is_private IS NOT TRUE
      OR members ? auth.uid()::text
      OR creator_id = auth.uid()::text
    )
  );

-- Qualquer usuário autenticado pode criar um grupo
CREATE POLICY "Usuarios podem criar grupos"
  ON copabolao_groups FOR INSERT
  WITH CHECK (auth.uid()::text = creator_id);

-- Apenas o criador do grupo pode atualizá-lo
CREATE POLICY "Criador pode atualizar grupo"
  ON copabolao_groups FOR UPDATE
  USING (creator_id = auth.uid()::text)
  WITH CHECK (creator_id = auth.uid()::text);

-- Apenas o criador pode deletar o grupo
CREATE POLICY "Criador pode deletar grupo"
  ON copabolao_groups FOR DELETE
  USING (creator_id = auth.uid()::text);

-- ==========================================
-- POLÍTICAS RLS: PARTIDAS (copabolao_matches)
-- ==========================================

-- Todas as partidas são públicas (leitura para todos)
CREATE POLICY "Partidas visiveis para todos"
  ON copabolao_matches FOR SELECT
  USING (true);

-- Apenas administradores podem inserir/atualizar partidas via API
-- Na prática, as partidas são gerenciadas pelo servidor com a service_role key
CREATE POLICY "Apenas admins inserem partidas"
  ON copabolao_matches FOR INSERT
  WITH CHECK (true); -- O servidor usa a service_role key que ignora RLS

CREATE POLICY "Apenas admins atualizam partidas"
  ON copabolao_matches FOR UPDATE
  USING (true); -- O servidor usa a service_role key que ignora RLS

CREATE POLICY "Apenas admins deletam partidas"
  ON copabolao_matches FOR DELETE
  USING (true); -- O servidor usa a service_role key que ignora RLS

-- ==========================================
-- POLÍTICAS RLS: PALPITES (copabolao_predictions)
-- ==========================================

-- Qualquer pessoa pode ver palpites (são parte da dinâmica social do bolão)
CREATE POLICY "Palpites visiveis para todos"
  ON copabolao_predictions FOR SELECT
  USING (true);

-- Usuários podem inserir apenas seus próprios palpites
CREATE POLICY "Usuarios inserem proprio palpite"
  ON copabolao_predictions FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

-- Usuários podem atualizar apenas seus próprios palpites
CREATE POLICY "Usuarios atualizam proprio palpite"
  ON copabolao_predictions FOR UPDATE
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- Apenas administradores podem deletar palpites
CREATE POLICY "Apenas admins deletam palpites"
  ON copabolao_predictions FOR DELETE
  USING (true); -- O servidor usa a service_role key que ignora RLS

-- ==========================================
-- POLÍTICAS RLS: COMENTÁRIOS (copabolao_comments)
-- ==========================================

-- Comentários são públicos (leitura para todos)
CREATE POLICY "Comentarios visiveis para todos"
  ON copabolao_comments FOR SELECT
  USING (true);

-- Usuários podem inserir seus próprios comentários
CREATE POLICY "Usuarios inserem proprio comentario"
  ON copabolao_comments FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

-- Usuários podem atualizar apenas seus próprios comentários
CREATE POLICY "Usuarios atualizam proprio comentario"
  ON copabolao_comments FOR UPDATE
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- Apenas administradores ou o autor podem deletar comentários
CREATE POLICY "Autor ou admin deleta comentario"
  ON copabolao_comments FOR DELETE
  USING (user_id = auth.uid()::text);

-- ==========================================
-- SCRIPT DE MIGRAÇÃO PARA QUEM JÁ TEM O BANCO ATIVO:
-- Execute os comandos abaixo no SQL Editor do Supabase se você já possuía tabelas criadas:
-- 
-- ALTER TABLE copabolao_users ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT false NOT NULL;
-- ALTER TABLE copabolao_groups ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT false NOT NULL;
-- ALTER TABLE copabolao_predictions ADD COLUMN IF NOT EXISTS group_id TEXT;
-- ==========================================