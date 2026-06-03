# ⚽ CopaBolão — Bolão de Futebol entre Amigos

Aplicativo PWA para criar grupos de bolão de futebol, lançar palpites, acompanhar partidas e ranking ao vivo, e cornetar a galera no chat.

**Stack:** Vite + React 19 + TypeScript + Tailwind 4 (frontend) · Express + Supabase + Zod (backend) · Gemini AI + API-Football (integrações opcionais).

---

## Pré-requisitos

- Node.js 20+
- Conta no [Supabase](https://supabase.com) (free tier serve)
- Opcional: chave [Gemini API](https://aistudio.google.com/apikey) e [API-Football](https://www.api-football.com/) para dados reais

---

## Setup

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis
cp .env.example .env
# Edite .env com as credenciais do Supabase (mínimo: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
# SUPABASE_URL, SUPABASE_ANON_KEY)

# 3. Aplicar schema no Supabase
# Abra Supabase Dashboard → SQL Editor → New Query
# Cole o conteúdo de src/data/sql_blueprint.sql e clique em "Run"

# 4. Habilitar Email OTP no Supabase
# Authentication → Providers → Email → ative "Email OTP"
# Authentication → URL Configuration → adicione http://localhost:3000 nas allowed URLs
```

---

## Comandos

| Comando | Descrição |
|---|---|
| `npm run dev` | Inicia o servidor Express + Vite middleware em http://localhost:3000 |
| `npm run lint` | TypeScript typecheck (`tsc --noEmit`) |
| `npm run build` | Build de produção (Vite SPA + esbuild do servidor) |
| `npm start` | Roda o build de produção (`node dist/server.cjs`) |
| `npm run clean` | Limpa `dist/` |
| `node scripts/gen-icons.mjs` | Regera os PNGs de ícone do PWA a partir de `public/icons/icon.svg` |

---

## 📱 Como testar

### Cenário 1 — Local sozinho (mais rápido)

```bash
npm run dev
# abre http://localhost:3000
```

Sem `.env` configurado, o app cai no modo simulação (use OTP `123456`). Útil pra ver a UI rodando.

### Cenário 2 — Local com Supabase real

1. Crie projeto em [supabase.com](https://supabase.com) (free tier)
2. **SQL Editor** → cole [src/data/sql_blueprint.sql](src/data/sql_blueprint.sql) → Run
3. **Authentication → Providers → Email** → ative "Email OTP"
4. **Authentication → URL Configuration** → adicione `http://localhost:3000`
5. **Project Settings → API** → copie `URL` e `anon public` key para o `.env`
6. `cp .env.example .env` e preencha `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ADMIN_EMAILS`
7. `npm run dev` → cadastre seu email real → recebe OTP no email → entra

### Cenário 3 — Multi-device na mesma WiFi

Para testar com seu celular ou um amigo na mesma rede:

```bash
# Descobrir o IP da máquina
# Windows: ipconfig | findstr IPv4
# macOS/Linux: ifconfig | grep inet
# Resultado tipo: 192.168.1.42
```

O servidor já escuta em `0.0.0.0`, então acesse `http://192.168.1.42:3000` do celular.

**Importante:** adicione esse IP nas **Authentication → URL Configuration** do Supabase também.

### Cenário 4 — Demo remota com amigos (recomendado pra demo)

Use [ngrok](https://ngrok.com) (HTTPS grátis em segundos):

```bash
# 1. Instale: https://ngrok.com/download (uma vez)
# 2. Em um terminal:
npm run dev
# 3. Em outro terminal:
ngrok http 3000
# Output: https://abc-123.ngrok-free.app -> http://localhost:3000
```

Adicione a URL `https://abc-123.ngrok-free.app` nas Redirect URLs do Supabase. Mande pros amigos. Quando você desligar o ngrok, a URL morre — boa para demos pontuais.

### Checklist de teste end-to-end (multi-user)

- [ ] **Browser 1:** cadastra com email A, recebe OTP, entra
- [ ] **Browser 1:** cria bolão privado, copia o code
- [ ] **Browser 1:** faz palpite num jogo `upcoming` → salva
- [ ] **Browser 1:** tenta palpitar em jogo `live` → erro 409 (bet-lock server-side ✅)
- [ ] **Browser 2 (incógnito):** cadastra email B, recebe OTP, entra
- [ ] **Browser 2:** cola o code → entra no bolão
- [ ] **Browser 2:** faz palpite no mesmo jogo
- [ ] **Browser 1 (admin):** abre Simulador → marca jogo como `completed`
- [ ] **Ambos browsers:** ranking atualiza após ~25s com pontos calculados
- [ ] No Supabase, tabela `copabolao_predictions`: `points_earned` populado (5/3/2/0)

---

## 📲 Multi-plataforma (Android, iOS, Web)

A v1 é uma **PWA** (Progressive Web App) — funciona em qualquer browser e pode ser **instalada** como app nativo:

### Instalar no Android (Chrome)
1. Abrir a URL do app
2. Menu (⋮) → "Adicionar à Tela inicial" / "Instalar app"
3. O app vira um ícone que abre fullscreen, sem barra de browser

### Instalar no iOS (Safari)
1. Abrir a URL no Safari (não funciona em outros browsers do iOS)
2. Botão Compartilhar (□↑) → "Adicionar à Tela de Início"
3. Confirma — vira um ícone fullscreen

### Funcionalidades PWA atuais
- ✅ Instalável (manifest.webmanifest)
- ✅ Ícones próprios (192/512/180/32 px)
- ✅ Tema verde-esmeralda (`#10b981`)
- ✅ Cache offline básico (service worker em `public/sw.js`)
- ✅ Tela de splash automática (gerada pelo manifest)
- ⏳ Push notifications — próxima versão (requer setup adicional no Supabase + Firebase/APNs)
- ⏳ Lojas (Google Play / App Store) — requer Capacitor wrapper, planejado para v2

> A PWA cobre 99% dos casos de uso de uma demo entre amigos. Para distribuir publicamente nas lojas, adicionamos [Capacitor](https://capacitorjs.com/) por cima do mesmo código React em uma sprint futura.

---

## Deploy (Railway)

1. Push para GitHub.
2. No Railway: **New Project → Deploy from GitHub** → selecione o repositório.
3. Configure as variáveis de ambiente (mesmas do `.env`, com `NODE_ENV=production` e `CORS_ORIGIN=https://seu-dominio.up.railway.app`).
4. Build command: `npm run build` · Start command: `npm start`.
5. No Supabase, adicione a URL do Railway nas **Authentication → URL Configuration → Redirect URLs**.

---

## Licença

Uso pessoal entre amigos. Desenvolvido com carinho por Dartanhan & Amigos.
