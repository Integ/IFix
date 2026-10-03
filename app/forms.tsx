import { FormEvent } from "react";
import { addDays, deviceCategories, localDate, partMeta, partStatusOrder, Repair, statusMeta, statusOrder } from "./workshop";

type Submit = (event: FormEvent<HTMLFormElement>) => void;

/**
 * New ticket: only what you need at the counter. Everything optional lives
 * under "更多信息", which is open by default when editing an existing ticket.
 */
export function RepairForm({ repair, saving, onSubmit, onCancel }: { repair?: Repair; saving: boolean; onSubmit: Submit; onCancel: () => void }) {
  return (
    <form onSubmit={onSubmit} className="entry-form">
      <div className="form-grid">
        <label>客户姓名*<input name="customer" required autoFocus placeholder="客户姓名" defaultValue={repair?.customer} /></label>
        <label>联系电话<input name="phone" type="tel" inputMode="tel" placeholder="电话或手机" defaultValue={repair?.phone} /></label>
        <label>设备类别*
          <select name="device" required defaultValue={repair?.device ?? deviceCategories[0]}>
            {deviceCategories.map((name) => <option key={name}>{name}</option>)}
          </select>
        </label>
        <label>品牌 / 型号*<input name="brandModel" required placeholder="例如 Sony α7 IV" defaultValue={repair?.brandModel} /></label>
        <label className="wide">故障描述*<textarea name="issue" required rows={3} placeholder="客户描述的现象…" defaultValue={repair?.issue} /></label>
        <label>承诺交付*<input name="dueAt" type="date" required defaultValue={repair?.dueAt ?? addDays(localDate(), 2)} /></label>
        <label className="check-label"><input name="urgent" type="checkbox" defaultChecked={repair?.priority === "urgent"} /><span>紧急，优先处理</span></label>
      </div>

      <details className="more-fields" open={Boolean(repair)}>
        <summary>更多信息（可选）</summary>
        <div className="form-grid">
          <label>序列号 / IMEI<input name="serialNumber" placeholder="用于设备核对" defaultValue={repair?.serialNumber} /></label>
          <label>预估费用<input name="estimate" type="number" min="0" step="0.01" placeholder="0.00" defaultValue={repair?.estimate || ""} /></label>
          {repair && (
            <>
              <label>工单状态
                <select name="status" defaultValue={repair.status}>
                  {statusOrder.map((status) => <option key={status} value={status}>{statusMeta[status].label}</option>)}
                </select>
              </label>
              <label>实际收费<input name="actualCharge" type="number" min="0" step="0.01" placeholder="完工后填写" defaultValue={repair.actualCharge || ""} /></label>
            </>
          )}
          <label className="wide">维修备注<textarea name="notes" rows={3} placeholder="检测结果、维修过程或取件说明" defaultValue={repair?.notes} /></label>
          {repair && <label className="check-label wide"><input name="isPaid" type="checkbox" defaultChecked={repair.isPaid} /><span>维修费已收款</span></label>}
        </div>
      </details>

      <div className="form-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>取消</button>
        <button className="primary-button" disabled={saving}>{saving ? "正在保存…" : repair ? "保存更改" : "创建工单"}</button>
      </div>
    </form>
  );
}

export function PartForm({ repairs, saving, onSubmit, onCancel }: { repairs: Repair[]; saving: boolean; onSubmit: Submit; onCancel: () => void }) {
  return (
    <form onSubmit={onSubmit} className="entry-form">
      <div className="form-grid">
        <label>零件名称*<input name="name" required autoFocus placeholder="例如 USB-C 充电接口" /></label>
        <label>供应商*<input name="supplier" required placeholder="供应商名称" /></label>
        <label className="wide">用于哪张工单
          <select name="repairId" defaultValue="">
            <option value="">不关联工单（备货）</option>
            {repairs.filter((repair) => repair.status !== "collected").map((repair) => <option key={repair.id} value={repair.id}>{repair.ticketNo} · {repair.brandModel}</option>)}
          </select>
        </label>
      </div>
      <details className="more-fields">
        <summary>更多信息（可选）</summary>
        <div className="form-grid">
          <label>订单编号<input name="orderNo" placeholder="可稍后补充" /></label>
          <label>成本<input name="cost" type="number" min="0" step="0.01" placeholder="0.00" /></label>
          <label>预计到货<input name="expectedAt" type="date" /></label>
          <label>当前状态
            <select name="status" defaultValue="to_order">
              {partStatusOrder.map((status) => <option key={status} value={status}>{partMeta[status].label}</option>)}
            </select>
          </label>
        </div>
      </details>
      <div className="form-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>取消</button>
        <button className="primary-button" disabled={saving}>{saving ? "正在保存…" : "添加采购"}</button>
      </div>
    </form>
  );
}

