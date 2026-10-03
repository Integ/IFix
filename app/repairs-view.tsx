import { ClipboardList, Search } from "lucide-react";
import { useMemo } from "react";
import { EmptyState, FilterChips } from "./ui";
import { byUrgency, deviceIcon, dueInfo, isOverdue, matchesFilter, Repair, RepairFilter, statusMeta } from "./workshop";

type Props = {
  repairs: Repair[];
  today: string;
  loading: boolean;
  filter: RepairFilter;
  setFilter: (filter: RepairFilter) => void;
  search: string;
  setSearch: (value: string) => void;
  onOpen: (id: number) => void;
  onNew: () => void;
};

const searchable = (repair: Repair) =>
  `${repair.ticketNo} ${repair.device} ${repair.brandModel} ${repair.customer} ${repair.phone} ${repair.issue} ${repair.serialNumber} ${repair.notes}`.toLocaleLowerCase("zh-CN");

export default function RepairsView({ repairs, today, loading, filter, setFilter, search, setSearch, onOpen, onNew }: Props) {
  const count = (key: RepairFilter) => repairs.filter((repair) => matchesFilter(repair, key, today)).length;

  const rows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("zh-CN");
    return repairs
      // While searching, look through everything: people search to find a ticket, not to filter.
      .filter((repair) => (query ? searchable(repair).includes(query) : matchesFilter(repair, filter, today)))
      .sort(byUrgency(today));
  }, [repairs, filter, search, today]);

  const searching = search.trim() !== "";

  return (
    <div className="page-content">
      <div className="toolbar">
        {searching
          ? <p className="search-note">在全部工单中搜索，共 {rows.length} 条结果</p>
          : <FilterChips value={filter} onChange={setFilter} options={[
              { key: "active", label: "进行中", count: count("active") },
              { key: "overdue", label: "逾期", count: count("overdue"), alert: count("overdue") > 0 },
              { key: "ready", label: "可取件", count: count("ready") },
              { key: "collected", label: "已取件", count: count("collected") },
              { key: "all", label: "全部", count: repairs.length },
            ]} />}
        <label className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索客户、设备、电话、工单号" aria-label="搜索工单" /></label>
      </div>

      <section className="panel table-panel">
        <div className="work-table table-head"><span>设备</span><span>问题</span><span>交付</span><span>状态</span></div>
        {rows.map((repair) => {
          const due = dueInfo(repair, today);
          return (
            <button key={repair.id} className={`work-table work-row ${isOverdue(repair, today) ? "overdue" : ""}`} onClick={() => onOpen(repair.id)}>
              <span className="table-device">
                <span className="device-icon">{deviceIcon(repair.device)}</span>
                <span>
                  <strong>{repair.brandModel}{repair.priority === "urgent" && repair.status !== "collected" && <em className="tag coral">紧急</em>}</strong>
                  <small>{repair.customer} · {repair.ticketNo}<span className={`due-inline ${due.tone}`}> · {due.text}</span></small>
                </span>
              </span>
              <span className="ellipsis">{repair.issue}</span>
              <span className={`due ${due.tone}`}>{due.text}</span>
              <span><i className={`status-badge ${statusMeta[repair.status].className}`}>{statusMeta[repair.status].label}</i></span>
            </button>
          );
        })}
        {!loading && rows.length === 0 && (
          searching
            ? <EmptyState icon={<Search />} title="没有找到匹配的工单" hint="换个关键词试试" />
            : repairs.length === 0
              ? <EmptyState icon={<ClipboardList />} title="还没有工单" action={{ label: "新建工单", onClick: onNew }} />
              : <EmptyState icon={<ClipboardList />} title={filter === "overdue" ? "没有逾期的工单" : "这里没有工单"} hint={filter === "all" ? undefined : "切换上方的分类查看其他工单"} />
        )}
      </section>
    </div>
  );
}
