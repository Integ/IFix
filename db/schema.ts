import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const repairs = sqliteTable("repairs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticketNo: text("ticket_no").notNull().unique(),
  device: text("device").notNull(),
  brandModel: text("brand_model").notNull(),
  customer: text("customer").notNull(),
  phone: text("phone").notNull().default(""),
  issue: text("issue").notNull(),
  status: text("status").notNull().default("received"),
  priority: text("priority").notNull().default("normal"),
  receivedAt: text("received_at").notNull(),
  dueAt: text("due_at").notNull(),
  estimate: real("estimate").notNull().default(0),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const parts = sqliteTable("parts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  repairId: integer("repair_id").references(() => repairs.id),
  name: text("name").notNull(),
  supplier: text("supplier").notNull(),
  orderNo: text("order_no").notNull().default(""),
  cost: real("cost").notNull().default(0),
  status: text("status").notNull().default("to_order"),
  expectedAt: text("expected_at").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
