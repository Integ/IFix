import { ArrowRight, CircleDollarSign, ClipboardList, PackageOpen } from "lucide-react";
import { useMemo } from "react";
import { EmptyState } from "./ui";
import { amountFor, daysBetween, deviceIcon, isBillable, longDate, money, Part, partMeta, Repair, RepairFilter, statusMeta } from "./workshop";

type Reason = { rank: number; text: string; tone: "coral" | "amber" | "green" };

function reasonFor(repair: Repair, today: string): Reason | null {
  if (repair.status === "collected") return null;
  if (repair.status === "ready") return { rank: 3, text: "可取件，通知客户", tone: "green" };
  const late = daysBetween(repair.dueAt, today);
  if (late > 0) return { rank: 0, text: `逾期 ${late} 天`, tone: "coral" };
  if (late === 0) return { rank: 1, text: "今天交付", tone: "amber" };
  if (repair.priority === "urgent") return { rank: 2, text: "紧急", tone: "coral" };
  return null;
}

type Props = {
  repairs: Repair[];
  parts: Part[];
  today: string;
  loading: boolean;
  onOpen: (id: number) => void;
  onNew: () => void;
  goRepairs: (filter: RepairFilter) => void;
  goParts: () => void;
  goFinance: () => void;
};

export default function TodayView({ repairs, parts, today, loading, onOpen, onNew, goRepairs, goParts, goFinance }: Props) {
  const todo = useMemo(
    () => repairs
      .map((repair) => ({ repair, reason: today ? reasonFor(repair, today) : null }))
      .filter((item): item is { repair: Repair; reason: Reason } => item.reason !== null)
      .sort((a, b) => a.reason.rank - b.reason.rank || a.repair.dueAt.localeCompare(b.repair.dueAt)),
    [repairs, today],
  );

  const count = (rank: number) => todo.filter((item) => item.reason.rank === rank).length;
  const summary = [
    count(0) && `${count(0)} 台逾期`,
    count(1) && `${count(1)} 台今天交付`,
    count(2) && `${count(2)} 台紧急`,
    count(3) && `${count(3)} 台可取件`,
  ].filter(Boolean).join(" · ");

  const inShop = repairs.filter((repair) => repair.status !== "collected").length;
  const waiting = parts.filter((part) => part.status !== "received");
  const owed = repairs.filter((repair) => isBillable(repair) && !repair.isPaid);
  const owedTotal = owed.reduce((sum, repair) => sum + amountFor(repair), 0);

  if (!loading && repairs.length === 0) {
    return (
      <div className="page-content">
        <section className="panel"><EmptyState icon={<ClipboardList />} title="还没有工单" hint="客户送来设备时，先在这里登记" action={{ label: "新建工单", onClick: onNew }} /></section>
      </div>
    );
  }

  return (
    <div className="page-content today">
      <section className="hero">
        <p>{longDate(today)}</p>
        <h2>{loading ? "正在加载…" : todo.length ? `有 ${todo.length} 件事需要处理` : "目前一切顺利"}</h2>
        {!loading && <p className="hero-sub">{summary || "没有逾期或今天到期的工单"}{` · 共 ${inShop} 台在店`}</p>}
      </section>

      {todo.length > 0 && (
        <section className="panel">
          <div className="panel-heading"><h2>需要处理</h2><button className="text-button" onClick={() => goRepairs("active")}>全部工单 <ArrowRight size={15} /></button></div>
          <div className="todo-list">
            {todo.slice(0, 8).map(({ repair, reason }) => (
              <button key={repair.id} className="todo-row" onClick={() => onOpen(repair.id)}>
                <span className="device-icon">{deviceIcon(repair.device)}</span>
                <span className="todo-main"><strong>{repair.brandModel}</strong><small>{repair.customer} · {repair.issue}</small></span>
                <span className={`tag ${reason.tone}`}>{reason.text}</span>
                <span className={`status-badge ${statusMeta[repair.status].className}`}>{statusMeta[repair.status].label}</span>
              </button>
            ))}
          </div>
          {todo.length > 8 && <button className="text-button more" onClick={() => goRepairs("active")}>还有 {todo.length - 8} 件，查看全部</button>}
        </section>
      )}

      <div className="today-side">
        {waiting.length > 0 && (
          <section className="panel">
            <div className="panel-heading"><h2>在等的零件</h2><button className="text-button" onClick={goParts}>采购 <ArrowRight size={15} /></button></div>
            <div className="todo-list">
              {waiting.slice(0, 4).map((part) => (
                <button key={part.id} className="todo-row compact" onClick={goParts}>
                  <span className="device-icon"><PackageOpen size={18} /></span>
                  <span className="todo-main"><strong>{part.name}</strong><small>{part.supplier}</small></span>
                  <span className={`status-badge ${partMeta[part.status].className}`}>{partMeta[part.status].label}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {owedTotal > 0 && (
          <button className="panel owed" onClick={goFinance}>
            <span className="metric-icon amber"><CircleDollarSign /></span>
            <span><small>待收款</small><strong>{money(owedTotal)}</strong><small>{owed.length} 台已完工未收款</small></span>
            <ArrowRight size={17} />
          </button>
        )}
      </div>
    </div>
  );
}
