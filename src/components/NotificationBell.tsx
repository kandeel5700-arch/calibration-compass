import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

interface Notif {
  id: string;
  title: string;
  description: string;
  to: string;
  variant: "warning" | "danger" | "info";
}

export function NotificationBell() {
  const { user, isAdmin } = useAuth();
  const [items, setItems] = useState<Notif[]>([]);

  async function load() {
    if (!user) return;
    const out: Notif[] = [];
    const today = new Date();
    const in30 = new Date();
    in30.setDate(today.getDate() + 30);

    // Equipment expiring / expired
    const { data: eq } = await supabase
      .from("equipment")
      .select("id, name, next_calibration_date")
      .lte("next_calibration_date", in30.toISOString().slice(0, 10));
    (eq ?? []).forEach((e: any) => {
      const isExpired = new Date(e.next_calibration_date) < today;
      out.push({
        id: `eq-${e.id}`,
        title: isExpired ? `جهاز منتهي: ${e.name}` : `قارب الانتهاء: ${e.name}`,
        description: `تاريخ المعايرة: ${new Date(e.next_calibration_date).toLocaleDateString("ar-EG")}`,
        to: "/equipment",
        variant: isExpired ? "danger" : "warning",
      });
    });

    // Open attendance session
    const { data: open } = await supabase
      .from("attendance")
      .select("id, check_in")
      .eq("user_id", user.id)
      .is("check_out", null)
      .maybeSingle();
    if (open) {
      out.push({
        id: `att-${open.id}`,
        title: "جلسة حضور مفتوحة",
        description: `بدأت في ${new Date(open.check_in).toLocaleTimeString("ar-EG")}`,
        to: "/attendance",
        variant: "info",
      });
    }

    if (isAdmin) {

      // Pending users
      const { count: userCount } = await supabase
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "pending");
      if (userCount && userCount > 0) {
        out.push({
          id: "u-pending",
          title: `${userCount} حساب جديد بانتظار الموافقة`,
          description: "اضغط لإدارة المستخدمين",
          to: "/users",
          variant: "warning",
        });
      }
    }

    setItems(out);
  }

  useEffect(() => {
    if (user) {
      load();
      const t = setInterval(load, 60_000);
      return () => clearInterval(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isAdmin]);

  const count = items.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" dir="rtl" align="end">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold">الإشعارات</h3>
          <Badge variant="secondary">{count}</Badge>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {count === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">
              لا توجد إشعارات جديدة 🎉
            </p>
          ) : (
            items.map((n) => {
              const variantClass =
                n.variant === "danger"
                  ? "border-r-destructive"
                  : n.variant === "warning"
                    ? "border-r-warning"
                    : "border-r-primary";
              return (
                <Link
                  key={n.id}
                  to={n.to}
                  className={`block p-3 border-b border-border border-r-4 ${variantClass} hover:bg-muted/40 transition-colors`}
                >
                  <p className="text-sm font-semibold">{n.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{n.description}</p>
                </Link>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
