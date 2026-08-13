"use client";

import {
  AlertCircle,
  ArrowRight,
  Banknote,
  Box,
  CalendarDays,
  Camera,
  Check,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Computer,
  LayoutDashboard,
  Menu,
  PackageCheck,
  PackageOpen,
  Phone,
  PlugZap,
  Plus,
  Search,
  Smartphone,
  Sparkles,
  Tv,
  Wrench,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Status = "received" | "diagnosing" | "waiting_parts" | "repairing" | "testing" | "ready" | "collected";
type PartStatus = "to_order" | "ordered" | "shipped" | "received";
type View = "dashboard" | "repairs" | "parts" | "schedule" | "finance";

type Repair = {
  id: number; ticketNo: string; device: string; brandModel: string; customer: string;
  phone: string; issue: string; status: Status; priority: "normal" | "urgent";
  receivedAt: string; dueAt: string; estimate: number; notes: string;
  actualCharge: number; isPaid: boolean; serialNumber: string;
};

type Part = {
  id: number; repairId: number | null; name: string; supplier: string; orderNo: string;
  cost: number; status: PartStatus; expectedAt: string;
};

type WorkshopPayload = { repairs: Repair[]; parts: Part[]; error?: string };
type ErrorPayload = { error?: string };

const statusMeta: Record<Status, { label: string; short: string; className: string }> = {
  received: { label: "已接收", short: "接收", className: "slate" },
  diagnosing: { label: "检测中", short: "检测", className: "blue" },
  waiting_parts: { label: "等待零件", short: "待件", className: "amber" },
  repairing: { label: "维修中", short: "维修", className: "violet" },
  testing: { label: "测试中", short: "测试", className: "cyan" },
  ready: { label: "可取件", short: "完成", className: "green" },
  collected: { label: "已取件", short: "归档", className: "ink" },
};

const partMeta: Record<PartStatus, { label: string; className: string }> = {
  to_order: { label: "待下单", className: "amber" },
  ordered: { label: "已下单", className: "blue" },
  shipped: { label: "运输中", className: "violet" },
  received: { label: "已到货", className: "green" },
};

const statusOrder: Status[] = ["received", "diagnosing", "waiting_parts", "repairing", "testing", "ready", "collected"];
const partStatusOrder: PartStatus[] = ["to_order", "ordered", "shipped", "received"];
const DEFAULT_DUE_DATE = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
const TODAY = new Date().toISOString().slice(0, 10);

function deviceIcon(device: string) {
  const props = { size: 18, strokeWidth: 1.8 };
  if (device.includes("相机") || device.includes("镜头")) return <Camera {...props} />;
  if (device.includes("电脑")) return <Computer {...props} />;
  if (device.includes("手机")) return <Phone {...props} />;
  if (device.includes("电视")) return <Tv {...props} />;
  if (device.includes("家电")) return <PlugZap {...props} />;
  if (device.includes("平板") || device.includes("主机")) return <Smartphone {...props} />;
  return <Wrench {...props} />;
}

function money(value: number) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CAD", maximumFractionDigits: 2 }).format(value || 0);
}

function shortDate(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function fullDate() {
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date());
}

