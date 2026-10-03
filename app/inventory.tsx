"use client";

import { AlertCircle, Boxes, CircleDollarSign, Cpu, Laptop, Minus, PackageCheck, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Kind = "part" | "device";
type Condition = "good" | "broken";
type Item = {
  id: number; kind: Kind; name: string; category: string; condition: Condition;
  quantity: number; location: string; unitCost: number; notes: string;
};
type Tab = "all" | "part" | "device-good" | "device-broken";

const tabs: { key: Tab; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "part", label: "零配件" },
  { key: "device-good", label: "整机 · 完好" },
  { key: "device-broken", label: "整机 · 损坏" },
];

const partCategories = ["屏幕", "电池", "主板", "充电接口", "芯片", "排线", "按键", "散热", "其他"];
const deviceCategories = ["笔记本电脑", "台式电脑", "手机", "平板电脑", "数码相机", "镜头", "电视", "游戏主机", "小家电"];

function money(value: number) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CAD", maximumFractionDigits: 2 }).format(value || 0);
}

async function errorOf(response: Response, fallback: string) {
  try {
    return ((await response.json()) as { error?: string }).error ?? fallback;
  } catch {
    return fallback;
  }
}

export default function Inventory() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const response = await fetch("/api/inventory", { cache: "no-store" });
      if (!response.ok) throw new Error(await errorOf(response, "无法读取库存"));
      setItems(((await response.json()) as { items: Item[] }).items);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "库存加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void load();
  }, []);

  const stats = useMemo(() => {
    const sum = (list: Item[]) => list.reduce((total, item) => total + item.quantity, 0);
    const parts = items.filter((item) => item.kind === "part");
    const devices = items.filter((item) => item.kind === "device");
    return {
      parts: sum(parts),
      partKinds: parts.length,
      good: sum(devices.filter((item) => item.condition === "good")),
      broken: sum(devices.filter((item) => item.condition === "broken")),
      value: items.reduce((total, item) => total + item.quantity * item.unitCost, 0),
    };
  }, [items]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (tab === "part" && item.kind !== "part") return false;
      if (tab === "device-good" && !(item.kind === "device" && item.condition === "good")) return false;
      if (tab === "device-broken" && !(item.kind === "device" && item.condition === "broken")) return false;
      return !needle || [item.name, item.category, item.location, item.notes].some((field) => field.toLowerCase().includes(needle));
    });
  }, [items, tab, query]);

  const count = (key: Tab) => items.filter((item) => key === "all" || (key === "part" ? item.kind === "part" : item.kind === "device" && item.condition === key.slice(7))).length;

  async function adjust(item: Item, delta: number) {
    if (item.quantity + delta < 0) return;
    setItems((current) => current.map((row) => (row.id === item.id ? { ...row, quantity: row.quantity + delta } : row)));
    const response = await fetch("/api/inventory", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, delta }) });
    if (!response.ok) {
      setError(await errorOf(response, "数量更新失败"));
      await load();
    }
  }

  async function remove(item: Item) {
    const what = item.kind === "part" ? "这条零配件库存" : "这条整机库存";
    if (!window.confirm(`确定删除${what}「${item.name}」吗？此操作不可恢复。`)) return;
    setItems((current) => current.filter((row) => row.id !== item.id));
    const response = await fetch(`/api/inventory?id=${item.id}`, { method: "DELETE" });
    if (!response.ok) {
      setError(await errorOf(response, "删除失败"));
      await load();
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const isNew = editing === "new";
      const response = await fetch("/api/inventory", {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isNew ? payload : { ...payload, id: editing.id }),
      });
      if (!response.ok) throw new Error(await errorOf(response, "保存失败"));
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-content">
      {error && <div className="error-banner inv-error"><AlertCircle size={18} /><span>{error}</span><button onClick={() => { setError(""); void load(); }}>重试</button></div>}

      <section className="metric-grid inv-stats">
        <Stat icon={<Cpu />} tone="ink" label="零配件" value={loading ? "—" : `${stats.parts} 件`} note={`${stats.partKinds} 种`} />
        <Stat icon={<PackageCheck />} tone="green" label="完好整机" value={loading ? "—" : `${stats.good} 台`} note="可出售 / 可用" />
        <Stat icon={<Laptop />} tone="coral" label="损坏整机" value={loading ? "—" : `${stats.broken} 台`} note="待拆件 / 待修" />
        <Stat icon={<CircleDollarSign />} tone="amber" label="库存成本" value={loading ? "—" : money(stats.value)} note="数量 × 单价" />
      </section>

      <div className="filter-row inv-toolbar">
        <div className="status-filters">
          {tabs.map(({ key, label }) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label} {count(key)}</button>)}
        </div>
        <div className="inv-tools">
          <label className="global-search inv-search"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索名称、分类、位置…" aria-label="搜索库存" /></label>
          <button className="primary-button" onClick={() => setEditing("new")}><Plus size={18} /> 入库</button>
        </div>
      </div>

      <section className="panel repair-table-panel">
        <div className="inv-table table-head"><span>名称 / 分类</span><span>类型</span><span>状态</span><span>数量</span><span>位置</span><span>单价</span><span /></div>
        {visible.map((item) => (
          <div key={item.id} className="inv-table inv-row">
            <span className="table-device">
              <span className="device-icon">{item.kind === "part" ? <Cpu size={18} /> : <Laptop size={18} />}</span>
              <span><strong>{item.name}</strong><small>{item.category || "未分类"}{item.notes ? ` · ${item.notes}` : ""}</small></span>
            </span>
            <span>{item.kind === "part" ? "零配件" : "整机"}</span>
            <span>
              {item.quantity === 0 ? <i className="status-badge amber">缺货</i>
                : item.condition === "good" ? <i className="status-badge green">完好</i>
                : <i className="status-badge coral">损坏</i>}
            </span>
            <span className="qty">
              <button onClick={() => adjust(item, -1)} disabled={item.quantity === 0} aria-label={`减少 ${item.name}`}><Minus size={14} /></button>
              <strong>{item.quantity}</strong>
              <button onClick={() => adjust(item, 1)} aria-label={`增加 ${item.name}`}><Plus size={14} /></button>
            </span>
            <span className="ellipsis inv-location">{item.location || "—"}</span>
            <span className="inv-cost">{item.unitCost ? money(item.unitCost) : "—"}</span>
            <span className="inv-actions">
              <button className="icon-button" onClick={() => setEditing(item)} aria-label={`编辑 ${item.name}`}><Pencil size={15} /></button>
              <button className="icon-button" onClick={() => remove(item)} aria-label={`删除 ${item.name}`}><Trash2 size={15} /></button>
            </span>
          </div>
        ))}
        {!loading && visible.length === 0 && <div className="empty-state"><Boxes /><p>{items.length === 0 ? "库存是空的，点右上角「入库」开始记录" : "没有符合条件的库存"}</p></div>}
      </section>

      {editing && (
        <div className="overlay modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setEditing(null)}>
          <div className="modal-card">
            <button className="icon-button modal-close" onClick={() => setEditing(null)} aria-label="关闭"><X /></button>
            <span className="eyebrow">库存</span>
            <h2>{editing === "new" ? "入库" : "编辑库存"}</h2>
            <ItemForm key={editing === "new" ? "new" : editing.id} item={editing === "new" ? undefined : editing} saving={saving} onSubmit={save} onCancel={() => setEditing(null)} />
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, value, note, tone }: { icon: React.ReactNode; label: string; value: string; note: string; tone: string }) {
  return <article className="metric-card"><span className={`metric-icon ${tone}`}>{icon}</span><div><p>{label}</p><strong>{value}</strong><small>{note}</small></div></article>;
}

