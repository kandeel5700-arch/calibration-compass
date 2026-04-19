import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Protected } from "@/components/Protected";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Award, Calendar, Clock, Wallet, Timer, TrendingUp, Sparkles } from "lucide-react";
import { computeSession, formatDuration } from "@/lib/attendance";

export const Route = createFileRoute("/achievements")({
  component: () => (
    <Protected>
      <AchievementsPage />
    </Protected>
  ),
});

interface Stats {
  totalDays: number;
  totalHours: number;
  totalOvertime: number;
  totalPay: number;
  approvedLeaves: number;
  longestSession: number;
  thisMonthDays: number;
  thisMonthPay: number;
}

function AchievementsPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [name, setName] = useState("");
  const [dailyRate, setDailyRate] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [{ data: att }, { data: sal }, { data: prof }, { data: leaves }] = await Promise.all([
        supabase
          .from("attendance")
          .select("check_in, check_out")
          .eq("user_id", user.id)
          .not("check_out", "is", null),
        supabase.from("user_salary").select("daily_rate").eq("user_id", user.id).maybeSingle(),
        supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
        supabase
          .from("leave_requests")
          .select("id")
          .eq("user_id", user.id)
          .eq("status", "approved"),
      ]);

      const rate = Number(sal?.daily_rate ?? 0);
      setDailyRate(rate);
      setName(prof?.full_name ?? user.email ?? "مستخدم");

      let totalHours = 0,
        totalOvertime = 0,
        totalPay = 0,
        longestSession = 0,
        thisMonthDays = 0,
        thisMonthPay = 0;
      const days = new Set<string>();
      const monthDays = new Set<string>();

      (att ?? []).forEach((r: any) => {
        const c = computeSession(r.check_in, r.check_out, rate);
        totalHours += c.totalHours;
        totalOvertime += c.overtimeHours;
        totalPay += c.pay;
        if (c.totalHours > longestSession) longestSession = c.totalHours;
        const d = new Date(r.check_in).toDateString();
        days.add(d);
        if (new Date(r.check_in) >= monthStart) {
          monthDays.add(d);
          thisMonthPay += c.pay;
        }
      });
      thisMonthDays = monthDays.size;

      setStats({
        totalDays: days.size,
        totalHours,
        totalOvertime,
        totalPay,
        approvedLeaves: (leaves ?? []).length,
        longestSession,
        thisMonthDays,
        thisMonthPay,
      });
      setLoading(false);
    })();
  }, [user?.id]);

  if (loading) {
    return (
      <div className="text-center py-20 text-muted-foreground" dir="rtl">
        جارٍ التحميل...
      </div>
    );
  }
  if (!stats) return null;

  const badges = computeBadges(stats);

  return (
    <div className="space-y-6 max-w-6xl mx-auto" dir="rtl">
      <Card className="glass-card border-primary/20 overflow-hidden">
        <CardContent className="p-6 flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center shadow-luxe">
            <Award className="w-8 h-8 text-primary-foreground" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">سجل إنجازاتي</p>
            <h2 className="text-2xl font-bold">{name}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              اليومية: <span className="font-semibold text-primary">{dailyRate.toFixed(2)} ج</span>
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Calendar} label="إجمالي أيام العمل" value={stats.totalDays.toString()} />
        <StatCard icon={Clock} label="إجمالي الساعات" value={formatDuration(stats.totalHours)} />
        <StatCard
          icon={Timer}
          label="ساعات إضافية"
          value={formatDuration(stats.totalOvertime)}
          accent
        />
        <StatCard icon={Wallet} label="إجمالي المستحق" value={`${stats.totalPay.toFixed(0)} ج`} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              هذا الشهر
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row label="أيام العمل" value={`${stats.thisMonthDays} يوم`} />
            <Row label="المستحق" value={`${stats.thisMonthPay.toFixed(2)} ج`} accent />
            <Row label="إجازات موافق عليها" value={`${stats.approvedLeaves}`} />
            <Row
              label="أطول جلسة عمل"
              value={formatDuration(stats.longestSession)}
            />
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-warning" />
              الشارات
            </CardTitle>
          </CardHeader>
          <CardContent>
            {badges.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-6">
                ابدأ بتسجيل حضورك لتحصل على شارات
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {badges.map((b) => (
                  <Badge
                    key={b.label}
                    variant="outline"
                    className="gap-1 px-3 py-2 text-sm border-primary/30 bg-primary/10"
                  >
                    {b.emoji} {b.label}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: any;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? "glass-card border-warning/30" : "glass-card"}>
      <CardContent className="p-4">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${
            accent ? "bg-warning/20 text-warning" : "bg-primary/15 text-primary"
          }`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between p-2 rounded bg-muted/30">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`font-bold ${accent ? "text-primary" : ""}`}>{value}</span>
    </div>
  );
}

function computeBadges(s: Stats) {
  const out: { emoji: string; label: string }[] = [];
  if (s.totalDays >= 1) out.push({ emoji: "🎯", label: "أول يوم" });
  if (s.totalDays >= 7) out.push({ emoji: "📅", label: "أسبوع كامل" });
  if (s.totalDays >= 30) out.push({ emoji: "🏆", label: "شهر متواصل" });
  if (s.totalDays >= 100) out.push({ emoji: "💎", label: "100 يوم" });
  if (s.totalOvertime >= 10) out.push({ emoji: "⚡", label: "10 ساعات إضافية" });
  if (s.totalOvertime >= 50) out.push({ emoji: "🔥", label: "بطل الأوفر تايم" });
  if (s.longestSession >= 12) out.push({ emoji: "💪", label: "جلسة طويلة 12س+" });
  if (s.totalPay >= 1000) out.push({ emoji: "💰", label: "1000 جنيه" });
  if (s.totalPay >= 10000) out.push({ emoji: "👑", label: "10,000 جنيه" });
  return out;
}
