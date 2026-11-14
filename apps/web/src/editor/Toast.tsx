/** The canvas toast (bottom centre, 2.2 s). Call `toast('…')` from app/useEditorStore. */
import { useEffect } from 'react';
import { useEditorStore } from '../app/useEditorStore';

export function Toast() {
  const t = useEditorStore((s) => s.toast);
  const hide = useEditorStore((s) => s.hideToast);
  useEffect(() => {
    if (!t) return;
    const id = setTimeout(hide, 2200);
    return () => clearTimeout(id);
  }, [t, hide]);
  if (!t) return null;
  return (
    <div className="toast" role="status" data-overlay>
      {t.text}
    </div>
  );
}
