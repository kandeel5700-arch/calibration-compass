import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Home,
  Boxes,
  Users,
  LogOut,
  Menu,
  X,
  Clock,
  User as UserIcon,
  FileText,
  HelpCircle,
  ClipboardList,
  MapPin,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LiveClock } from "@/components/LiveClock";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/NotificationBell";

const NAV = [
  { to: "/", label: "الصفحة الرئيسية", icon: Home, adminOnly: false },
  { to: "/equipment", label: "الأجهزة", icon: Boxes, adminOnly: false },
  { to: "/attendance", label: "الحضور والانصراف", icon: Clock, adminOnly: false },
  { to: "/leaves", label: "الإجازات", icon: Calendar, adminOnly: false },
  { to: "/achievements", label: "إنجازاتي", icon: Award, adminOnly: false },
  { to: "/reports", label: "التقارير", icon: FileText, adminOnly: false },
  { to: "/profile", label: "الملف الشخصي", icon: UserIcon, adminOnly: false },
  { to: "/users", label: "المستخدمون", icon: Users, adminOnly: true },
  { to: "/help", label: "مركز المساعدة", icon: HelpCircle, adminOnly: false },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  async function handleLogout() {
    await signOut();
    navigate({ to: "/login" });
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Mobile top bar */}
      <header className="md:hidden flex items-center justify-between p-4 border-b border-border glass-card sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <Logo size={36} />
          <span className="font-bold text-lg text-gradient-primary">UECC Survey</span>
        </div>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={() => setOpen(!open)}>
            {open ? <X /> : <Menu />}
          </Button>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={cn(
          "md:w-64 md:min-h-screen border-l border-border bg-sidebar/60 backdrop-blur-md flex-col",
          "md:flex md:sticky md:top-0 md:h-screen md:overflow-y-auto",
          open ? "flex" : "hidden md:flex"
        )}
      >
        <div className="hidden md:flex items-center justify-between gap-2 p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-3 min-w-0">
            <Logo size={44} />
            <div className="min-w-0">
              <h1 className="font-bold text-base leading-tight text-gradient-primary truncate">
                UECC Survey
              </h1>
              <p className="text-[11px] text-muted-foreground truncate">نظام إدارة المعايرة</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <ThemeToggle />
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {NAV.filter((n) => !n.adminOnly || isAdmin).map((n) => {
            const Icon = n.icon;
            const active = path === n.to;
            return (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg transition-all",
                  active
                    ? "gradient-primary text-primary-foreground shadow-luxe font-semibold"
                    : "text-sidebar-foreground hover:bg-sidebar-accent"
                )}
              >
                <Icon className="w-5 h-5" />
                <span>{n.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border space-y-3">
          <LiveClock />
          <div className="px-3 py-2 rounded-lg bg-sidebar-accent/50">
            <p className="text-xs text-muted-foreground">مسجّل كـ</p>
            <p className="text-sm font-medium truncate">{user?.email}</p>
            <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-semibold">
              {isAdmin ? "مدير النظام" : "مستخدم عادي"}
            </span>
          </div>
          <Button onClick={handleLogout} variant="outline" className="w-full gap-2">
            <LogOut className="w-4 h-4" />
            تسجيل الخروج
          </Button>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-8 max-w-full overflow-x-hidden animate-fade-up print:p-0">
        {children}
      </main>
    </div>
  );
}
