/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const DAY = 86_400_000;

function day(offset: number) {
  return new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
}

async function ensureWorkshopSchema(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS repairs (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      ticket_no text NOT NULL UNIQUE,
      device text NOT NULL,
      brand_model text NOT NULL,
      customer text NOT NULL,
      phone text DEFAULT '' NOT NULL,
      issue text NOT NULL,
      status text DEFAULT 'received' NOT NULL,
      priority text DEFAULT 'normal' NOT NULL,
      received_at text NOT NULL,
      due_at text NOT NULL,
      estimate real DEFAULT 0 NOT NULL,
      actual_charge real DEFAULT 0 NOT NULL,
      is_paid integer DEFAULT 0 NOT NULL,
      serial_number text DEFAULT '' NOT NULL,
      notes text DEFAULT '' NOT NULL,
      created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS parts (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      repair_id integer REFERENCES repairs(id),
      name text NOT NULL,
      supplier text NOT NULL,
      order_no text DEFAULT '' NOT NULL,
      cost real DEFAULT 0 NOT NULL,
      status text DEFAULT 'to_order' NOT NULL,
      expected_at text DEFAULT '' NOT NULL,
      created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_repairs_status_due_at ON repairs (status, due_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_repairs_customer ON repairs (customer)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_parts_repair_id ON parts (repair_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_parts_status_expected_at ON parts (status, expected_at)"),
  ]);

  // Keep older workshop databases compatible before hosted migrations run.
  const columns = await db.prepare("PRAGMA table_info(repairs)").all<{ name: string }>();
  const names = new Set(columns.results.map((column) => column.name));
  const upgrades: D1PreparedStatement[] = [];
  if (!names.has("actual_charge")) upgrades.push(db.prepare("ALTER TABLE repairs ADD COLUMN actual_charge real DEFAULT 0 NOT NULL"));
  if (!names.has("is_paid")) upgrades.push(db.prepare("ALTER TABLE repairs ADD COLUMN is_paid integer DEFAULT 0 NOT NULL"));
  if (!names.has("serial_number")) upgrades.push(db.prepare("ALTER TABLE repairs ADD COLUMN serial_number text DEFAULT '' NOT NULL"));
  if (upgrades.length) await db.batch(upgrades);
}

async function seedWorkshop(db: D1Database) {
  const existing = await db.prepare("SELECT id FROM repairs LIMIT 1").first();
  if (existing) return;
  const repairInsert = `INSERT INTO repairs
    (ticket_no, device, brand_model, customer, phone, issue, status, priority, received_at, due_at, estimate, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  await db.batch([
    db.prepare(repairInsert).bind("FIX-1048", "笔记本电脑", "MacBook Pro 14\" · M2", "林晓", "604-555-0138", "进水后无法开机，指示灯不亮", "diagnosing", "urgent", day(-1), day(1), 420, "已断电，等待主板检测结果"),
    db.prepare(repairInsert).bind("FIX-1047", "数码相机", "Sony α7 IV", "陈墨", "604-555-0186", "快门偶发卡住，拍摄有黑屏", "waiting_parts", "normal", day(-3), day(3), 285, "已确认快门组件磨损"),
    db.prepare(repairInsert).bind("FIX-1046", "游戏主机", "Nintendo Switch OLED", "Maya", "778-555-0192", "USB-C 充电口松动", "repairing", "normal", day(-2), day(0), 145, "正在更换接口并清理焊盘"),
    db.prepare(repairInsert).bind("FIX-1045", "平板电脑", "iPad Air 5", "周宁", "604-555-0171", "屏幕碎裂，触控局部失效", "testing", "normal", day(-5), day(0), 260, "新屏已安装，进行触控老化测试"),
    db.prepare(repairInsert).bind("FIX-1044", "镜头", "Canon RF 24–70mm", "Oliver", "778-555-0144", "变焦环阻尼异常，有沙粒感", "ready", "normal", day(-7), day(-1), 190, "已清洁润滑，等待取件"),
    db.prepare(repairInsert).bind("FIX-1049", "台式电脑", "Custom PC · RTX 4070", "王澈", "604-555-0124", "运行游戏时随机重启", "received", "urgent", day(0), day(2), 90, "待压力测试电源与显卡"),
  ]);
  const ids = await db.prepare("SELECT id, ticket_no AS ticketNo FROM repairs").all<{ id: number; ticketNo: string }>();
  const ticketIds = Object.fromEntries(ids.results.map((row) => [row.ticketNo, row.id]));
  const partInsert = `INSERT INTO parts (repair_id, name, supplier, order_no, cost, status, expected_at) VALUES (?, ?, ?, ?, ?, ?, ?)`;
  await db.batch([
    db.prepare(partInsert).bind(ticketIds["FIX-1047"], "原厂快门组件", "CamParts BC", "CP-88291", 128, "shipped", day(1)),
    db.prepare(partInsert).bind(ticketIds["FIX-1046"], "USB-C 充电接口", "MicroSolder", "MS-23904", 18.5, "received", day(-1)),
    db.prepare(partInsert).bind(ticketIds["FIX-1048"], "主板电源管理芯片", "DigiKey", "", 32, "to_order", day(4)),
  ]);
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

async function workshopApi(request: Request, db: D1Database) {
  try {
    await ensureWorkshopSchema(db);
    if (new URL(request.url).hostname === "localhost") await seedWorkshop(db);
    if (request.method === "GET") {
      const [repairRows, partRows] = await Promise.all([
        db.prepare(`SELECT id, ticket_no AS ticketNo, device, brand_model AS brandModel, customer, phone, issue, status, priority, received_at AS receivedAt, due_at AS dueAt, estimate, actual_charge AS actualCharge, is_paid AS isPaid, serial_number AS serialNumber, notes FROM repairs ORDER BY created_at DESC, id DESC`).all(),
        db.prepare(`SELECT id, repair_id AS repairId, name, supplier, order_no AS orderNo, cost, status, expected_at AS expectedAt FROM parts ORDER BY created_at DESC, id DESC`).all(),
      ]);
      return json({ repairs: repairRows.results, parts: partRows.results });
    }

    const payload = await request.json() as Record<string, unknown>;
    if (request.method === "POST" && payload.kind === "part") {
      if (!payload.name || !payload.supplier) return json({ error: "请填写零件名称和供应商" }, 400);
      await db.prepare(`INSERT INTO parts (repair_id, name, supplier, order_no, cost, status, expected_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(payload.repairId ? Number(payload.repairId) : null, String(payload.name), String(payload.supplier), String(payload.orderNo ?? ""), Number(payload.cost ?? 0), String(payload.status ?? "to_order"), String(payload.expectedAt ?? "")).run();
      return json({ ok: true }, 201);
    }
    if (request.method === "POST") {
      const required = ["device", "brandModel", "customer", "issue", "dueAt"];
      if (required.some((key) => !payload[key])) return json({ error: "请填写所有必填项" }, 400);
      const latest = await db.prepare("SELECT MAX(CAST(SUBSTR(ticket_no, 5) AS INTEGER)) AS value FROM repairs WHERE ticket_no LIKE 'FIX-%'").first<{ value: number | null }>();
      const ticketNo = `FIX-${Math.max(1000, latest?.value ?? 1000) + 1}`;
      const result = await db.prepare(`INSERT INTO repairs (ticket_no, device, brand_model, customer, phone, issue, status, priority, received_at, due_at, estimate, actual_charge, serial_number, notes) VALUES (?, ?, ?, ?, ?, ?, 'received', ?, ?, ?, ?, ?, ?, ?)`)
        .bind(ticketNo, String(payload.device), String(payload.brandModel), String(payload.customer), String(payload.phone ?? ""), String(payload.issue), String(payload.priority ?? "normal"), day(0), String(payload.dueAt), Number(payload.estimate ?? 0), Number(payload.actualCharge ?? 0), String(payload.serialNumber ?? ""), String(payload.notes ?? "")).run();
      return json({ ok: true, id: result.meta.last_row_id, ticketNo }, 201);
    }
    if (request.method === "PATCH") {
      if (!payload.id) return json({ error: "缺少记录 ID" }, 400);
      if (payload.target === "part") {
        const partStatuses = new Set(["to_order", "ordered", "shipped", "received"]);
        if (!partStatuses.has(String(payload.status))) return json({ error: "无效的零件状态" }, 400);
        await db.prepare("UPDATE parts SET status = ? WHERE id = ?").bind(String(payload.status), Number(payload.id)).run();
      } else {
        const repairStatuses = new Set(["received", "diagnosing", "waiting_parts", "repairing", "testing", "ready", "collected"]);
        if (payload.status !== undefined && !repairStatuses.has(String(payload.status))) return json({ error: "无效的工单状态" }, 400);
        const current = await db.prepare("SELECT * FROM repairs WHERE id = ?").bind(Number(payload.id)).first<Record<string, unknown>>();
        if (!current) return json({ error: "找不到该工单" }, 404);
        const value = (key: string, column: string) => payload[key] !== undefined ? payload[key] : current[column];
        await db.prepare(`UPDATE repairs SET
          device = ?, brand_model = ?, customer = ?, phone = ?, issue = ?, status = ?, priority = ?,
          due_at = ?, estimate = ?, actual_charge = ?, is_paid = ?, serial_number = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`)
          .bind(
            String(value("device", "device")), String(value("brandModel", "brand_model")), String(value("customer", "customer")),
            String(value("phone", "phone")), String(value("issue", "issue")), String(value("status", "status")),
            String(value("priority", "priority")), String(value("dueAt", "due_at")), Number(value("estimate", "estimate")),
            Number(value("actualCharge", "actual_charge")), payload.isPaid !== undefined ? (payload.isPaid ? 1 : 0) : Number(current.is_paid),
            String(value("serialNumber", "serial_number")), String(value("notes", "notes")), Number(payload.id),
          ).run();
      }
      return json({ ok: true });
    }
    return json({ error: "不支持的请求" }, 405);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "未知错误" }, 500);
  }
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/workshop") {
      return workshopApi(request, env.DB);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
