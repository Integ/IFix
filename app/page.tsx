"use client";

import { AlertCircle, Boxes, CircleDollarSign, ClipboardList, LayoutDashboard, PackageOpen, Plus, Wrench } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import FinanceView from "./finance-view";
import { PartForm, RepairForm } from "./forms";
import Inventory from "./inventory";
import PartsView from "./parts-view";
import RepairDrawer from "./repair-drawer";
import RepairsView from "./repairs-view";
import TodayView from "./today-view";
import { Modal } from "./ui";
import { errorOf, isOverdue, Part, partStatusOrder, Repair, RepairFilter, Status, statusOrder, useToday, WorkshopPayload } from "./workshop";

type View = "today" | "repairs" | "parts" | "inventory" | "finance";

const titles: Record<View, string> = { today: "今日", repairs: "工单", parts: "采购", inventory: "库存", finance: "账目" };

const JSON_HEADERS = { "Content-Type": "application/json" };

export default function Home() {
  const today = useToday();
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("today");
  const [repairFilter, setRepairFilter] = useState<RepairFilter>("active");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [modal, setModal] = useState<"repair" | "edit" | "part" | null>(null);
  const [saving, setSaving] = useState(false);

  const selected = repairs.find((repair) => repair.id === selectedId) ?? null;

  async function loadData() {
    try {
      const response = await fetch("/api/workshop", { cache: "no-store" });
      const data = await response.json() as WorkshopPayload;
      if (!response.ok) throw new Error(data.error ?? "无法读取数据");
      setRepairs(data.repairs);
      setParts(data.parts);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void loadData();
  }, []);

  function go(next: View) {
    setView(next);
    setSearch("");
  }

  function goRepairs(filter: RepairFilter) {
    setRepairFilter(filter);
    go("repairs");
  }

  async function saveRepair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const fields: Record<string, unknown> = Object.fromEntries(form.entries());
    delete fields.urgent;
    delete fields.isPaid;
    const payload = { ...fields, priority: form.get("urgent") ? "urgent" : "normal" };
    try {
      const editing = modal === "edit" && selected;
      const response = await fetch("/api/workshop", {
        method: editing ? "PATCH" : "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(editing ? { ...payload, id: selected.id, isPaid: form.get("isPaid") === "on" } : payload),
      });
      if (!response.ok) throw new Error(await errorOf(response, "保存失败"));
      const created = editing ? null : await response.json() as { id: number };
      setModal(null);
      await loadData();
      // Show the ticket that was just created, so it is obvious it worked.
      if (created) setSelectedId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function addPart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const payload = { ...Object.fromEntries(new FormData(event.currentTarget).entries()), kind: "part" };
    try {
      const response = await fetch("/api/workshop", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error(await errorOf(response, "保存失败"));
      setModal(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function advanceRepair(repair: Repair) {
    const next: Status | undefined = statusOrder[statusOrder.indexOf(repair.status) + 1];
    if (!next) return;
    setRepairs((current) => current.map((item) => (item.id === repair.id ? { ...item, status: next } : item)));
    const response = await fetch("/api/workshop", { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ id: repair.id, status: next }) });
    if (!response.ok) { setError("状态更新失败，请重试"); await loadData(); }
  }

  async function togglePaid(repair: Repair) {
    const isPaid = !repair.isPaid;
    setRepairs((current) => current.map((item) => (item.id === repair.id ? { ...item, isPaid } : item)));
    const response = await fetch("/api/workshop", { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ id: repair.id, isPaid }) });
    if (!response.ok) { setError("收款状态更新失败"); await loadData(); }
  }

  async function advancePart(part: Part) {
    const next = partStatusOrder[partStatusOrder.indexOf(part.status) + 1];
    if (!next) return;
    setParts((current) => current.map((item) => (item.id === part.id ? { ...item, status: next } : item)));
    const response = await fetch("/api/workshop", { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ target: "part", id: part.id, status: next }) });
    if (!response.ok) { setError("采购状态更新失败"); await loadData(); }
  }

  const overdue = repairs.filter((repair) => isOverdue(repair, today)).length;
  const pendingParts = parts.filter((part) => part.status !== "received").length;

  const nav: { key: View; icon: ReactNode; badge?: number; alert?: boolean }[] = [
    { key: "today", icon: <LayoutDashboard /> },
    { key: "repairs", icon: <ClipboardList />, badge: overdue, alert: true },
    { key: "parts", icon: <PackageOpen />, badge: pendingParts },
    { key: "inventory", icon: <Boxes /> },
    { key: "finance", icon: <CircleDollarSign /> },
  ];

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Wrench size={20} /></span><span>Integ<small>WORKSHOP</small></span></div>
        <nav aria-label="主导航">
          {nav.map(({ key, icon, badge, alert }) => (
            <button key={key} className={view === key ? "active" : ""} aria-current={view === key ? "page" : undefined} onClick={() => go(key)}>
              {icon}<em>{titles[key]}</em>
              {badge ? <span className={alert ? "alert" : ""}>{badge}</span> : null}
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <h1>{titles[view]}</h1>
          {(view === "today" || view === "repairs") && (
            <button className="primary-button" onClick={() => setModal("repair")}><Plus size={18} /> <span>新建工单</span></button>
          )}
        </header>

        {error && <div className="error-banner"><AlertCircle size={18} /><span>{error}</span><button onClick={() => { setError(""); void loadData(); }}>重试</button></div>}

        {view === "today" && (
          <TodayView repairs={repairs} parts={parts} today={today} loading={loading} onOpen={setSelectedId} onNew={() => setModal("repair")}
            goRepairs={goRepairs} goParts={() => go("parts")} goFinance={() => go("finance")} />
        )}
        {view === "repairs" && (
          <RepairsView repairs={repairs} today={today} loading={loading} filter={repairFilter} setFilter={setRepairFilter}
            search={search} setSearch={setSearch} onOpen={setSelectedId} onNew={() => setModal("repair")} />
        )}
        {view === "parts" && <PartsView parts={parts} repairs={repairs} loading={loading} onAdd={() => setModal("part")} onAdvance={advancePart} />}
        {view === "inventory" && <Inventory />}
        {view === "finance" && <FinanceView repairs={repairs} parts={parts} loading={loading} onOpen={setSelectedId} />}
      </section>

      {selected && (
        <RepairDrawer repair={selected} parts={parts} today={today} onClose={() => setSelectedId(null)}
          onEdit={() => setModal("edit")} onAdvance={advanceRepair} onTogglePaid={togglePaid} />
      )}

      {modal === "part" && (
        <Modal eyebrow="采购" title="添加采购" onClose={() => setModal(null)}>
          <PartForm repairs={repairs} saving={saving} onSubmit={addPart} onCancel={() => setModal(null)} />
        </Modal>
      )}
      {(modal === "repair" || (modal === "edit" && selected)) && (
        <Modal eyebrow={modal === "edit" ? selected?.ticketNo : "新工单"} title={modal === "edit" ? "编辑工单" : "登记维修设备"} onClose={() => setModal(null)}>
          <RepairForm key={modal === "edit" ? selected?.id : "new"} repair={modal === "edit" ? selected ?? undefined : undefined} saving={saving} onSubmit={saveRepair} onCancel={() => setModal(null)} />
        </Modal>
      )}
    </main>
  );
}
