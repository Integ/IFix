import { ArrowRight, Check, PackageOpen, Plus } from "lucide-react";
import { useState } from "react";
import { EmptyState, FilterChips } from "./ui";
import { money, Part, partMeta, partStatusOrder, Repair, shortDate } from "./workshop";

type Tab = "pending" | "received" | "all";

type Props = {
  parts: Part[];
  repairs: Repair[];
  loading: boolean;
  onAdd: () => void;
  onAdvance: (part: Part) => void;
};

export default function PartsView({ parts, repairs, loading, onAdd, onAdvance }: Props) {
  const [tab, setTab] = useState<Tab>("pending");
  const pending = parts.filter((part) => part.status !== "received");

  const rows = parts
    .filter((part) => tab === "all" || (tab === "pending") === (part.status !== "received"))
    .sort((a, b) =>
      partStatusOrder.indexOf(a.status) - partStatusOrder.indexOf(b.status) ||
      (a.expectedAt || "9999").localeCompare(b.expectedAt || "9999") || b.id - a.id);

  return (
    <div className="page-content">
      <div className="toolbar">
        <FilterChips value={tab} onChange={setTab} options={[
          { key: "pending", label: "未到货", count: pending.length },
          { key: "received", label: "已到货", count: parts.length - pending.length },
          { key: "all", label: "全部", count: parts.length },
        ]} />
        <button className="primary-button" onClick={onAdd}><Plus size={18} /> 添加采购</button>
      </div>

      <section className="panel table-panel">
        <div className="parts-table table-head"><span>零件</span><span>预计到货</span><span>成本</span><span>状态</span><span /></div>
        {rows.map((part) => {
          const repair = repairs.find((item) => item.id === part.repairId);
          const next = partStatusOrder[partStatusOrder.indexOf(part.status) + 1];
          return (
            <div key={part.id} className="parts-table parts-row">
              <span className="table-device">
                <span className="device-icon"><PackageOpen size={18} /></span>
                <span>
                  <strong>{part.name}</strong>
                  <small>{part.supplier}{part.orderNo ? ` · ${part.orderNo}` : ""} · {repair ? `${repair.ticketNo} ${repair.brandModel}` : "备货"}</small>
                </span>
              </span>
              <span>{part.expectedAt && part.status !== "received" ? shortDate(part.expectedAt) : "—"}</span>
              <span>{part.cost ? money(part.cost) : "—"}</span>
              <span><i className={`status-badge ${partMeta[part.status].className}`}>{partMeta[part.status].label}</i></span>
              <span className="row-action">
                {next
                  ? <button className="secondary-button small" onClick={() => onAdvance(part)}>标记{partMeta[next].label}<ArrowRight size={14} /></button>
                  : <span className="done"><Check size={15} /> 完成</span>}
              </span>
            </div>
          );
        })}
        {!loading && rows.length === 0 && (
          <EmptyState
            icon={<PackageOpen />}
            title={parts.length === 0 ? "还没有采购记录" : tab === "pending" ? "没有在途的零件" : "还没有已到货的零件"}
            hint={parts.length === 0 ? "需要订购零件时，在这里记录并跟踪到货" : undefined}
            action={parts.length === 0 ? { label: "添加采购", onClick: onAdd } : undefined}
          />
        )}
      </section>
    </div>
  );
}
