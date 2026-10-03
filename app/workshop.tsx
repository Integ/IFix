import { Camera, Computer, Phone, PlugZap, Smartphone, Tv, Wrench } from "lucide-react";
import { useSyncExternalStore } from "react";

export type Status = "received" | "diagnosing" | "waiting_parts" | "repairing" | "testing" | "ready" | "collected";
export type PartStatus = "to_order" | "ordered" | "shipped" | "received";

export type Repair = {
  id: number; ticketNo: string; device: string; brandModel: string; customer: string;
  phone: string; issue: string; status: Status; priority: "normal" | "urgent";
  receivedAt: string; dueAt: string; estimate: number; notes: string;
  actualCharge: number; isPaid: boolean; serialNumber: string;
};

export type Part = {
  id: number; repairId: number | null; name: string; supplier: string; orderNo: string;
  cost: number; status: PartStatus; expectedAt: string;
};

export type WorkshopPayload = { repairs: Repair[]; parts: Part[]; error?: string };
export type ErrorPayload = { error?: string };

export const statusMeta: Record<Status, { label: string; className: string }> = {
  received: { label: "已接收", className: "slate" },
  diagnosing: { label: "检测中", className: "blue" },
  waiting_parts: { label: "等待零件", className: "amber" },
  repairing: { label: "维修中", className: "violet" },
  testing: { label: "测试中", className: "cyan" },
  ready: { label: "可取件", className: "green" },
  collected: { label: "已取件", className: "ink" },
};

export const partMeta: Record<PartStatus, { label: string; className: string }> = {
  to_order: { label: "待下单", className: "amber" },
  ordered: { label: "已下单", className: "blue" },
  shipped: { label: "运输中", className: "violet" },
  received: { label: "已到货", className: "green" },
};

export const statusOrder: Status[] = ["received", "diagnosing", "waiting_parts", "repairing", "testing", "ready", "collected"];
export const partStatusOrder: PartStatus[] = ["to_order", "ordered", "shipped", "received"];

export const deviceCategories = ["笔记本电脑", "台式电脑", "手机", "平板电脑", "数码相机", "镜头", "电视", "游戏主机", "小家电"];

export function deviceIcon(device: string) {
  const props = { size: 18, strokeWidth: 1.8 };
  if (device.includes("相机") || device.includes("镜头")) return <Camera {...props} />;
  if (device.includes("电脑")) return <Computer {...props} />;
  if (device.includes("手机")) return <Phone {...props} />;
  if (device.includes("电视")) return <Tv {...props} />;
  if (device.includes("家电")) return <PlugZap {...props} />;
  if (device.includes("平板") || device.includes("主机")) return <Smartphone {...props} />;
  return <Wrench {...props} />;
}

// --- dates -------------------------------------------------------------------
// "Today" is the user's local calendar day (not UTC), and is an empty string
// during server rendering so the server and the browser never disagree.

export function localDate(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function subscribeToDayChange(notify: () => void) {
  const timer = setInterval(notify, 60_000);
  return () => clearInterval(timer);
}

export function useToday() {
  return useSyncExternalStore(subscribeToDayChange, () => localDate(), () => "");
}

export function addDays(date: string, days: number) {
  return localDate(new Date(Date.parse(`${date}T12:00:00`) + days * 86_400_000));
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`)) / 86_400_000);
}

export function shortDate(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}

export function longDate(today: string) {
  if (!today) return "";
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date(`${today}T12:00:00`));
}

export function money(value: number) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CAD", maximumFractionDigits: 2 }).format(value || 0);
}

// --- repair rules ------------------------------------------------------------

/** Still being worked on (not yet ready for pickup). */
export const isOpen = (repair: Repair) => repair.status !== "ready" && repair.status !== "collected";

export const isOverdue = (repair: Repair, today: string) => Boolean(today) && isOpen(repair) && repair.dueAt < today;

/** What the customer will pay: the final charge once known, otherwise the quote. */
export const amountFor = (repair: Repair) => (repair.actualCharge > 0 ? repair.actualCharge : repair.estimate);

/** Money is only owed once the work is finished. */
export const isBillable = (repair: Repair) => repair.status === "ready" || repair.status === "collected";

/** Friendly due-date text, e.g. "逾期 2 天", "今天", "明天", "10/5". */
export function dueInfo(repair: Repair, today: string): { text: string; tone: "coral" | "amber" | "" } {
  if (!today || !isOpen(repair)) return { text: shortDate(repair.dueAt), tone: "" };
  const late = daysBetween(repair.dueAt, today);
  if (late > 0) return { text: `逾期 ${late} 天`, tone: "coral" };
  if (late === 0) return { text: "今天", tone: "amber" };
  if (late === -1) return { text: "明天", tone: "" };
  return { text: shortDate(repair.dueAt), tone: "" };
}

/** Most urgent first: overdue, urgent, the rest by due date, ready, then collected. */
export function byUrgency(today: string) {
  const rank = (repair: Repair) => {
    if (repair.status === "collected") return 4;
    if (repair.status === "ready") return 3;
    if (isOverdue(repair, today)) return 0;
    return repair.priority === "urgent" ? 1 : 2;
  };
  return (a: Repair, b: Repair) =>
    rank(a) - rank(b) || (rank(a) === 4 ? b.id - a.id : a.dueAt.localeCompare(b.dueAt) || b.id - a.id);
}

export type RepairFilter = "active" | "overdue" | "ready" | "collected" | "all";

export function matchesFilter(repair: Repair, filter: RepairFilter, today: string) {
  switch (filter) {
    case "active": return isOpen(repair);
    case "overdue": return isOverdue(repair, today);
    case "ready": return repair.status === "ready";
    case "collected": return repair.status === "collected";
    default: return true;
  }
}

export async function errorOf(response: Response, fallback: string) {
  try {
    return ((await response.json()) as ErrorPayload).error ?? fallback;
  } catch {
    return fallback;
  }
}
