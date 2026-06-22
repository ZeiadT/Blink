import React, { useEffect, useState, useCallback } from 'react';
import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import styles from './Toast.module.css';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

const ICONS: Record<ToastType, LucideIcon> = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

// ── Global toast state (lightweight, no Zustand needed) ──
let toastListeners: Array<(toasts: Toast[]) => void> = [];
let toasts: Toast[] = [];

function notify() {
  toastListeners.forEach((fn) => fn([...toasts]));
}

export function showToast(type: ToastType, message: string, duration = 4000) {
  const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  toasts = [...toasts, { id, type, message, duration }];
  notify();

  if (duration > 0) {
    setTimeout(() => {
      dismissToast(id);
    }, duration);
  }
}

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  notify();
}

// ── Toast Item ──
const ToastItem: React.FC<{ toast: Toast; onDismiss: (id: string) => void }> = ({
  toast,
  onDismiss,
}) => {
  const Icon = ICONS[toast.type];
  return (
    <div className={`${styles.toast} ${styles[toast.type]}`} role="alert">
      <Icon size={16} className={styles.icon} />
      <span className={styles.message}>{toast.message}</span>
      <button
        className={styles.dismiss}
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>
    </div>
  );
};

// ── Toast Container (mount once in App) ──
export const ToastContainer: React.FC = () => {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    toastListeners.push(setItems);
    return () => {
      toastListeners = toastListeners.filter((fn) => fn !== setItems);
    };
  }, []);

  const handleDismiss = useCallback((id: string) => {
    dismissToast(id);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className={styles.container} aria-live="polite">
      {items.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={handleDismiss} />
      ))}
    </div>
  );
};
