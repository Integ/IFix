"use client";

import {
  AlertCircle,
  ArrowRight,
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
  MoreHorizontal,
  PackageCheck,
  PackageOpen,
  Plus,
  Search,
  Settings,
  Smartphone,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Status = "received" | "diagnosing" | "waiting_parts" | "repairing" | "testing" | "ready";
type PartStatus = "to_order" | "ordered" | "shipped" | "received";

type Repair = {
  id: number; ticketNo: string; device: string; brandModel: string; customer: string;
  phone: string; issue: string; status: Status; priority: "normal" | "urgent";
  receivedAt: string; dueAt: string; estimate: number; notes: string;
};

type Part = {
  id: number; repairId: number | null; name: string; supplier: string; orderNo: string;
  cost: number; status: PartStatus; expectedAt: string;
};

const statusMeta: Record<Status, { label: string; short: string; className: string }> = {
  received: { label: "已接收", short: "接收", className: "slate" },
  diagnosing: { label: "检测中", short: "检测", className: "blue" },
  waiting_parts: { label: "等待零件", short: "待件", className: "amber" },
  repairing: { label: "维修中", short: "维修", className: "violet" },
  testing: { label: "测试中", short: "测试", className: "cyan" },
  ready: { label: "可取件", short: "完成", className: "green" },
};

const partMeta: Record<PartStatus, { label: string; className: string }> = {
  to_order: { label: "待下单", className: "amber" },
  ordered: { label: "已下单", className: "blue" },
  shipped: { label: "运输中", className: "violet" },
  received: { label: "已到货", className: "green" },
};

const statusOrder: Status[] = ["received", "diagnosing", "waiting_parts", "repairing", "testing", "ready"];
const DEFAULT_DUE_DATE = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);

