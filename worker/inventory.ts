/**
 * Inventory API: spare parts and whole devices currently in stock.
 *
 * Spare parts are only ever kept in good condition (broken ones are thrown
 * away), so a part is always "good". Whole devices can be "good" or "broken";
 * the same model in both conditions is two rows.
 */

type Kind = "part" | "device";
type Condition = "good" | "broken";

type Row = {
  id: number;
  kind: Kind;
  name: string;
  category: string;
  condition: Condition;
  quantity: number;
  location: string;
  unitCost: number;
  notes: string;
};

const MAX_QUANTITY = 100_000;
const MAX_COST = 10_000_000;

class Invalid extends Error {}

// Created on demand like the workshop tables, so no migration has to run first.
const schemaReady = new WeakSet<D1Database>();

async function ensureSchema(db: D1Database) {
  if (schemaReady.has(db)) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS inventory (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      kind text NOT NULL,
      name text NOT NULL,
      category text DEFAULT '' NOT NULL,
      condition text DEFAULT 'good' NOT NULL,
      quantity integer DEFAULT 0 NOT NULL,
      location text DEFAULT '' NOT NULL,
      unit_cost real DEFAULT 0 NOT NULL,
      notes text DEFAULT '' NOT NULL,
      created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_inventory_kind_condition ON inventory (kind, condition)"),
  ]);
  schemaReady.add(db);
}

const SELECT = `SELECT id, kind, name, category, condition, quantity, location, unit_cost AS unitCost, notes FROM inventory`;

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function text(value: unknown, label: string, max: number, required = false) {
  const result = value === undefined || value === null ? "" : String(value).trim();
  if (required && !result) throw new Invalid(`请填写${label}`);
  if (result.length > max) throw new Invalid(`${label}不能超过 ${max} 个字符`);
  return result;
}

// Form posts send numbers as strings; accept those but nothing fractional.
function integer(value: unknown, label: string, min: number, max: number) {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) {
    throw new Invalid(`${label}必须是 ${min} 到 ${max} 之间的整数`);
  }
  return n;
}

function cost(value: unknown) {
  if (value === undefined || value === null || value === "") return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > MAX_COST) throw new Invalid("单价必须是不小于 0 的数字");
  return Math.round(n * 100) / 100;
}

// Merge the request over the existing row (if any) and validate the result.
function build(input: Record<string, unknown>, current?: Row): Omit<Row, "id"> {
  const pick = (key: keyof Row) => (input[key] !== undefined ? input[key] : current?.[key]);

  const kind = current ? current.kind : pick("kind");
  if (kind !== "part" && kind !== "device") throw new Invalid("类型必须是零配件或整机");

  let condition: Condition = "good";
  if (kind === "device") {
    const value = pick("condition") ?? "good";
    if (value !== "good" && value !== "broken") throw new Invalid("整机状态必须是完好或损坏");
    condition = value;
  } else if (input.condition === "broken") {
    throw new Invalid("零配件只记录完好的，损坏的直接丢弃即可");
  }

  return {
    kind,
    name: text(pick("name"), "名称", 100, true),
    category: text(pick("category"), "分类", 50),
    condition,
    quantity: integer(pick("quantity") ?? 0, "数量", 0, MAX_QUANTITY),
    location: text(pick("location"), "存放位置", 100),
    unitCost: cost(pick("unitCost")),
    notes: text(pick("notes"), "备注", 1000),
  };
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new Invalid("请求内容无效");
}

function idFrom(value: unknown) {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1) throw new Invalid("缺少有效的记录 ID");
  return n;
}

export async function inventoryApi(request: Request, db: D1Database): Promise<Response> {
  try {
    await ensureSchema(db);

    if (request.method === "GET") {
      const { results } = await db.prepare(`${SELECT} ORDER BY kind DESC, name COLLATE NOCASE, condition, id`).all<Row>();
      return json({ items: results });
    }

    if (request.method === "DELETE") {
      const id = idFrom(new URL(request.url).searchParams.get("id"));
      const result = await db.prepare("DELETE FROM inventory WHERE id = ?").bind(id).run();
      return result.meta.changes ? json({ ok: true }) : json({ error: "找不到该库存记录" }, 404);
    }

    if (request.method === "POST") {
      const item = build(await readBody(request));
      const result = await db
        .prepare(`INSERT INTO inventory (kind, name, category, condition, quantity, location, unit_cost, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(item.kind, item.name, item.category, item.condition, item.quantity, item.location, item.unitCost, item.notes)
        .run();
      return json({ ok: true, id: result.meta.last_row_id }, 201);
    }

    if (request.method === "PATCH") {
      const payload = await readBody(request);
      const id = idFrom(payload.id);

      // +/- buttons: one atomic statement, so rapid clicks can never go below zero.
      if (payload.delta !== undefined) {
        const delta = integer(payload.delta, "调整数量", -MAX_QUANTITY, MAX_QUANTITY);
        const result = await db
          .prepare(`UPDATE inventory SET quantity = quantity + ?1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?2 AND quantity + ?1 >= 0 AND quantity + ?1 <= ?3`)
          .bind(delta, id, MAX_QUANTITY)
          .run();
        if (result.meta.changes) return json({ ok: true });
        const exists = await db.prepare("SELECT id FROM inventory WHERE id = ?").bind(id).first();
        return exists ? json({ error: "库存数量超出范围（不能为负）" }, 400) : json({ error: "找不到该库存记录" }, 404);
      }

      const current = await db.prepare(`${SELECT} WHERE id = ?`).bind(id).first<Row>();
      if (!current) return json({ error: "找不到该库存记录" }, 404);
      const item = build(payload, current);
      await db
        .prepare(`UPDATE inventory SET name = ?, category = ?, condition = ?, quantity = ?, location = ?, unit_cost = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .bind(item.name, item.category, item.condition, item.quantity, item.location, item.unitCost, item.notes, id)
        .run();
      return json({ ok: true });
    }

    return json({ error: "不支持的请求" }, 405);
  } catch (error) {
    if (error instanceof Invalid) return json({ error: error.message }, 400);
    console.error("inventory api failed:", error);
    return json({ error: "服务器错误，请稍后重试" }, 500);
  }
}
