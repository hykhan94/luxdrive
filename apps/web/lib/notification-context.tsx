"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";

type NotificationType = "success" | "error" | "warning" | "info";

interface Notification {
  id: string;
  type: NotificationType;
  message: string;
}

interface NotificationContextType {
  showNotification: (type: NotificationType, message: string) => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context)
    throw new Error("useNotification must be used within NotificationProvider");
  return context;
}

const icons = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const styles = {
  success: "bg-green-500/10 border-green-500/30 text-green-400",
  error: "bg-red-500/10 border-red-500/30 text-red-400",
  warning: "bg-yellow-500/10 border-yellow-500/30 text-yellow-400",
  info: "bg-blue-500/10 border-blue-500/30 text-blue-400",
};

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const showNotification = useCallback(
    (type: NotificationType, message: string) => {
      // Dedup the same message showing up multiple times in a short window.
      // Fixes the burst-toast case where several panels fire the same 403
      // ("Your account has been suspended by the admin.") on mount during
      // the split second before the dashboard flips to the suspended screen.
      // Kept general — helps other burst cases too (network flap, etc.).
      setNotifications((prev) => {
        if (prev.some((n) => n.type === type && n.message === message))
          return prev;
        const id =
          Date.now().toString() + Math.random().toString(36).slice(2, 6);
        setTimeout(() => {
          setNotifications((cur) => cur.filter((n) => n.id !== id));
        }, 5000);
        return [...prev, { id, type, message }];
      });
    },
    [],
  );

  const dismiss = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
      {/* Notification Banner */}
      <div className="fixed top-0 left-0 right-0 z-[100] flex flex-col items-center gap-2 pt-4 pointer-events-none">
        {notifications.map((notification) => {
          const Icon = icons[notification.type];
          return (
            <div
              key={notification.id}
              className={`pointer-events-auto flex items-center gap-3 px-5 py-3 rounded-xl border backdrop-blur-md shadow-lg animate-slide-down ${styles[notification.type]}`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-medium">
                {notification.message}
              </span>
              <button
                onClick={() => dismiss(notification.id)}
                className="ml-2 hover:opacity-70 transition-opacity"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </NotificationContext.Provider>
  );
}
