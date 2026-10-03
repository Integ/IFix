import { Banknote, CircleDollarSign, Sparkles, Wallet } from "lucide-react";
import { useState } from "react";
import { EmptyState, FilterChips, Metric } from "./ui";
import { amountFor, isBillable, money, Part, Repair } from "./workshop";

type Tab = "owed" | "all";

type Props = {
  repairs: Repair[];
  parts: Part[];
  loading: boolean;
  onOpen: (id: number) => void;
};

export default function FinanceView({ repairs, parts, loading, onOpen }: Props) {
  const [tab, setTab] = useState<Tab>("owed");

  const owed = repairs.filter((repair) => isBillable(repair) && !repair.isPaid);
  const owedTotal = owed.reduce((sum, repair) => sum + amountFor(repair), 0);
  const collected = repairs.filter((repair) => repair.isPaid).reduce((sum, repair) => sum + amountFor(repair), 0);
  const partsSpend = parts.reduce((sum, part) => sum + part.cost, 0);
  const profit = collected - partsSpend;

  const partCost = (repair: Repair) => parts.filter((part) => part.repairId === repair.id).reduce((sum, part) => sum + part.cost, 0);
  const rows = (tab === "owed" ? owed : repairs).slice().sort((a, b) => b.id - a.id);

  return (
    <div className="page-content">
      <section className="metric-grid">
        <Metric icon={<CircleDollarSign />} tone="amber" label="待收款" value={loading ? "—" : money(owedTotal)} note={`${owed.length} 台已完工未收款`} onClick={() => setTab("owed")} />
        <Metric icon={<Banknote />} tone="green" label="已收款" value={loading ? "—" : money(collected)} note="维修费收入" />
        <Metric icon={<Sparkles />} tone="ink" label="毛利" value={loading ? "—" : money(profit)} note="已收款 − 零件成本" />
      </section>

      <div className="toolbar">
        <FilterChips value={tab} onChange={setTab} options={[
          { key: "owed", label: "待收款", count: owed.length },
          { key: "all", label: "全部工单", count: repairs.length },
        ]} />
        <small className="muted">金额均为 CAD</small>
      </div>

      <section className="panel table-panel">
        <div className="money-table table-head"><span>工单</span><span>金额</span><span>零件成本</span><span>毛利</span><span>收款</span></div>
        {rows.map((repair) => {
          const amount = amountFor(repair);
          const cost = partCost(repair);
          const billable = isBillable(repair);
          return (
            <button key={repair.id} className="money-table money-row" onClick={() => onOpen(repair.id)}>
              <span><strong>{repair.brandModel}</strong><small>{repair.customer} · {repair.ticketNo}</small></span>
              <span>{amount ? money(amount) : "—"}{billable && amount > 0 && repair.actualCharge === 0 && <small>按报价</small>}</span>
              <span className="hide-sm">{cost ? money(cost) : "—"}</span>
              <span className={`hide-sm ${amount - cost < 0 ? "negative" : "positive"}`}>{billable && amount ? money(amount - cost) : "—"}</span>
              <span>
                {repair.isPaid ? <i className="status-badge green">已收</i>
                  : billable ? <i className="status-badge amber">待收</i>
                  : <i className="status-badge slate">进行中</i>}
              </span>
            </button>
          );
        })}
        {!loading && rows.length === 0 && (
          <EmptyState icon={<Wallet />} title={tab === "owed" ? "没有待收款的工单" : "还没有工单"} hint={tab === "owed" ? "已完工的工单都已收款" : undefined} />
        )}
      </section>
    </div>
  );
}
