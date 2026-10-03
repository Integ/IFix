import { X } from "lucide-react";
import { ReactNode, useEffect, useRef } from "react";

// Open overlays, innermost last. Esc closes only the top one, so pressing it
// with a form open on top of a drawer closes the form and leaves the drawer.
const overlays: Array<() => void> = [];

function useEscape(onClose: () => void) {
  const latest = useRef(onClose);
  useEffect(() => {
    latest.current = onClose;
  });
  useEffect(() => {
    const close = () => latest.current();
    overlays.push(close);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && overlays[overlays.length - 1] === close) close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      overlays.splice(overlays.indexOf(close), 1);
    };
  }, []);
}

export function Modal({ eyebrow, title, onClose, children }: { eyebrow?: string; title: string; onClose: () => void; children: ReactNode }) {
  useEscape(onClose);
  return (
    <div className="overlay modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-label={title}>
        <button className="icon-button modal-close" onClick={onClose} aria-label="关闭"><X /></button>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Drawer({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  useEscape(onClose);
  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={label}>
        <button className="icon-button drawer-close" onClick={onClose} aria-label="关闭"><X /></button>
        {children}
      </aside>
    </div>
  );
}

export function EmptyState({ icon, title, hint, action }: { icon: ReactNode; title: string; hint?: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="empty-state">
      {icon}
      <p><strong>{title}</strong>{hint && <small>{hint}</small>}</p>
      {action && <button className="secondary-button" onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}

export function Metric({ icon, label, value, note, tone, onClick }: { icon: ReactNode; label: string; value: string | number; note?: string; tone: string; onClick?: () => void }) {
  const body = (
    <>
      <span className={`metric-icon ${tone}`}>{icon}</span>
      <div><p>{label}</p><strong>{value}</strong>{note && <small>{note}</small>}</div>
    </>
  );
  return onClick
    ? <button className="metric-card clickable" onClick={onClick}>{body}</button>
    : <article className="metric-card">{body}</article>;
}

export function FilterChips<T extends string>({ value, onChange, options }: { value: T; onChange: (value: T) => void; options: { key: T; label: string; count?: number; alert?: boolean }[] }) {
  return (
    <div className="chips" role="tablist">
      {options.map(({ key, label, count, alert }) => (
        <button key={key} role="tab" aria-selected={value === key} className={`${value === key ? "active" : ""} ${alert ? "alert" : ""}`} onClick={() => onChange(key)}>
          {label}{count !== undefined && <b>{count}</b>}
        </button>
      ))}
    </div>
  );
}
