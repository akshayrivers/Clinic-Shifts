"use client";

import { useEffect } from "react";

interface Toast {
  id: string;
  type: "success" | "error";
  message: string;
}

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-semibold animate-in slide-in-from-right ${
        toast.type === "success"
          ? "bg-emerald-50 border-emerald-200 text-emerald-800"
          : "bg-rose-50 border-rose-200 text-rose-800"
      }`}
    >
      <span>{toast.type === "success" ? "✅" : "⚠️"} {toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-current opacity-60 hover:opacity-100 font-bold leading-none text-lg"
      >
        &times;
      </button>
    </div>
  );
}