function ItemForm({ item, saving, onSubmit, onCancel }: { item?: Item; saving: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  const [kind, setKind] = useState<Kind>(item?.kind ?? "part");
  const categories = kind === "part" ? partCategories : deviceCategories;
  return (
    <form onSubmit={onSubmit} className="entry-form">
      <div className="form-grid">
        <label>类型*
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as Kind)} disabled={Boolean(item)}>
            <option value="part">零配件（只记录完好的）</option>
            <option value="device">整机</option>
          </select>
          {item && <input type="hidden" name="kind" value={item.kind} />}
        </label>
        {kind === "device"
          ? <label>状态*<select name="condition" defaultValue={item?.condition ?? "good"}><option value="good">完好</option><option value="broken">损坏</option></select></label>
          : <label>状态<input value="完好（损坏的直接丢弃，不入库）" disabled readOnly /></label>}
        <label className="wide">名称 / 型号*<input name="name" required maxLength={100} defaultValue={item?.name} placeholder={kind === "part" ? "例如 iPhone 13 原装电池" : "例如 MacBook Air M1 13 寸"} /></label>
        <label>分类<input name="category" list="inv-categories" maxLength={50} defaultValue={item?.category} placeholder="选择或输入" /></label>
        <datalist id="inv-categories">{categories.map((name) => <option key={name} value={name} />)}</datalist>
        <label>数量*<input name="quantity" type="number" min={0} max={100000} step={1} required defaultValue={item?.quantity ?? 1} /></label>
        <label>存放位置<input name="location" maxLength={100} defaultValue={item?.location} placeholder="例如 A 架 2 层" /></label>
        <label>单价 (CAD)<input name="unitCost" type="number" min={0} step="0.01" defaultValue={item?.unitCost || ""} placeholder="0.00" /></label>
        <label className="wide">备注<textarea name="notes" maxLength={1000} defaultValue={item?.notes} placeholder={kind === "device" ? "例如 屏幕碎裂，主板正常" : "例如 兼容型号、来源"} /></label>
      </div>
      <div className="form-actions"><button type="button" className="ghost-button" onClick={onCancel}>取消</button><button className="primary-button" disabled={saving}>{saving ? "保存中…" : item ? "保存修改" : "入库"}</button></div>
    </form>
  );
}