export default function Home() {
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Status | "all">("all");
  const [selected, setSelected] = useState<Repair | null>(null);
  const [modal, setModal] = useState<"repair" | "edit" | "part" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);

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
    let active = true;
    fetch("/api/workshop", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as WorkshopPayload;
        if (!response.ok) throw new Error(data.error ?? "无法读取数据");
        if (active) { setRepairs(data.repairs); setParts(data.parts); setError(""); }
      })
      .catch((err) => active && setError(err instanceof Error ? err.message : "数据加载失败"))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const filteredRepairs = useMemo(() => repairs.filter((repair) => {
    const query = search.trim().toLocaleLowerCase("zh-CN");
    const text = `${repair.ticketNo} ${repair.device} ${repair.brandModel} ${repair.customer} ${repair.phone} ${repair.issue} ${repair.serialNumber} ${repair.notes}`.toLocaleLowerCase("zh-CN");
    return (filter === "all" || repair.status === filter) && text.includes(query);
  }), [repairs, search, filter]);

  function handleSearch(value: string) {
    setSearch(value);
    if (value.trim()) {
      setFilter("all");
      setActiveView("repairs");
    }
  }

  const inShopCount = repairs.filter((item) => item.status !== "collected").length;
  const activeCount = repairs.filter((item) => !["ready", "collected"].includes(item.status)).length;
  const urgentCount = repairs.filter((item) => item.priority === "urgent" && !["ready", "collected"].includes(item.status)).length;
  const waitingCount = repairs.filter((item) => item.status === "waiting_parts").length;
  const overdueCount = repairs.filter((item) => item.dueAt < TODAY && !["ready", "collected"].includes(item.status)).length;
  const readyCount = repairs.filter((item) => item.status === "ready").length;
  const amountFor = (repair: Repair) => repair.actualCharge > 0 ? repair.actualCharge : repair.estimate;
  const receivables = repairs.filter((item) => ["ready", "collected"].includes(item.status) && !item.isPaid).reduce((sum, item) => sum + amountFor(item), 0);
  const collectedRevenue = repairs.filter((item) => item.isPaid).reduce((sum, item) => sum + amountFor(item), 0);
  const partsSpend = parts.reduce((sum, item) => sum + item.cost, 0);
  const grossProfit = collectedRevenue - partsSpend;

  async function saveRepair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const editing = modal === "edit" && selected;
      const response = await fetch("/api/workshop", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing ? { ...payload, id: selected.id, isPaid: form.get("isPaid") === "on" } : payload) });
      if (!response.ok) throw new Error(((await response.json()) as ErrorPayload).error ?? "保存失败");
      setModal(null);
      await loadData();
      if (editing) setSelected(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally { setSaving(false); }
  }

  async function addPart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const payload = { ...Object.fromEntries(form.entries()), kind: "part" };
    const response = await fetch("/api/workshop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setSaving(false);
    if (response.ok) { setModal(null); await loadData(); }
    else setError(((await response.json()) as ErrorPayload).error ?? "保存失败");
  }

  async function updateStatus(repair: Repair, status: Status) {
    setRepairs((current) => current.map((item) => item.id === repair.id ? { ...item, status } : item));
    setSelected((current) => current?.id === repair.id ? { ...current, status } : current);
    const response = await fetch("/api/workshop", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: repair.id, status }) });
    if (!response.ok) { setError("状态更新失败，请重试"); await loadData(); }
  }

  async function togglePaid(repair: Repair) {
    const isPaid = !repair.isPaid;
    setRepairs((current) => current.map((item) => item.id === repair.id ? { ...item, isPaid } : item));
    setSelected({ ...repair, isPaid });
    const response = await fetch("/api/workshop", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: repair.id, isPaid }) });
    if (!response.ok) { setError("收款状态更新失败"); await loadData(); }
  }

  async function advancePart(part: Part) {
    const next = partStatusOrder[partStatusOrder.indexOf(part.status) + 1];
    if (!next) return;
    setParts((current) => current.map((item) => item.id === part.id ? { ...item, status: next } : item));
    const response = await fetch("/api/workshop", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target: "part", id: part.id, status: next }) });
    if (!response.ok) { setError("零件状态更新失败"); await loadData(); }
  }

  const nextStatus = selected ? statusOrder[statusOrder.indexOf(selected.status) + 1] : undefined;

  return (
    <main className="app-shell">
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="brand"><span className="brand-mark"><Wrench size={20} /></span><span>iFix<small>WORKSHOP</small></span></div>
        <button className="close-menu" onClick={() => setMenuOpen(false)} aria-label="关闭菜单"><X /></button>
        <nav>
          <p className="nav-label">工作空间</p>
          <button className={activeView === "dashboard" ? "active" : ""} onClick={() => { setActiveView("dashboard"); setMenuOpen(false); }}><LayoutDashboard /> 总览</button>
          <button className={activeView === "repairs" ? "active" : ""} onClick={() => { setActiveView("repairs"); setMenuOpen(false); }}><ClipboardList /> 维修工单 <span>{inShopCount}</span></button>
          <button className={activeView === "parts" ? "active" : ""} onClick={() => { setActiveView("parts"); setMenuOpen(false); }}><PackageOpen /> 零件采购 <span>{parts.filter((p) => p.status !== "received").length}</span></button>
          <p className="nav-label second">管理</p>
          <button className={activeView === "schedule" ? "active" : ""} onClick={() => { setActiveView("schedule"); setMenuOpen(false); }}><CalendarDays /> 交付排期 <span>{overdueCount || ""}</span></button>
          <button className={activeView === "finance" ? "active" : ""} onClick={() => { setActiveView("finance"); setMenuOpen(false); }}><CircleDollarSign /> 费用与收款</button>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="header-title">
            <button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="打开菜单"><Menu /></button>
            <div><p>{fullDate()}</p><h1>{{ dashboard: "工作台总览", repairs: "维修工单", parts: "零件采购", schedule: "交付排期", finance: "费用与收款" }[activeView]}</h1></div>
          </div>
          <div className="header-actions">
            <label className="global-search"><Search size={17} /><input value={search} onChange={(e) => handleSearch(e.target.value)} placeholder="搜索工单、设备或客户…" aria-label="搜索维修工单" /></label>
            <button className="primary-button" onClick={() => setModal("repair")}><Plus size={18} /> 新建维修</button>
          </div>
        </header>

        {error && <div className="error-banner"><AlertCircle size={18} /><span>{error}</span><button onClick={loadData}>重试</button></div>}

        {activeView === "dashboard" && (
          <div className="dashboard-content">
            <section className="metric-grid">
              <Metric icon={<Wrench />} label="正在维修" value={loading ? "—" : activeCount} note={`${inShopCount} 台在店`} tone="ink" />
              <Metric icon={<AlertCircle />} label="已逾期" value={loading ? "—" : overdueCount} note={`${urgentCount} 台紧急`} tone="coral" />
              <Metric icon={<PackageOpen />} label="等待零件" value={loading ? "—" : waitingCount} note="采购进度" tone="amber" />
              <Metric icon={<CircleDollarSign />} label="待收款" value={loading ? "—" : money(receivables)} note={`${readyCount} 台可取`} tone="green" />
            </section>

            <div className="dashboard-grid">
              <section className="panel pipeline-panel">
                <div className="panel-heading"><div><span className="eyebrow">维修流程</span><h2>当前进度</h2></div><button className="text-button" onClick={() => setActiveView("repairs")}>查看全部 <ArrowRight size={15} /></button></div>
                <div className="pipeline-tabs">
                  {statusOrder.map((status) => <button key={status} className={filter === status ? "active" : ""} onClick={() => setFilter(filter === status ? "all" : status)}><span className={`status-dot ${statusMeta[status].className}`} />{statusMeta[status].label}<b>{repairs.filter((r) => r.status === status).length}</b></button>)}
                </div>
                <div className="repair-list">
                  {(filter === "all" ? filteredRepairs.filter((r) => !["ready", "collected"].includes(r.status)) : filteredRepairs).slice(0, 5).map((repair) => <RepairRow key={repair.id} repair={repair} onOpen={() => setSelected(repair)} />)}
                  {!loading && repairs.length === 0 && <EmptyState label="还没有维修工单" />}
                </div>
              </section>

              <aside className="today-panel panel">
                <div className="panel-heading"><div><span className="eyebrow">今日计划</span><h2>优先处理</h2></div><span className="date-pill">{new Date().getDate()}</span></div>
                <div className="timeline">
                  {repairs.filter((r) => !["ready", "collected"].includes(r.status)).sort((a, b) => Number(b.priority === "urgent") - Number(a.priority === "urgent") || a.dueAt.localeCompare(b.dueAt)).slice(0, 3).map((repair) => (
                    <button key={repair.id} className="timeline-item" onClick={() => setSelected(repair)}>
                      <span className="time">{shortDate(repair.dueAt)}</span>
                      <span className={`timeline-line ${statusMeta[repair.status].className}`}><i /></span>
                      <span className="timeline-copy"><strong>{repair.brandModel}</strong><small>{repair.priority === "urgent" ? "紧急 · 优先处理" : `${repair.customer} · ${statusMeta[repair.status].label}`}</small></span>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </div>
                <div className="capacity"><div><span>当前队列</span><strong>{activeCount} / 6 台</strong></div><div className="capacity-track"><i style={{ width: `${Math.min(100, activeCount / 6 * 100)}%` }} /></div><small>{activeCount > 6 ? "工作量偏高，建议顺延非紧急工单" : `还可安排 ${Math.max(0, 6 - activeCount)} 台设备`}</small></div>
              </aside>
            </div>

            <section className="panel parts-preview">
              <div className="panel-heading"><div><span className="eyebrow">供应链</span><h2>零件动态</h2></div><button className="text-button" onClick={() => setActiveView("parts")}>管理采购 <ArrowRight size={15} /></button></div>
              <div className="parts-strip">
                {parts.slice(0, 3).map((part) => <PartCard key={part.id} part={part} repair={repairs.find((r) => r.id === part.repairId)} />)}
                <button className="add-part-card" onClick={() => setModal("part")}><Plus /><span>添加采购项</span></button>
              </div>
            </section>
          </div>
        )}

        {activeView === "repairs" && (
          <div className="page-content">
            <div className="filter-row">
              <div className="status-filters"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>全部 {repairs.length}</button>{statusOrder.map((status) => <button key={status} className={filter === status ? "active" : ""} onClick={() => setFilter(status)}>{statusMeta[status].label} {repairs.filter((r) => r.status === status).length}</button>)}</div>
            </div>
            <section className="panel repair-table-panel">
              <div className="repair-table table-head"><span>工单 / 设备</span><span>客户</span><span>问题</span><span>交付</span><span>状态</span><span /></div>
              {filteredRepairs.map((repair) => <RepairTableRow key={repair.id} repair={repair} onOpen={() => setSelected(repair)} />)}
              {!loading && filteredRepairs.length === 0 && <EmptyState label="没有符合条件的工单" />}
            </section>
          </div>
        )}

        {activeView === "parts" && (
          <div className="page-content">
            <div className="section-intro"><div><p>跟踪采购、物流与成本，减少等待时间。</p></div><button className="secondary-button" onClick={() => setModal("part")}><Plus size={17} /> 添加零件</button></div>
            <section className="parts-board">
              {(["to_order", "ordered", "shipped", "received"] as PartStatus[]).map((status) => (
                <div className="parts-column" key={status}>
                  <div className="column-title"><span className={`status-dot ${partMeta[status].className}`} /><strong>{partMeta[status].label}</strong><b>{parts.filter((p) => p.status === status).length}</b></div>
                  {parts.filter((p) => p.status === status).map((part) => <PartCard key={part.id} part={part} repair={repairs.find((r) => r.id === part.repairId)} vertical onAdvance={() => advancePart(part)} />)}
                  <button className="column-add" onClick={() => setModal("part")}><Plus size={16} /> 添加</button>
                </div>
              ))}
            </section>
          </div>
        )}

        {activeView === "schedule" && (
          <div className="page-content">
            <div className="section-intro"><div><p>按承诺交付日期排序，先处理逾期与紧急设备。</p></div><span className={`attention-pill ${overdueCount ? "danger" : ""}`}>{overdueCount ? `${overdueCount} 台已逾期` : "当前没有逾期"}</span></div>
            <section className="schedule-list panel">
              {repairs.filter((repair) => repair.status !== "collected").sort((a, b) => a.dueAt.localeCompare(b.dueAt)).map((repair) => {
                const overdue = repair.dueAt < TODAY && repair.status !== "ready";
                return <button key={repair.id} className={`schedule-row ${overdue ? "overdue" : ""}`} onClick={() => setSelected(repair)}>
                  <span className="schedule-date"><strong>{shortDate(repair.dueAt)}</strong><small>{overdue ? "已逾期" : repair.dueAt === TODAY ? "今天" : "交付日"}</small></span>
                  <span className="device-icon">{deviceIcon(repair.device)}</span>
                  <span className="schedule-copy"><strong>{repair.brandModel}</strong><small>{repair.ticketNo} · {repair.customer} · {repair.issue}</small></span>
                  {repair.priority === "urgent" && <em>紧急</em>}
                  <span className={`status-badge ${statusMeta[repair.status].className}`}>{statusMeta[repair.status].label}</span><ChevronRight size={17} />
                </button>;
              })}
              {!loading && repairs.filter((repair) => repair.status !== "collected").length === 0 && <EmptyState label="暂时没有待交付工单" />}
            </section>
          </div>
        )}

        {activeView === "finance" && (
          <div className="page-content">
            <section className="metric-grid finance-metrics">
              <Metric icon={<Banknote />} label="已收维修费" value={money(collectedRevenue)} note="已标记收款" tone="green" />
              <Metric icon={<CircleDollarSign />} label="待收维修费" value={money(receivables)} note={`${readyCount} 台可取件`} tone="amber" />
              <Metric icon={<PackageOpen />} label="零件总成本" value={money(partsSpend)} note={`${parts.length} 笔采购`} tone="coral" />
              <Metric icon={<Sparkles />} label="当前毛利" value={money(grossProfit)} note="已收款减全部零件" tone="ink" />
            </section>
            <section className="panel finance-panel">
              <div className="panel-heading"><div><span className="eyebrow">工单账目</span><h2>收入与成本</h2></div><small className="finance-hint">金额均为 CAD</small></div>
              <div className="finance-table finance-head"><span>工单 / 客户</span><span>报价</span><span>实收</span><span>零件</span><span>毛利</span><span>收款</span></div>
              {repairs.map((repair) => {
                const partCost = parts.filter((part) => part.repairId === repair.id).reduce((sum, part) => sum + part.cost, 0);
                const revenue = amountFor(repair);
                return <button key={repair.id} className="finance-table finance-row" onClick={() => setSelected(repair)}><span><strong>{repair.ticketNo}</strong><small>{repair.customer} · {repair.brandModel}</small></span><span>{money(repair.estimate)}</span><span>{repair.actualCharge ? money(repair.actualCharge) : "—"}</span><span>{money(partCost)}</span><span className={revenue - partCost < 0 ? "negative" : "positive"}>{money(revenue - partCost)}</span><span className={`payment-badge ${repair.isPaid ? "paid" : "unpaid"}`}>{repair.isPaid ? "已收" : "待收"}</span></button>;
              })}
            </section>
          </div>
        )}
      </section>

      {selected && <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setSelected(null)}><aside className="drawer">
        <button className="icon-button drawer-close" onClick={() => setSelected(null)}><X /></button>
        <div className="drawer-kicker"><span className={`status-badge ${statusMeta[selected.status].className}`}>{statusMeta[selected.status].label}</span>{selected.priority === "urgent" && <span className="priority-badge">紧急</span>}</div>
        <p className="ticket">{selected.ticketNo}</p><h2>{selected.brandModel}</h2><p className="issue-copy">{selected.issue}</p>
        <div className="progress-rail">{statusOrder.map((status, index) => <i key={status} className={index <= statusOrder.indexOf(selected.status) ? "done" : ""} />)}</div>
        <div className="detail-grid"><Detail label="客户" value={selected.customer} /><Detail label="联系电话" value={selected.phone || "未填写"} /><Detail label="接收日期" value={selected.receivedAt} /><Detail label="承诺交付" value={selected.dueAt} /><Detail label="预估费用" value={money(selected.estimate)} /><Detail label="实际收费" value={selected.actualCharge ? money(selected.actualCharge) : "尚未结算"} /><Detail label="设备类别" value={selected.device} /><Detail label="序列号 / IMEI" value={selected.serialNumber || "未填写"} /></div>
        <div className="payment-panel"><span><small>收款状态</small><strong>{selected.isPaid ? `已收 ${money(amountFor(selected))}` : `待收 ${money(amountFor(selected))}`}</strong></span><button className={selected.isPaid ? "ghost-button" : "secondary-button"} onClick={() => togglePaid(selected)}>{selected.isPaid ? "标记未收" : "标记已收款"}</button></div>
        <div className="notes-box"><span>维修备注</span><p>{selected.notes || "暂无备注"}</p></div>
        <div className="linked-parts"><span>关联零件</span>{parts.filter((p) => p.repairId === selected.id).map((part) => <div key={part.id}><Box size={17} /><span><strong>{part.name}</strong><small>{part.supplier}</small></span><span className={`status-badge ${partMeta[part.status].className}`}>{partMeta[part.status].label}</span></div>)}{!parts.some((p) => p.repairId === selected.id) && <p className="muted">暂无关联采购</p>}</div>
        <div className="drawer-actions"><button className="ghost-button" onClick={() => setModal("edit")}>编辑工单</button>{nextStatus && <button className="primary-button" onClick={() => updateStatus(selected, nextStatus)}>推进至「{statusMeta[nextStatus].label}」<ArrowRight size={17} /></button>}{!nextStatus && <button className="completed-button"><Check size={18} /> 工单已归档</button>}</div>
      </aside></div>}

      {modal && <div className="overlay modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setModal(null)}><div className="modal-card">
        <button className="icon-button modal-close" onClick={() => setModal(null)}><X /></button>
        <span className="eyebrow">{modal === "part" ? "采购记录" : modal === "edit" ? selected?.ticketNo : "新工单"}</span><h2>{modal === "part" ? "添加采购零件" : modal === "edit" ? "编辑维修工单" : "登记维修设备"}</h2>
        {modal === "part" ? <PartForm onSubmit={addPart} saving={saving} repairs={repairs} /> : <RepairForm onSubmit={saveRepair} onCancel={() => setModal(null)} saving={saving} repair={modal === "edit" ? selected ?? undefined : undefined} />}
      </div></div>}
    </main>
  );
}

function Metric({ icon, label, value, note, tone }: { icon: React.ReactNode; label: string; value: string | number; note: string; tone: string }) {
  return <article className="metric-card"><span className={`metric-icon ${tone}`}>{icon}</span><div><p>{label}</p><strong>{value}</strong><small>{note}</small></div><Sparkles className="metric-spark" size={17} /></article>;
}

function RepairRow({ repair, onOpen }: { repair: Repair; onOpen: () => void }) {
  return <button className="repair-row" onClick={onOpen}><span className="device-icon">{deviceIcon(repair.device)}</span><span className="repair-main"><span><strong>{repair.brandModel}</strong>{repair.priority === "urgent" && <em>紧急</em>}</span><small>{repair.ticketNo} · {repair.customer}</small></span><span className="repair-issue">{repair.issue}</span><span className="repair-due"><small>交付</small><strong>{shortDate(repair.dueAt)}</strong></span><span className={`status-badge ${statusMeta[repair.status].className}`}>{statusMeta[repair.status].label}</span><ChevronRight size={17} /></button>;
}

function RepairTableRow({ repair, onOpen }: { repair: Repair; onOpen: () => void }) {
  return <button className="repair-table table-row" onClick={onOpen}><span className="table-device"><span className="device-icon">{deviceIcon(repair.device)}</span><span><strong>{repair.brandModel}</strong><small>{repair.ticketNo}</small></span></span><span>{repair.customer}<small>{repair.phone}</small></span><span className="ellipsis">{repair.issue}</span><span>{shortDate(repair.dueAt)}</span><span><i className={`status-badge ${statusMeta[repair.status].className}`}>{statusMeta[repair.status].label}</i></span><ChevronRight size={17} /></button>;
}

function PartCard({ part, repair, vertical = false, onAdvance }: { part: Part; repair?: Repair; vertical?: boolean; onAdvance?: () => void }) {
  const next = partStatusOrder[partStatusOrder.indexOf(part.status) + 1];
  return <article className={`part-card ${vertical ? "vertical" : ""}`}><span className="part-icon">{part.status === "received" ? <PackageCheck /> : <PackageOpen />}</span><div className="part-copy"><strong>{part.name}</strong><small>{repair?.ticketNo ?? "库存采购"} · {part.supplier}</small></div><div className="part-meta"><span className={`status-badge ${partMeta[part.status].className}`}>{partMeta[part.status].label}</span><small>{part.expectedAt ? `预计 ${shortDate(part.expectedAt)}` : "未定到货日"}</small></div>{vertical && <div className="part-cost"><span>成本 {money(part.cost)}</span>{next ? <button onClick={onAdvance}>推进至{partMeta[next].label}<ArrowRight size={13} /></button> : <span className="received-copy"><Check size={13} /> 已入库</span>}</div>}</article>;
}

function EmptyState({ label }: { label: string }) {
  return <div className="empty-state"><ClipboardList /><p>{label}</p></div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><small>{label}</small><strong>{value}</strong></div>;
}

function RepairForm({ onSubmit, onCancel, saving, repair }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void; saving: boolean; repair?: Repair }) {
  return <form onSubmit={onSubmit} className="entry-form"><div className="form-grid"><label>设备类别*<select name="device" required defaultValue={repair?.device ?? "笔记本电脑"}><option>笔记本电脑</option><option>台式电脑</option><option>手机</option><option>平板电脑</option><option>数码相机</option><option>镜头</option><option>电视</option><option>游戏主机</option><option>小家电</option><option>其他设备</option></select></label><label>品牌 / 型号*<input name="brandModel" required placeholder="例如 Sony α7 IV" defaultValue={repair?.brandModel} /></label><label>客户姓名*<input name="customer" required placeholder="客户姓名" defaultValue={repair?.customer} /></label><label>联系电话<input name="phone" placeholder="电话或手机" defaultValue={repair?.phone} /></label><label>序列号 / IMEI<input name="serialNumber" placeholder="可选，用于设备核对" defaultValue={repair?.serialNumber} /></label>{repair && <label>工单状态<select name="status" defaultValue={repair.status}>{statusOrder.map((status) => <option key={status} value={status}>{statusMeta[status].label}</option>)}</select></label>}<label className="wide">故障描述*<textarea name="issue" required placeholder="记录客户描述的现象…" rows={3} defaultValue={repair?.issue} /></label><label>承诺交付*<input name="dueAt" type="date" required defaultValue={repair?.dueAt ?? DEFAULT_DUE_DATE} /></label><label>预估费用<input name="estimate" type="number" min="0" step="0.01" placeholder="0.00" defaultValue={repair?.estimate || ""} /></label><label>实际收费<input name="actualCharge" type="number" min="0" step="0.01" placeholder="完工后填写" defaultValue={repair?.actualCharge || ""} /></label><label>优先级<select name="priority" defaultValue={repair?.priority ?? "normal"}><option value="normal">普通</option><option value="urgent">紧急</option></select></label><label className="wide">维修备注<textarea name="notes" placeholder="检测结果、维修过程或取件说明" rows={3} defaultValue={repair?.notes} /></label>{repair && <label className="check-label wide"><input name="isPaid" type="checkbox" defaultChecked={Boolean(repair.isPaid)} /><span>维修费已收款</span></label>}</div><div className="form-actions"><button type="button" className="ghost-button" onClick={onCancel}>取消</button><button className="primary-button" disabled={saving}>{saving ? "正在保存…" : repair ? "保存更改" : "创建工单"}</button></div></form>;
}

function PartForm({ onSubmit, saving, repairs }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void; saving: boolean; repairs: Repair[] }) {
  return <form onSubmit={onSubmit} className="entry-form"><div className="form-grid"><label>零件名称*<input name="name" required placeholder="例如 USB-C 充电接口" /></label><label>供应商*<input name="supplier" required placeholder="供应商名称" /></label><label>关联工单<select name="repairId" defaultValue=""><option value="">库存采购</option>{repairs.map((r) => <option key={r.id} value={r.id}>{r.ticketNo} · {r.brandModel}</option>)}</select></label><label>订单编号<input name="orderNo" placeholder="可稍后补充" /></label><label>成本<input name="cost" type="number" min="0" step="0.01" placeholder="0.00" /></label><label>预计到货<input name="expectedAt" type="date" /></label><label className="wide">当前状态<select name="status"><option value="to_order">待下单</option><option value="ordered">已下单</option><option value="shipped">运输中</option><option value="received">已到货</option></select></label></div><div className="form-actions"><span /><button className="primary-button" disabled={saving}>{saving ? "正在保存…" : "添加零件"}</button></div></form>;
}
