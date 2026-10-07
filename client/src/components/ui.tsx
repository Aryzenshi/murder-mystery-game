import { useEffect, type ReactNode } from 'react';
import { useGame } from '../store/gameStore';

/* ------------------------------------------------------------------ *
 * Toasts
 * ------------------------------------------------------------------ */

export function ToastStack() {
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast" data-tone={toast.tone} onClick={() => dismiss(toast.id)}>
          <span className="toast__icon">
            {toast.tone === 'error' ? 'Alert' : toast.tone === 'success' ? 'Noted' : 'Notice'}
          </span>
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Dialog
 * ------------------------------------------------------------------ */

export function Modal({
  title,
  sub,
  children,
  footer,
  onClose,
  wide,
}: {
  title: string;
  sub?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose?: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <div className="dialog" style={wide ? { width: 'min(860px, 100%)' } : undefined} role="dialog" aria-modal="true">
        <div className="dialog__header">
          <div className="dialog__title">{title}</div>
          {sub && <div className="dialog__sub">{sub}</div>}
          {onClose && (
            <button className="dialog__close" onClick={onClose} aria-label="Close">
              ×
            </button>
          )}
        </div>
        <div className="dialog__body scroll-y">{children}</div>
        {footer && <div className="dialog__footer">{footer}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Controls
 * ------------------------------------------------------------------ */

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (value: T) => void;
  label?: string;
}) {
  return (
    <div>
      {label && <span className="field-label">{label}</span>}
      <div className="segmented">
        {options.map((option) => (
          <button
            key={option.value}
            className="segmented__item"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            title={option.hint}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <div className="switch" data-on={checked} onClick={() => onChange(!checked)} role="switch" aria-checked={checked} tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onChange(!checked);
        }
      }}
    >
      <span className="switch__track">
        <span className="switch__knob" />
      </span>
      <span className="switch__label">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Connection strip
 * ------------------------------------------------------------------ */

export function ConnectionStrip() {
  const connected = useGame((s) => s.connected);
  const reconnecting = useGame((s) => s.reconnecting);
  if (connected && !reconnecting) return null;
  return (
    <div className="conn-strip" data-state={connected ? 'connected' : 'reconnecting'}>
      <span className="conn-strip__dot" />
      {connected ? 'CONNECTED' : 'RECONNECTING…'}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Mansion mark — engraved line art used on the title screen
 * ------------------------------------------------------------------ */

export function MansionMark({ width = 150 }: { width?: number }) {
  return (
    <svg viewBox="0 0 200 96" width={width} className="mansion-mark" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 88 H186" strokeWidth="2.2" />
        <path d="M40 88 V34 L100 8 L160 34 V88" />
        <path d="M34 34 L100 4 L166 34" />
        <path d="M100 8 V0" />
        <path d="M100 3 L112 6 M100 3 L88 6" strokeWidth="1.2" />
        <path d="M126 22 V6 H136 V26" />
        <path d="M56 26 V10 H66 V30" />
        {/* windows */}
        {[52, 88, 124].map((x) => (
          <g key={x}>
            <rect x={x - 8} y={44} width="16" height="20" rx="1" />
            <path d={`M${x} 44 V64 M${x - 8} 54 H${x + 8}`} strokeWidth="1" />
          </g>
        ))}
        {[52, 88, 124].map((x) => (
          <g key={`b${x}`}>
            <rect x={x - 8} y={70} width="16" height="16" rx="1" />
            <path d={`M${x} 70 V86 M${x - 8} 78 H${x + 8}`} strokeWidth="1" />
          </g>
        ))}
        {/* door */}
        <path d="M92 62 h16 v26 h-16 z" />
        <path d="M100 62 V88" strokeWidth="1" />
        <circle cx="105" cy="76" r="1" />
        <path d="M86 62 H114" strokeWidth="1.2" />
        {/* steps */}
        <path d="M84 88 H116 L120 94 H80 Z" />
        <path d="M14 88 C30 84 44 82 60 82" strokeWidth="1" opacity="0.6" />
        <path d="M186 88 C170 84 156 82 140 82" strokeWidth="1" opacity="0.6" />
      </g>
    </svg>
  );
}
