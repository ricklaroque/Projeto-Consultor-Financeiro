# Finora - Consultor Financeiro com IA

Projeto academico da disciplina Fundamentos de Inteligencia Artificial. A aplicacao ajuda o usuario a organizar informacoes financeiras, importar extratos e receber uma analise educacional gerada por IA.

A aplicacao tem duas areas principais:

- **Consultoria com IA:** pagina inicial em `http://localhost:3000`, com formulario financeiro e resposta gerada via OpenRouter.
- **Painel financeiro:** area em `http://localhost:3000/painel`, com dashboard, importacao de extratos, categorias e historico de transacoes.

> A analise gerada pela IA tem finalidade educacional e nao substitui orientacao financeira profissional.

## Tecnologias

- Node.js 22.13 ou superior
- Next.js
- React
- TypeScript
- Tailwind CSS
- Express
- PostgreSQL
- OpenRouter

## Como Baixar Em Outra Maquina

### 1. Instalar os programas necessarios

Antes de baixar o projeto, instale:

- **Node.js 22.13 ou superior:** https://nodejs.org
- **Git:** https://git-scm.com
- **PostgreSQL** local ou um banco online, como Neon, Supabase ou Render.

Para conferir se esta tudo instalado:

```bash
node -v
npm -v
git --version
```

### 2. Baixar o projeto

Pelo Git:

```bash
git clone URL_DO_REPOSITORIO
cd Projeto-Consultor-Financeiro
```

Troque `URL_DO_REPOSITORIO` pela URL real do repositorio, por exemplo:

```bash
git clone https://github.com/seu-usuario/seu-repositorio.git
```

Se receber o projeto em `.zip`, extraia a pasta e abra o terminal dentro dela.

### 3. Instalar as dependencias

Na raiz do projeto, execute:

```bash
npm install
```

Se quiser instalar exatamente as versoes registradas no `package-lock.json`, use:

```bash
npm ci
```

## Configuracao Do Ambiente

Crie um arquivo chamado `.env` na raiz do projeto.

Exemplo:

```env
OPENROUTER_API_KEY=sua_chave_openrouter_aqui
OPENROUTER_MODEL=openai/gpt-oss-120b:free
OPENROUTER_SITE_URL=http://localhost:3000
PORT=3000
DATABASE_URL=postgresql://usuario:senha@host:5432/banco
```

### O que cada variavel faz

| Variavel | Obrigatoria | Descricao |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | Sim | Chave da API do OpenRouter. |
| `OPENROUTER_MODEL` | Nao | Modelo usado na analise. Se nao informar, usa `openai/gpt-oss-120b:free`. |
| `OPENROUTER_SITE_URL` | Nao | URL enviada ao OpenRouter como origem da aplicacao. |
| `PORT` | Nao | Porta local do servidor. Se nao informar, usa `3000`. |
| `DATABASE_URL` | Sim | String de conexao do PostgreSQL. |

Nunca envie o arquivo `.env` para o GitHub. Ele contem dados sensiveis e ja esta no `.gitignore`.

## Configuracao Do Banco De Dados

O projeto precisa de um banco PostgreSQL com as tabelas `categories`, `imports` e `transactions`.

