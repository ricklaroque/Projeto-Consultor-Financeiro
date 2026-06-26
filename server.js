import express from "express";
import cors from "cors";
import "dotenv/config";
import next from "next";
import pg from "pg";

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const API_KEY = process.env.OPENROUTER_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b:free";
const isDevelopment = process.env.NODE_ENV !== "production";
const nextApp = next({ dev: isDevelopment, hostname: "localhost", port: PORT });
const handleNextRequest = nextApp.getRequestHandler();

if (!API_KEY) {
  console.error("Erro: configure OPENROUTER_API_KEY no arquivo .env.");
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error("Erro: configure DATABASE_URL no arquivo .env.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });

function categoryFromRow(row) {
  return { id: row.id, name: row.name, type: row.type, color: row.color, createdAt: row.created_at };
}

function importFromRow(row) {
  return {
    id: row.id,
    importId: row.import_id,
    fileName: row.original_file_name,
    bank: row.bank,
    statementMonth: row.statement_month,
    transactionCount: Number(row.transaction_count),
    total: Number(row.total || 0),
    createdAt: row.created_at,
  };
}

function importDetailFromRow(row, transactions) {
  return { ...importFromRow(row), transactions };
}

function transactionFromRow(row) {
  const date = row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date);
  const [year, month, day] = date.split("-");
  return {
    id: row.id,
    date: `${day}/${month}/${year}`,
    description: row.description,
    amount: Number(row.amount),
    type: row.type,
    importId: row.import_id,
    category: row.category_name || "",
    confidence: Number(row.ocr_confidence ?? 1),
    statementMonth: row.statement_month,
    sourceFile: row.original_file_name,
    importedAt: row.created_at,
    bank: row.bank,
  };
}

function databaseMonth(value) {
  if (value === null || value === undefined || value === "") return null;
  const match = /^(\d{4})-(\d{2})$/.exec(String(value));
  if (!match) throw new Error(`Mes da fatura invalido: ${value}`);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error(`Mes da fatura invalido: ${value}`);
  return `${match[1]}-${match[2]}`;
}

function databaseDate(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value));
  if (!match) throw new Error(`Data invalida: ${value}`);
  const result = `${match[3]}-${match[2]}-${match[1]}`;
  const parsed = new Date(`${result}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== result) throw new Error(`Data invalida: ${value}`);
  return result;
}

await nextApp.prepare();

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

app.get("/api/categories", async (_request, response) => {
  try {
    const { rows } = await pool.query("SELECT id, name, type, color, created_at FROM categories WHERE active = true ORDER BY type, name");
    response.json(rows.map(categoryFromRow));
  } catch (error) {
    console.error("Erro ao listar categorias:", error);
    response.status(500).json({ erro: "Nao foi possivel carregar as categorias." });
  }
});

app.post("/api/categories", async (request, response) => {
  const name = String(request.body?.name || "").trim();
  const type = request.body?.type;
  const color = request.body?.color;
  if (!name || !["income", "expense"].includes(type) || !/^#[0-9a-f]{6}$/i.test(color)) return response.status(400).json({ erro: "Dados da categoria invalidos." });
  try {
    const { rows } = await pool.query("INSERT INTO categories (name, type, color) VALUES ($1, $2, $3) ON CONFLICT (name) DO UPDATE SET type=EXCLUDED.type, color=EXCLUDED.color, active=true RETURNING id, name, type, color, created_at", [name, type, color]);
    response.status(201).json(categoryFromRow(rows[0]));
  } catch (error) {
    console.error("Erro ao criar categoria:", error);
    response.status(500).json({ erro: "Nao foi possivel cadastrar a categoria." });
  }
});

app.put("/api/categories/:id", async (request, response) => {
  const name = String(request.body?.name || "").trim();
  const type = request.body?.type;
  const color = request.body?.color;
  if (!name || !["income", "expense"].includes(type) || !/^#[0-9a-f]{6}$/i.test(color)) return response.status(400).json({ erro: "Dados da categoria invalidos." });
  try {
    const { rows } = await pool.query("UPDATE categories SET name=$1, type=$2, color=$3 WHERE id=$4 AND active=true RETURNING id, name, type, color, created_at", [name, type, color, request.params.id]);
    if (!rows.length) return response.status(404).json({ erro: "Categoria nao encontrada." });
    response.json(categoryFromRow(rows[0]));
  } catch (error) {
    if (error?.code === "23505") return response.status(409).json({ erro: "Ja existe uma categoria com esse nome." });
    console.error("Erro ao atualizar categoria:", error);
    response.status(500).json({ erro: "Nao foi possivel atualizar a categoria." });
  }
});

app.delete("/api/categories/:id", async (request, response) => {
  try {
    const result = await pool.query("UPDATE categories SET active=false WHERE id=$1 AND active=true", [request.params.id]);
    if (!result.rowCount) return response.status(404).json({ erro: "Categoria nao encontrada." });
    response.json({ ok: true });
  } catch (error) {
    console.error("Erro ao excluir categoria:", error);
    response.status(500).json({ erro: "Nao foi possivel excluir a categoria." });
  }
});

app.get("/api/imports", async (_request, response) => {
  try {
    const { rows } = await pool.query(`
      SELECT i.id, i.bank, i.original_file_name, i.transaction_count, i.created_at, i.statement_month,
        COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS total
      FROM imports i LEFT JOIN transactions t ON t.import_id = i.id
      WHERE i.status = 'completed'
      GROUP BY i.id ORDER BY i.created_at DESC
    `);
    response.json(rows.map(importFromRow));
  } catch (error) {
    console.error("Erro ao listar importacoes:", error);
    response.status(500).json({ erro: "Nao foi possivel carregar as importacoes." });
  }
});

app.get("/api/imports/:id", async (request, response) => {
  try {
    const { rows: importRows } = await pool.query(`
      SELECT i.id, i.bank, i.original_file_name, i.transaction_count, i.created_at, i.statement_month,
        COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS total
      FROM imports i LEFT JOIN transactions t ON t.import_id = i.id
      WHERE i.id = $1 AND i.status = 'completed'
      GROUP BY i.id
    `, [request.params.id]);
    if (!importRows.length) return response.status(404).json({ erro: "Importacao nao encontrada." });
    const { rows: transactionRows } = await pool.query(`
      SELECT t.id, t.import_id, t.date, t.description, t.amount, t.type, t.ocr_confidence, t.created_at,
        COALESCE(c.name, t.category_name) AS category_name,
        i.statement_month, i.original_file_name, i.bank
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      LEFT JOIN imports i ON i.id = t.import_id
      WHERE t.import_id = $1 AND t.type <> 'ignored'
      ORDER BY t.date ASC, t.created_at ASC
    `, [request.params.id]);
    response.json(importDetailFromRow(importRows[0], transactionRows.map(transactionFromRow)));
  } catch (error) {
    console.error("Erro ao carregar importacao:", error);
    response.status(500).json({ erro: "Nao foi possivel carregar a importacao." });
  }
});

app.get("/api/transactions", async (_request, response) => {
  try {
    const { rows } = await pool.query(`
      SELECT t.id, t.import_id, t.date, t.description, t.amount, t.type, t.ocr_confidence, t.created_at,
        COALESCE(c.name, t.category_name) AS category_name,
        i.statement_month, i.original_file_name, i.bank
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      LEFT JOIN imports i ON i.id = t.import_id
      WHERE t.type <> 'ignored'
      ORDER BY t.date DESC, t.created_at DESC
    `);
    response.json(rows.map(transactionFromRow));
  } catch (error) {
    console.error("Erro ao listar transacoes:", error);
    response.status(500).json({ erro: "Nao foi possivel carregar as transacoes." });
  }
});

app.post("/api/imports", async (request, response) => {
  const { bank, fileName, statementMonth, transactions } = request.body || {};
  if (!["nubank", "banco-do-brasil"].includes(bank) || !String(fileName || "").trim() || !Array.isArray(transactions) || !transactions.length) return response.status(400).json({ erro: "Dados da importacao invalidos." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query("INSERT INTO imports (bank, original_file_name, status, transaction_count, statement_month) VALUES ($1, $2, 'completed', $3, $4) RETURNING id, bank, original_file_name, transaction_count, created_at, statement_month", [bank, String(fileName).slice(0, 255), transactions.length, databaseMonth(statementMonth)]);
    const categoryRows = await client.query("SELECT id, name FROM categories WHERE active=true");
    const categoryIds = new Map(categoryRows.rows.map((row) => [row.name, row.id]));
    let total = 0;
    for (const item of transactions) {
      if (!["income", "expense"].includes(item.type) || !String(item.description || "").trim() || !Number.isFinite(Number(item.amount))) throw new Error("Uma das transacoes possui dados invalidos.");
      const amount = Math.abs(Number(item.amount));
      if (item.type === "expense") total += amount;
      await client.query("INSERT INTO transactions (import_id, category_id, date, description, amount, type, ocr_confidence, category_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [inserted.rows[0].id, categoryIds.get(item.category) || null, databaseDate(item.date), String(item.description).trim().slice(0, 500), amount, item.type, Number(item.confidence ?? 1), item.category || null]);
    }
    await client.query("COMMIT");
    response.status(201).json(importFromRow({ ...inserted.rows[0], total }));
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Erro ao salvar importacao:", error);
    response.status(400).json({ erro: error instanceof Error ? error.message : "Nao foi possivel salvar a importacao." });
  } finally {
    client.release();
  }
});

app.put("/api/imports/:id/transactions", async (request, response) => {
  const transactions = request.body?.transactions;
  if (!Array.isArray(transactions) || !transactions.length) return response.status(400).json({ erro: "Informe as transacoes para atualizar." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const importCheck = await client.query("SELECT id FROM imports WHERE id=$1 AND status='completed'", [request.params.id]);
    if (!importCheck.rows.length) {
      await client.query("ROLLBACK");
      return response.status(404).json({ erro: "Importacao nao encontrada." });
    }
    const categoryRows = await client.query("SELECT id, name, type FROM categories WHERE active=true");
    const categoriesByName = new Map(categoryRows.rows.map((row) => [row.name, row]));
    for (const item of transactions) {
      const id = String(item.id || "").trim();
      const category = String(item.category || "").trim();
      if (!id || !category) throw new Error("Todas as transacoes precisam de uma categoria.");
      const transaction = await client.query("SELECT id, type FROM transactions WHERE id=$1 AND import_id=$2", [id, request.params.id]);
      if (!transaction.rows.length) throw new Error("Uma das transacoes nao pertence a esta importacao.");
      const categoryRow = categoriesByName.get(category);
      if (!categoryRow || categoryRow.type !== transaction.rows[0].type) throw new Error(`Categoria invalida para a transacao: ${category}`);
      await client.query("UPDATE transactions SET category_id=$1, category_name=$2 WHERE id=$3 AND import_id=$4", [categoryRow.id, categoryRow.name, id, request.params.id]);
    }
    await client.query("COMMIT");
    const { rows } = await pool.query(`
      SELECT t.id, t.import_id, t.date, t.description, t.amount, t.type, t.ocr_confidence, t.created_at,
        COALESCE(c.name, t.category_name) AS category_name,
        i.statement_month, i.original_file_name, i.bank
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      LEFT JOIN imports i ON i.id = t.import_id
      WHERE t.import_id = $1 AND t.type <> 'ignored'
      ORDER BY t.date ASC, t.created_at ASC
    `, [request.params.id]);
    response.json(rows.map(transactionFromRow));
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Erro ao atualizar importacao:", error);
    response.status(400).json({ erro: error instanceof Error ? error.message : "Nao foi possivel atualizar a importacao." });
  } finally {
    client.release();
  }
});

app.get("/api/status", (_request, response) => {
  response.json({ status: "API local funcionando", model: MODEL });
});

function sanitizeLlmResponseLegacy(text) {
  return String(text)
    .replace(/\*?Esta analise nao substitui a consultoria de um profissional de financas\. Avalie sempre suas condicoes especificas antes de tomar decisoes\.\*?/gi, "")
    .replace(/\*?Esta análise não substitui a consultoria de um profissional de finanças\. Avalie sempre suas condições específicas antes de tomar decisões\.\*?/gi, "")
    .trim();
}

function sanitizeLlmResponse(text) {
  const disclaimer = "esta analise nao substitui a consultoria de um profissional de financas";
  return String(text)
    .split(/\r?\n/)
    .filter((line) => !line.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(disclaimer))
    .join("\n")
    .trim();
}

app.post("/api/llm", async (request, response) => {
  try {
    const { prompt } = request.body ?? {};

    if (typeof prompt !== "string" || prompt.trim().length === 0) {
      return response.status(400).json({ erro: "O campo prompt e obrigatorio." });
    }

    if (prompt.length > 2000) {
      return response.status(400).json({ erro: "Limite: 2000 caracteres." });
    }

    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL || `http://localhost:${PORT}`,
        "X-OpenRouter-Title": "Finora - Projeto FIA ADS",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: [
              "Voce e um consultor financeiro educacional brasileiro.",
              "Analise somente os dados fornecidos e nao invente valores.",
              "Responda de forma objetiva, didatica e responsavel.",
              "Quando falar de investimentos, sugira classes, indices ou veiculos educacionais adequados ao perfil e objetivo, como renda fixa, Tesouro Direto, CDB, LCI/LCA, fundos DI, fundos/ETFs ligados ao Ibovespa, FIIs, previdencia ou acoes.",
              "Explique o motivo de cada sugestao e destaque quando reserva, dividas ou estabilidade devem vir antes de renda variavel.",
              "Organize a resposta em: diagnostico, pontos de atencao, caminhos de investimento personalizados, plano de acao e proximos passos.",
              "Nao prometa rentabilidade.",
            ].join(" "),
          },
          { role: "user", content: prompt.trim() },
        ],
        temperature: 0.7,
        max_completion_tokens: 700,
      }),
    });

    if (!openRouterResponse.ok) {
      const detalhe = await openRouterResponse.text();
      return response.status(502).json({
        erro: "Erro ao consultar o OpenRouter.",
        status: openRouterResponse.status,
        detalhe,
      });
    }

    const data = await openRouterResponse.json();
    const text = data.choices?.[0]?.message?.content;

    if (!text) {
      return response.status(502).json({ erro: "Resposta vazia ou inesperada." });
    }

    return response.json({ modelo: MODEL, resposta: sanitizeLlmResponse(text), uso: data.usage ?? null });
  } catch (error) {
    console.error("Erro interno ao consultar o OpenRouter:", error);
    return response.status(500).json({
      erro: "Erro interno no servidor.",
      detalhe: error instanceof Error ? error.message : "Erro desconhecido.",
    });
  }
});

app.use((request, response) => handleNextRequest(request, response));

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
