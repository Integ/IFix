import { ArrowRight, Box, Check } from "lucide-react";
import { Drawer } from "./ui";
import { amountFor, dueInfo, isBillable, money, Part, partMeta, Repair, statusMeta, statusOrder } from "./workshop";

type Props = {
  repair: Repair;
  parts: Part[];
  today: string;
  onClose: () => void;
  onEdit: () => void;
  onAdvance: (repair: Repair) => void;
  onTogglePaid: (repair: Repair) => void;
};

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><small>{label}</small><strong>{children}</strong></div>;
}

export default function RepairDrawer({ repair, parts, today, onClose, onEdit, onAdvance, onTogglePaid }: Props) {
  const step = statusOrder.indexOf(repair.status);
  const next = statusOrder[step + 1];
  const due = dueInfo(repair, today);
  const linked = parts.filter((part) => part.repairId === repair.id);

  return (
    <Drawer label={`工单 ${repair.ticketNo}`} onClose={onClose}>
      <div className="drawer-kicker">
        <span className={`status-badge ${statusMeta[repair.status].className}`}>{statusMeta[repair.status].label}</span>
        {repair.priority === "urgent" && <span className="tag coral">紧急</span>}
      </div>
      <p className="ticket">{repair.ticketNo}</p>
      <h2>{repair.brandModel}</h2>
      <p className="issue-copy">{repair.issue}</p>

      <div className="progress">
        <div className="progress-rail">{statusOrder.map((status, index) => <i key={status} className={index <= step ? "done" : ""} />)}</div>
        <small>第 {step + 1} / {statusOrder.length} 步 · {statusMeta[repair.status].label}</small>
      </div>

      <div className="detail-grid">
        <Detail label="客户">{repair.customer}</Detail>
        <Detail label="联系电话">{repair.phone ? <a href={`tel:${repair.phone}`}>{repair.phone}</a> : "未填写"}</Detail>
        <Detail label="承诺交付"><span className={due.tone}>{due.tone ? due.text : repair.dueAt}</span></Detail>
        <Detail label={repair.actualCharge > 0 ? "实际收费" : "预估费用"}>{amountFor(repair) ? money(amountFor(repair)) : "未报价"}</Detail>
      </div>

      <details className="more-fields">
        <summary>更多详情</summary>
        <div className="detail-grid">
          <Detail label="接收日期">{repair.receivedAt}</Detail>
          <Detail label="设备类别">{repair.device}</Detail>
          <Detail label="序列号 / IMEI">{repair.serialNumber || "未填写"}</Detail>
          <Detail label="预估费用">{repair.estimate ? money(repair.estimate) : "—"}</Detail>
        </div>
      </details>

      {isBillable(repair) && (
        <div className="payment-panel">
          <span><small>收款</small><strong>{repair.isPaid ? "已收" : "待收"} {money(amountFor(repair))}</strong></span>
          <button className={repair.isPaid ? "ghost-button" : "secondary-button"} onClick={() => onTogglePaid(repair)}>{repair.isPaid ? "改为未收" : "标记已收款"}</button>
        </div>
      )}

      {repair.notes && <div className="notes-box"><span>维修备注</span><p>{repair.notes}</p></div>}

      {linked.length > 0 && (
        <div className="linked-parts">
          <span>关联零件</span>
          {linked.map((part) => (
            <div key={part.id}>
              <Box size={17} />
              <span><strong>{part.name}</strong><small>{part.supplier}</small></span>
              <span className={`status-badge ${partMeta[part.status].className}`}>{partMeta[part.status].label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="drawer-actions">
        <button className="ghost-button" onClick={onEdit}>编辑</button>
        {next
          ? <button className="primary-button" onClick={() => onAdvance(repair)}>推进至「{statusMeta[next].label}」<ArrowRight size={17} /></button>
          : <button className="completed-button" disabled><Check size={18} /> 已取件，工单完成</button>}
      </div>
    </Drawer>
  );
}