Execute o SQL abaixo no seu banco. Pode ser pelo terminal `psql`, pelo painel do Neon/Supabase ou por outra ferramenta de banco.

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE category_type AS ENUM ('income', 'expense');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL UNIQUE,
  type category_type NOT NULL DEFAULT 'expense',
  color varchar(20) NOT NULL DEFAULT '#2563eb',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank varchar(40) NOT NULL,
  original_file_name varchar(255) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'completed',
  transaction_count integer NOT NULL DEFAULT 0,
  statement_month char(7),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  date date NOT NULL,
  description varchar(500) NOT NULL,
  amount numeric(12, 2) NOT NULL,
  type varchar(20) NOT NULL CHECK (type IN ('income', 'expense', 'ignored')),
  ocr_confidence numeric(4, 3) NOT NULL DEFAULT 1,
  category_name varchar(120),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_import_id ON transactions(import_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_imports_created_at ON imports(created_at);
```

Opcionalmente, cadastre algumas categorias iniciais:

```sql
INSERT INTO categories (name, type, color) VALUES
  ('Alimentacao', 'expense', '#ef4444'),
  ('Transporte', 'expense', '#f97316'),
  ('Moradia', 'expense', '#8b5cf6'),
  ('Saude', 'expense', '#14b8a6'),
  ('Educacao', 'expense', '#3b82f6'),
  ('Lazer', 'expense', '#ec4899'),
  ('Outros', 'expense', '#64748b'),
  ('Salario', 'income', '#22c55e'),
  ('Freelance', 'income', '#10b981'),
  ('Rendimentos', 'income', '#84cc16')
ON CONFLICT (name) DO NOTHING;
```

Se o banco ja existir e faltar apenas o campo `type` em categorias, tambem existe a migracao:

```bash
db/migrations/001_add_category_type.sql
```

## Como Rodar O Projeto

Na raiz do projeto:

```bash
npm start
```

Ou, durante desenvolvimento:

```bash
npm run dev
```

Depois acesse:

- Consultoria com IA: `http://localhost:3000`
- Painel financeiro: `http://localhost:3000/painel`
- Status da API: `http://localhost:3000/api/status`

Se voce mudou a variavel `PORT`, troque `3000` pela porta escolhida.

## Scripts Disponiveis

```bash
npm run dev     # inicia o servidor em modo desenvolvimento
npm start       # inicia o servidor
npm run build   # gera o build do Next.js
npm run lint    # verifica problemas de padronizacao no codigo
```

## Estrutura Do Projeto

```text
.
|-- server.js                  # Servidor Express, Next.js, PostgreSQL e OpenRouter
|-- package.json               # Dependencias e scripts do projeto
|-- package-lock.json          # Versoes travadas das dependencias
|-- public/
|   |-- index.html             # Pagina inicial da consultoria com IA
|   |-- script.js              # Formulario e chamada para /api/llm
|   `-- styles.css             # Estilos da pagina inicial
|-- app/
|   |-- layout.tsx
|   |-- globals.css
|   `-- painel/                # Rotas do painel financeiro
|-- components/
|   |-- categories/            # Tela de categorias
|   |-- charts/                # Graficos do dashboard
|   |-- dashboard/             # Dashboard financeiro
|   |-- imports/               # Importacao e revisao de extratos
|   |-- layout/                # Header e Footer
|   `-- ui/                    # Componentes visuais reutilizaveis
|-- lib/
|   |-- api.ts                 # Cliente das rotas internas
|   |-- importer.ts            # Leitura local de PDF/imagem
|   `-- store.ts               # Calculos e utilitarios do painel
|-- types/
|   `-- index.ts               # Tipos compartilhados
`-- db/
    `-- migrations/            # Scripts SQL de migracao
```

## Principais Rotas Da API

| Metodo | Rota | Funcao |
| --- | --- | --- |
| `GET` | `/api/status` | Verifica se a API local esta funcionando. |
| `POST` | `/api/llm` | Envia o prompt financeiro para o OpenRouter. |
| `GET` | `/api/categories` | Lista categorias ativas. |
| `POST` | `/api/categories` | Cria categoria. |
| `PUT` | `/api/categories/:id` | Atualiza categoria. |
| `DELETE` | `/api/categories/:id` | Desativa categoria. |
| `GET` | `/api/imports` | Lista importacoes salvas. |
| `GET` | `/api/imports/:id` | Busca uma importacao com transacoes. |
| `POST` | `/api/imports` | Salva uma importacao revisada. |
| `PUT` | `/api/imports/:id/transactions` | Atualiza categorias das transacoes. |
| `GET` | `/api/transactions` | Lista transacoes salvas. |

## Testes Rapidos

Verificar API:

```bash
curl http://localhost:3000/api/status
```

Testar IA:

```bash
curl -X POST http://localhost:3000/api/llm \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"Tenho renda de R$ 3000 e gastos de R$ 2200. Como organizar minha reserva?\"}"
```

## Problemas Comuns

### Erro: configure OPENROUTER_API_KEY

O arquivo `.env` nao existe ou nao tem a variavel `OPENROUTER_API_KEY`.

### Erro: configure DATABASE_URL

O arquivo `.env` nao existe ou nao tem a variavel `DATABASE_URL`.

### Erro de conexao com o banco

Confira se:

- A `DATABASE_URL` esta correta.
- O banco PostgreSQL esta ativo.
- O SSL esta configurado se o provedor exigir.
- As tabelas foram criadas.

### Porta em uso

Se a porta `3000` ja estiver sendo usada, altere no `.env`:

```env
PORT=3001
OPENROUTER_SITE_URL=http://localhost:3001
```

Depois acesse `http://localhost:3001`.

### Dependencias com erro

Apague `node_modules` e instale novamente:

```bash
npm install
```

## Observacoes De Seguranca

- Nao publique `.env`.
- Nao coloque chaves reais no README.
- Se uma chave de API ou senha de banco for compartilhada por engano, gere uma nova chave no provedor.
- Em outra maquina, cada pessoa deve configurar o proprio `.env`.

## Arquivos Que Nao Precisam Ser Copiados

Estes arquivos e pastas sao gerados automaticamente e nao precisam ir para outra maquina:

```text
node_modules/
.next/
.npm-cache/
*.tsbuildinfo
.env
```

Ao baixar o projeto em outro computador, basta rodar `npm install` para recriar as dependencias.
