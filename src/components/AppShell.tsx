import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Home,
  Boxes,
  Users,
  LogOut,
  Menu,
  Clock,
  User as UserIcon,
  FileText,
  HelpCircle,
  ClipboardList,
  MapPin,
  Settings,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LiveClock } from "@/components/LiveClock";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/NotificationBell";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const NAV = [
  { to: "/", label: "الحضور والانصراف", icon: Clock, adminOnly: false },
  { to: "/dashboard", label: "لوحة الأجهزة", icon: Home, adminOnly: false },
  { to: "/tasks", label: "مهام اليوم", icon: ClipboardList, adminOnly: false },
  { to: "/equipment", label: "الأجهزة", icon: Boxes, adminOnly: false },
  { to: "/control-points", label: "النقاط المساحية", icon: MapPin, adminOnly: false },
  { to: "/reports", label: "التقارير", icon: FileText, adminOnly: false },
  { to: "/profile", label: "الملف الشخصي", icon: UserIcon, adminOnly: false },
  { to: "/attendance-settings", label: "إعدادات الحضور", icon: Settings, adminOnly: true },
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

  const navItems = NAV.filter((n) => !n.adminOnly || isAdmin);

  const NavLinks = ({ onClick }: { onClick?: () => void }) => (
    <>
      {navItems.map((n) => {
        const Icon = n.icon;
        const active = path === n.to;
        return (
          <Link
            key={n.to}
            to={n.to}
            onClick={onClick}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl transition-all active:scale-[0.98] touch-manipulation",
              active
                ? "gradient-primary text-primary-foreground shadow-luxe font-semibold"
                : "text-sidebar-foreground hover:bg-sidebar-accent"
            )}
          >
            <Icon className="w-5 h-5 shrink-0" />
            <span className="truncate">{n.label}</span>
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="min-h-screen flex flex-col md:flex-row pb-[env(safe-area-inset-bottom)]">
      {/* Mobile top bar */}
      <header
        className="md:hidden flex items-center justify-between gap-2 px-4 py-3 border-b border-border glass-card sticky top-0 z-40"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Logo size={36} />
          <span className="font-bold text-base text-gradient-primary truncate">
            UECC Survey
          </span>
        </div>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <ThemeToggle />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="القائمة">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="top"
              className="border-b border-sidebar-border bg-sidebar/95 backdrop-blur-xl rounded-b-2xl max-h-[88vh] overflow-y-auto p-0"
              style={{ paddingTop: "env(safe-area-inset-top)" }}
            >
              <SheetHeader className="px-5 pt-4 pb-3 border-b border-sidebar-border">
                <SheetTitle className="flex items-center gap-3 text-right">
                  <Logo size={40} />
                  <div className="flex-1 min-w-0">
                    <div className="text-gradient-primary font-bold leading-tight">
                      UECC Survey
                    </div>
                    <div className="text-[11px] font-normal text-muted-foreground truncate">
                      {user?.email}
                    </div>
                  </div>
                </SheetTitle>
              </SheetHeader>
              <nav className="p-3 space-y-1">
                <NavLinks onClick={() => setOpen(false)} />
              </nav>
              <div className="p-4 border-t border-sidebar-border space-y-3">
                <LiveClock />
                <Button
                  onClick={handleLogout}
                  variant="outline"
                  className="w-full gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  تسجيل الخروج
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:min-h-screen border-l border-border bg-sidebar/60 backdrop-blur-md flex-col md:sticky md:top-0 md:h-screen md:overflow-y-auto">
        <div className="flex items-center justify-between gap-2 p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-3 min-w-0">
            <Logo size={44} />
            <div className="min-w-0">
              <h1 className="font-bold text-base leading-tight text-gradient-primary truncate">
                UECC Survey
              </h1>
              <p className="text-[11px] text-muted-foreground truncate">
                نظام إدارة المعايرة
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <ThemeToggle />
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <NavLinks />
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