function deviceIcon(device: string) {
  const props = { size: 18, strokeWidth: 1.8 };
  if (device.includes("相机") || device.includes("镜头")) return <Camera {...props} />;
  if (device.includes("电脑")) return <Computer {...props} />;
  if (device.includes("平板") || device.includes("主机")) return <Smartphone {...props} />;
  return <Wrench {...props} />;
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
  const [activeView, setActiveView] = useState<"dashboard" | "repairs" | "parts">("dashboard");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Status | "all">("all");
  const [selected, setSelected] = useState<Repair | null>(null);
  const [modal, setModal] = useState<"repair" | "part" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function loadData() {
    try {
      const response = await fetch("/api/workshop", { cache: "no-store" });
      const data = await response.json();
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
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "无法读取数据");
        if (active) { setRepairs(data.repairs); setParts(data.parts); setError(""); }
      })
      .catch((err) => active && setError(err instanceof Error ? err.message : "数据加载失败"))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const filteredRepairs = useMemo(() => repairs.filter((repair) => {
    const text = `${repair.ticketNo} ${repair.device} ${repair.brandModel} ${repair.customer} ${repair.issue}`.toLowerCase();
    return (filter === "all" || repair.status === filter) && text.includes(search.toLowerCase());
  }), [repairs, search, filter]);

  const activeCount = repairs.filter((item) => item.status !== "ready").length;
  const urgentCount = repairs.filter((item) => item.priority === "urgent" && item.status !== "ready").length;
  const waitingCount = repairs.filter((item) => item.status === "waiting_parts").length;
  const completedValue = repairs.filter((item) => item.status === "ready").reduce((sum, item) => sum + item.estimate, 0);

  async function addRepair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const response = await fetch("/api/workshop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setSaving(false);
    if (response.ok) { setModal(null); await loadData(); }
    else setError((await response.json()).error ?? "保存失败");
  }

  async function addPart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const payload = { ...Object.fromEntries(form.entries()), kind: "part" };
    const response = await fetch("/api/workshop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setSaving(false);
    if (response.ok) { setModal(null); await loadData(); }
    else setError((await response.json()).error ?? "保存失败");
  }

  async function updateStatus(repair: Repair, status: Status) {
    setRepairs((current) => current.map((item) => item.id === repair.id ? { ...item, status } : item));
    setSelected((current) => current?.id === repair.id ? { ...current, status } : current);
    const response = await fetch("/api/workshop", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: repair.id, status }) });
    if (!response.ok) await loadData();
  }

  const nextStatus = selected ? statusOrder[statusOrder.indexOf(selected.status) + 1] : undefined;

  return (
    <main className="app-shell">
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="brand"><span className="brand-mark"><Wrench size={20} /></span><span>IFix<small>WORKSHOP</small></span></div>
        <button className="close-menu" onClick={() => setMenuOpen(false)} aria-label="关闭菜单"><X /></button>
        <nav>
          <p className="nav-label">工作空间</p>
          <button className={activeView === "dashboard" ? "active" : ""} onClick={() => { setActiveView("dashboard"); setMenuOpen(false); }}><LayoutDashboard /> 总览</button>
          <button className={activeView === "repairs" ? "active" : ""} onClick={() => { setActiveView("repairs"); setMenuOpen(false); }}><ClipboardList /> 维修工单 <span>{activeCount}</span></button>
          <button className={activeView === "parts" ? "active" : ""} onClick={() => { setActiveView("parts"); setMenuOpen(false); }}><PackageOpen /> 零件采购 <span>{parts.filter((p) => p.status !== "received").length}</span></button>
          <p className="nav-label second">管理</p>
          <button><CalendarDays /> 排期日历</button>
          <button><CircleDollarSign /> 费用记录</button>
          <button><Settings /> 设置</button>
        </nav>
        <div className="shop-card">
          <div className="avatar">AD</div>
          <div><strong>Adele 的工作间</strong><small><i /> 今天营业中</small></div>
          <MoreHorizontal size={18} />
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="header-title">
            <button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="打开菜单"><Menu /></button>
            <div><p>{fullDate()}</p><h1>{activeView === "dashboard" ? "早上好，Adele" : activeView === "repairs" ? "维修工单" : "零件采购"}</h1></div>
          </div>
          <div className="header-actions">
            <label className="global-search"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索工单、设备或客户…" /></label>
            <button className="primary-button" onClick={() => setModal("repair")}><Plus size={18} /> 新建维修</button>
          </div>
        </header>

        {error && <div className="error-banner"><AlertCircle size={18} /><span>{error}</span><button onClick={loadData}>重试</button></div>}

        {activeView === "dashboard" && (
          <div className="dashboard-content">
            <section className="metric-grid">
              <Metric icon={<Wrench />} label="进行中的维修" value={loading ? "—" : activeCount} note="台设备" tone="ink" />
              <Metric icon={<AlertCircle />} label="需要优先处理" value={loading ? "—" : urgentCount} note="台紧急" tone="coral" />
              <Metric icon={<PackageOpen />} label="等待零件" value={loading ? "—" : waitingCount} note="个工单" tone="amber" />
              <Metric icon={<CircleDollarSign />} label="待收维修费" value={loading ? "—" : `$${completedValue.toFixed(0)}`} note="已完成" tone="green" />
            </section>

            <div className="dashboard-grid">
              <section className="panel pipeline-panel">
                <div className="panel-heading"><div><span className="eyebrow">维修流程</span><h2>当前进度</h2></div><button className="text-button" onClick={() => setActiveView("repairs")}>查看全部 <ArrowRight size={15} /></button></div>
                <div className="pipeline-tabs">
                  {statusOrder.map((status) => <button key={status} className={filter === status ? "active" : ""} onClick={() => setFilter(filter === status ? "all" : status)}><span className={`status-dot ${statusMeta[status].className}`} />{statusMeta[status].label}<b>{repairs.filter((r) => r.status === status).length}</b></button>)}
                </div>
                <div className="repair-list">
                  {(filter === "all" ? repairs.filter((r) => r.status !== "ready") : filteredRepairs).slice(0, 5).map((repair) => <RepairRow key={repair.id} repair={repair} onOpen={() => setSelected(repair)} />)}
                  {!loading && repairs.length === 0 && <EmptyState label="还没有维修工单" />}
                </div>
              </section>

              <aside className="today-panel panel">
                <div className="panel-heading"><div><span className="eyebrow">今日计划</span><h2>优先处理</h2></div><span className="date-pill">{new Date().getDate()}</span></div>
                <div className="timeline">
                  {repairs.filter((r) => r.priority === "urgent" || r.dueAt <= new Date().toISOString().slice(0, 10)).slice(0, 3).map((repair, index) => (
                    <button key={repair.id} className="timeline-item" onClick={() => setSelected(repair)}>
                      <span className="time">{index === 0 ? "09:30" : index === 1 ? "13:00" : "16:30"}</span>
                      <span className={`timeline-line ${statusMeta[repair.status].className}`}><i /></span>
                      <span className="timeline-copy"><strong>{repair.brandModel}</strong><small>{index === 0 ? "检测与报价" : index === 1 ? "维修 / 组装" : "测试与通知"}</small></span>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </div>
                <div className="capacity"><div><span>今日工作量</span><strong>6.5h / 8h</strong></div><div className="capacity-track"><i /></div><small>还有约 1.5 小时可安排</small></div>
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
                  {parts.filter((p) => p.status === status).map((part) => <PartCard key={part.id} part={part} repair={repairs.find((r) => r.id === part.repairId)} vertical />)}
                  <button className="column-add" onClick={() => setModal("part")}><Plus size={16} /> 添加</button>
                </div>
              ))}
            </section>
          </div>
        )}
      </section>

      {selected && <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setSelected(null)}><aside className="drawer">
        <button className="icon-button drawer-close" onClick={() => setSelected(null)}><X /></button>
        <div className="drawer-kicker"><span className={`status-badge ${statusMeta[selected.status].className}`}>{statusMeta[selected.status].label}</span>{selected.priority === "urgent" && <span className="priority-badge">紧急</span>}</div>
        <p className="ticket">{selected.ticketNo}</p><h2>{selected.brandModel}</h2><p className="issue-copy">{selected.issue}</p>
        <div className="progress-rail">{statusOrder.map((status, index) => <i key={status} className={index <= statusOrder.indexOf(selected.status) ? "done" : ""} />)}</div>
        <div className="detail-grid"><Detail label="客户" value={selected.customer} /><Detail label="联系电话" value={selected.phone || "未填写"} /><Detail label="接收日期" value={selected.receivedAt} /><Detail label="承诺交付" value={selected.dueAt} /><Detail label="预估费用" value={`$${selected.estimate.toFixed(2)}`} /><Detail label="设备类别" value={selected.device} /></div>
        <div className="notes-box"><span>维修备注</span><p>{selected.notes || "暂无备注"}</p></div>
        <div className="linked-parts"><span>关联零件</span>{parts.filter((p) => p.repairId === selected.id).map((part) => <div key={part.id}><Box size={17} /><span><strong>{part.name}</strong><small>{part.supplier}</small></span><span className={`status-badge ${partMeta[part.status].className}`}>{partMeta[part.status].label}</span></div>)}{!parts.some((p) => p.repairId === selected.id) && <p className="muted">暂无关联采购</p>}</div>
        {nextStatus && <button className="primary-button drawer-action" onClick={() => updateStatus(selected, nextStatus)}>推进至「{statusMeta[nextStatus].label}」<ArrowRight size={17} /></button>}
        {!nextStatus && <button className="completed-button"><Check size={18} /> 此工单已完成</button>}
      </aside></div>}

      {modal && <div className="overlay modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setModal(null)}><div className="modal-card">
        <button className="icon-button modal-close" onClick={() => setModal(null)}><X /></button>
        <span className="eyebrow">{modal === "repair" ? "新工单" : "采购记录"}</span><h2>{modal === "repair" ? "登记维修设备" : "添加采购零件"}</h2>
        {modal === "repair" ? <RepairForm onSubmit={addRepair} onCancel={() => setModal(null)} saving={saving} /> : <PartForm onSubmit={addPart} saving={saving} repairs={repairs} />}
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

function PartCard({ part, repair, vertical = false }: { part: Part; repair?: Repair; vertical?: boolean }) {
  return <article className={`part-card ${vertical ? "vertical" : ""}`}><span className="part-icon">{part.status === "received" ? <PackageCheck /> : <PackageOpen />}</span><div className="part-copy"><strong>{part.name}</strong><small>{repair?.ticketNo ?? "库存采购"} · {part.supplier}</small></div><div className="part-meta"><span className={`status-badge ${partMeta[part.status].className}`}>{partMeta[part.status].label}</span><small>{part.expectedAt ? `预计 ${shortDate(part.expectedAt)}` : "未定到货日"}</small></div></article>;
}

function EmptyState({ label }: { label: string }) {
  return <div className="empty-state"><ClipboardList /><p>{label}</p></div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><small>{label}</small><strong>{value}</strong></div>;
}

function RepairForm({ onSubmit, onCancel, saving }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void; saving: boolean }) {
  return <form onSubmit={onSubmit} className="entry-form"><div className="form-grid"><label>设备类别*<select name="device" required defaultValue="笔记本电脑"><option>笔记本电脑</option><option>台式电脑</option><option>数码相机</option><option>镜头</option><option>平板电脑</option><option>游戏主机</option><option>其他设备</option></select></label><label>品牌 / 型号*<input name="brandModel" required placeholder="例如 Sony α7 IV" /></label><label>客户姓名*<input name="customer" required placeholder="客户姓名" /></label><label>联系电话<input name="phone" placeholder="电话或手机" /></label><label className="wide">故障描述*<textarea name="issue" required placeholder="记录客户描述的现象…" rows={3} /></label><label>承诺交付*<input name="dueAt" type="date" required defaultValue={DEFAULT_DUE_DATE} /></label><label>预估费用<input name="estimate" type="number" min="0" step="0.01" placeholder="0.00" /></label><label>优先级<select name="priority"><option value="normal">普通</option><option value="urgent">紧急</option></select></label><label>初始备注<input name="notes" placeholder="可选" /></label></div><div className="form-actions"><button type="button" className="ghost-button" onClick={onCancel}>取消</button><button className="primary-button" disabled={saving}>{saving ? "正在保存…" : "创建工单"}</button></div></form>;
}

function PartForm({ onSubmit, saving, repairs }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void; saving: boolean; repairs: Repair[] }) {
  return <form onSubmit={onSubmit} className="entry-form"><div className="form-grid"><label>零件名称*<input name="name" required placeholder="例如 USB-C 充电接口" /></label><label>供应商*<input name="supplier" required placeholder="供应商名称" /></label><label>关联工单<select name="repairId" defaultValue=""><option value="">库存采购</option>{repairs.map((r) => <option key={r.id} value={r.id}>{r.ticketNo} · {r.brandModel}</option>)}</select></label><label>订单编号<input name="orderNo" placeholder="可稍后补充" /></label><label>成本<input name="cost" type="number" min="0" step="0.01" placeholder="0.00" /></label><label>预计到货<input name="expectedAt" type="date" /></label><label className="wide">当前状态<select name="status"><option value="to_order">待下单</option><option value="ordered">已下单</option><option value="shipped">运输中</option><option value="received">已到货</option></select></label></div><div className="form-actions"><span /><button className="primary-button" disabled={saving}>{saving ? "正在保存…" : "添加零件"}</button></div></form>;
}
