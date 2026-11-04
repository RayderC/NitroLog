"use client";

import { useEffect } from "react";

export default function Modal({ title, onClose, children, wide, footer }: {
  title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; footer?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-label={title}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

/** Small action sheet for "⋯" menus. */
export function Sheet({ title, onClose, actions }: {
  title: string; onClose: () => void;
  actions: { label: string; onClick: () => void; danger?: boolean; hidden?: boolean }[];
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="sheet-actions">
        {actions.filter(a => !a.hidden).map(a => (
          <button key={a.label} className={`sheet-action ${a.danger ? "danger" : ""}`} onClick={() => { onClose(); a.onClick(); }}>
            {a.label}
          </button>
        ))}
      </div>
    </Modal>
  );
}
