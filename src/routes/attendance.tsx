import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import { exportElementToPDF } from "@/lib/pdfExport";
import { Protected } from "@/components/Protected";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { LogIn, LogOut as LogOutIcon, Pencil, Save, ChevronRight, ChevronLeft, Clock, Wallet, Timer, Sparkles, Search, CalendarDays, TrendingUp, FileText, Fingerprint, Loader2, CheckCircle2, AlertCircle, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  STANDARD_HOURS,
  computeSession,
  formatDate,
  formatDuration,
  formatRange,
  formatTime,
  hourlyRate,
  toLocalDateTimeInput,
  weekEnd,
  weekStart,
  DEFAULT_SCHEDULE,
  DEFAULT_SETTINGS,
  payPeriod,
  loadAttendanceSettings,
  type AttendanceSettings,
  DAY_NAMES_AR,
  type ScheduleMap,
  type DayRule,
} from "@/lib/attendance";

export const Route = createFileRoute("/attendance")({
  component: () => (
    <Protected>
      <AttendancePage />
    </Protected>
  ),
});

interface AttendanceRow {
  id: string;
  user_id: string;
  check_in: string;
  check_out: string | null;
  notes: string | null;
}
interface ProfileRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url?: string | null;
}
interface SalaryRow {
  user_id: string;
  daily_rate: number;
}

export function AttendancePage() {
  const { user, isAdmin } = useAuth();
  const printRef = useRef<HTMLDivElement>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [weekRef, setWeekRef] = useState<Date>(new Date());
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [salaries, setSalaries] = useState<Record<string, number>>({});
  const [schedule, setSchedule] = useState<ScheduleMap>(DEFAULT_SCHEDULE);
  const [selectedUser, setSelectedUser] = useState<string>("me");
  const [loading, setLoading] = useState(true);
  const [openCheckIn, setOpenCheckIn] = useState<AttendanceRow | null>(null); // ongoing
  const [editing, setEditing] = useState<AttendanceRow | null>(null);
  const [now, setNow] = useState(Date.now());
  const [searchQuery, setSearchQuery] = useState("");
  const [dayFilter, setDayFilter] = useState<string>("");

  const [settings, setSettings] = useState<AttendanceSettings>(DEFAULT_SETTINGS);
  const period = useMemo(() => payPeriod(weekRef, settings), [weekRef, settings]);
  const wStart = period.start;
  const wEnd = period.end;

  const myDailyRate = salaries[user?.id ?? ""] ?? 0;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function loadAll() {
    if (!user) return;
    setLoading(true);

    // Profiles, salaries, work schedule
    const [{ data: profs }, { data: sals }, { data: sched }] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, email, avatar_url"),
      supabase.from("user_salary").select("user_id, daily_rate"),
      supabase.from("work_schedule").select("*"),
    ]);
    const pMap: Record<string, ProfileRow> = {};
    (profs ?? []).forEach((p: any) => (pMap[p.user_id] = p));
    setProfiles(pMap);
    const sMap: Record<string, number> = {};
    (sals ?? []).forEach((s: any) => (sMap[s.user_id] = Number(s.daily_rate)));
    setSalaries(sMap);
    const st = await loadAttendanceSettings(supabase);
    setSettings(st);
    if (sched && sched.length) {
      const map: ScheduleMap = { ...DEFAULT_SCHEDULE };
      (sched as any[]).forEach((r) => {
        map[r.day_of_week] = {
          day_of_week: r.day_of_week,
          start_hour: Number(r.start_hour),
          end_hour: Number(r.end_hour),
          standard_hours: Number(r.standard_hours),
          is_working_day: !!r.is_working_day,
        };
      });
      setSchedule(map);
    }

    // Attendance for the visible week
    const targetUser = isAdmin && selectedUser !== "me" && selectedUser !== "all" ? selectedUser : null;
    let q = supabase
      .from("attendance")
      .select("*")
      .gte("check_in", wStart.toISOString())
      .lte("check_in", wEnd.toISOString())
      .order("check_in", { ascending: false });
    if (!isAdmin) q = q.eq("user_id", user.id);
    else if (selectedUser === "me") q = q.eq("user_id", user.id);
    else if (targetUser) q = q.eq("user_id", targetUser);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setRows((data ?? []) as AttendanceRow[]);

    // Ongoing session (no check_out) for current user
    const { data: open } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", user.id)
      .is("check_out", null)
      .order("check_in", { ascending: false })
      .limit(1)
      .maybeSingle();
    setOpenCheckIn((open as AttendanceRow) ?? null);

    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isAdmin, selectedUser, weekRef]);

  async function handleCheckIn() {
    if (!user) return;
    if (openCheckIn) {
      toast.error("لديك جلسة مفتوحة بالفعل");
      return;
    }
    const { error } = await supabase
      .from("attendance")
      .insert({ user_id: user.id, check_in: new Date().toISOString() });
    if (error) { setActionError(true); toast.error(error.message); }
    else {
      toast.success("تم تسجيل الحضور ✓", { description: new Date().toLocaleTimeString("ar-EG") });
      await loadAll();
    }
  }

  async function handleCheckOut() {
    if (!openCheckIn) return;
    const { error } = await supabase
      .from("attendance")
      .update({ check_out: new Date().toISOString() })
      .eq("id", openCheckIn.id);
    if (error) { setActionError(true); toast.error(error.message); }
    else {
      toast.success("تم تسجيل الانصراف ✓", { description: new Date().toLocaleTimeString("ar-EG") });
      await loadAll();
    }
  }

  // Filter rows by search & day
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (dayFilter) {
        const d = new Date(r.check_in);
        const pad = (n: number) => String(n).padStart(2, "0");
        const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        if (key !== dayFilter) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const who = profiles[r.user_id];
        const hay = `${who?.full_name ?? ""} ${who?.email ?? ""} ${r.notes ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, searchQuery, dayFilter, profiles]);

  // --- Compute totals for visible (filtered) rows ---
  const totals = useMemo(() => {
    let regular = 0,
      overtime = 0,
      pay = 0;
    filteredRows.forEach((r) => {
      const rate = salaries[r.user_id] ?? 0;
      const c = computeSession(r.check_in, r.check_out, rate, schedule);
      regular += c.regularHours;
      overtime += c.overtimeHours;
      pay += c.pay;
    });
    const totalHrs = regular + overtime;
    return { regular, overtime, pay, totalHrs, sessions: filteredRows.length };
  }, [filteredRows, salaries, schedule]);

  // Live session timer
  const liveDuration = openCheckIn
    ? (now - new Date(openCheckIn.check_in).getTime()) / 3_600_000
    : 0;
  const liveComputed = openCheckIn
    ? computeSession(openCheckIn.check_in, new Date(now).toISOString(), myDailyRate, schedule)
    : null;

  const myName = profiles[user?.id ?? ""]?.full_name ?? user?.email ?? "مستخدم";

  async function handleExportPdf() {
    if (!printRef.current) return;
    setExportingPdf(true);
    try {
      await exportElementToPDF(
        printRef.current,
        `attendance-${new Date().toISOString().slice(0, 10)}.pdf`,
        { orientation: "portrait" }
      );
      toast.success("تم تصدير PDF بجودة عالية");
    } catch (e: any) {
      toast.error("فشل تصدير PDF", { description: e?.message });
    } finally {
      setExportingPdf(false);
    }
  }

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(false);
  const hour = new Date(now).getHours();
  const greeting = hour < 12 ? "صباح الخير" : "مساء الخير";
  const nowDate = new Date(now);
  const arDate = nowDate.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const arTime = nowDate.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
  const money = (n: number) => `${n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
  const myAvatar = profiles[user?.id ?? ""]?.avatar_url ?? null;

  // Today's completed session for current user (from real rows)
  const todayKey = new Date(now).toDateString();
  const todayDone = rows.find(
    (r) => r.user_id === user?.id && r.check_out && new Date(r.check_in).toDateString() === todayKey,
  );
  const statusState: "pending" | "in" | "done" | "error" = actionError
    ? "error"
    : openCheckIn
      ? "in"
      : todayDone
        ? "done"
        : "pending";

  async function onPress() {
    if (busy) return;
    setBusy(true);
    setActionError(false);
    try {
      if (openCheckIn) await handleCheckOut();
      else await handleCheckIn();
    } finally {
      setBusy(false);
    }
  }

  // Day strip for period (only when viewing one person)
  const viewingUserId = !isAdmin || selectedUser === "me" ? user?.id : selectedUser;
  const days = useMemo(() => {
    const out: { date: Date; status: "present" | "absent" | "rest" | "none" }[] = [];
    const d = new Date(wStart);
    d.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    while (d <= wEnd) {
      const has = rows.some((r) => r.user_id === viewingUserId && new Date(r.check_in).toDateString() === d.toDateString());
      const rule = schedule[d.getDay()];
      let status: "present" | "absent" | "rest" | "none" = "none";
      if (has) status = "present";
      else if (rule && !rule.is_working_day) status = "rest";
      else if (d < today) status = "absent";
      out.push({ date: new Date(d), status });
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [rows, wStart, wEnd, schedule, viewingUserId]);

  const DAY_STYLE = {
    present: { label: "حاضر", cls: "bg-success/15 text-success border-success/30" },
    absent: { label: "غائب", cls: "bg-destructive/10 text-destructive border-destructive/30" },
    rest: { label: "راحة", cls: "bg-muted text-muted-foreground border-border" },
    none: { label: "لم يُسجل", cls: "bg-card text-muted-foreground border-dashed border-border" },
  } as const;

  return (
    <div className="space-y-4 md:space-y-5 max-w-5xl mx-auto" dir="rtl">
      {/* Welcome card */}
      <section className="rounded-3xl border border-border bg-card shadow-card p-4 md:p-6 animate-fade-up">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="w-14 h-14 md:w-16 md:h-16 shrink-0 rounded-2xl overflow-hidden bg-primary/10 text-primary flex items-center justify-center ring-2 ring-primary/20">
            {myAvatar ? (
              <img src={myAvatar} alt={myName} className="w-full h-full object-cover" />
            ) : (
              <UserRound className="w-7 h-7" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-primary font-semibold flex items-center gap-1">
              <Sparkles className="w-4 h-4 shrink-0" /> {greeting}
            </p>
            <h2 className="text-xl md:text-2xl font-bold truncate">{myName}</h2>
            <p className="text-xs text-muted-foreground truncate">{arDate}</p>
          </div>
          <div className="hidden sm:block text-left shrink-0">
            <p className="font-mono text-2xl font-bold text-primary tabular-nums">{arTime}</p>
          </div>
        </div>
        <p className="sm:hidden mt-3 font-mono text-xl font-bold text-primary tabular-nums text-center rounded-xl bg-primary/5 py-2">{arTime}</p>
        <div className="grid grid-cols-2 gap-2 mt-4">
          <div className="rounded-2xl bg-primary/10 px-3 py-2 min-w-0">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Wallet className="w-3.5 h-3.5 shrink-0" /> الأجر اليومي</p>
            <p className="font-bold text-sm md:text-base truncate">{money(myDailyRate)}</p>
          </div>
          <div className="rounded-2xl bg-warning/10 px-3 py-2 min-w-0">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Timer className="w-3.5 h-3.5 shrink-0" /> سعر الساعة الإضافية</p>
            <p className="font-bold text-sm md:text-base truncate">{money(hourlyRate(myDailyRate))}</p>
          </div>
        </div>
      </section>

      {/* Main attendance action */}
      <section className="space-y-3">
        <button
          type="button"
          onClick={onPress}
          disabled={busy || loading}
          aria-busy={busy}
          className={cn(
            "w-full min-h-[88px] rounded-3xl px-5 py-4 flex items-center gap-4 text-right shadow-luxe transition-all duration-200 active:scale-[0.98] hover:brightness-105 disabled:opacity-60 disabled:cursor-not-allowed touch-manipulation",
            openCheckIn ? "bg-warning text-warning-foreground" : "bg-primary text-primary-foreground",
          )}
        >
          <span className="w-14 h-14 shrink-0 rounded-2xl bg-background/20 flex items-center justify-center">
            {busy ? (
              <Loader2 className="w-7 h-7 animate-spin" />
            ) : openCheckIn ? (
              <LogOutIcon className="w-7 h-7" />
            ) : (
              <Fingerprint className="w-8 h-8" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xl font-bold">{openCheckIn ? "تسجيل الانصراف" : "تسجيل الحضور"}</span>
            <span className="block text-sm opacity-90 truncate">
              {openCheckIn
                ? `حضرت الساعة ${formatTime(openCheckIn.check_in)} · لا تنسَ تسجيل انصرافك`
                : "ابدأ يوم عملك"}
            </span>
          </span>
        </button>

        {/* Status panel */}
        <div
          className={cn(
            "rounded-2xl border px-4 py-3 flex items-center gap-3",
            statusState === "pending" && "bg-muted/50 border-border text-muted-foreground",
            statusState === "in" && "bg-success/10 border-success/30 text-success",
            statusState === "done" && "bg-primary/10 border-primary/30 text-primary",
            statusState === "error" && "bg-destructive/10 border-destructive/30 text-destructive",
          )}
          role="status"
        >
          {statusState === "error" ? <AlertCircle className="w-5 h-5 shrink-0" /> : statusState === "pending" ? <Clock className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm">
              {statusState === "pending" && "لم يتم تسجيل الحضور"}
              {statusState === "in" && "تم تسجيل الحضور"}
              {statusState === "done" && "تم تسجيل الانصراف"}
              {statusState === "error" && "يوجد خطأ في تسجيل البصمة"}
            </p>
            {statusState === "in" && openCheckIn && (
              <p className="text-xs text-foreground/80">
                الحضور {formatTime(openCheckIn.check_in)} · المدة {formatDuration(liveDuration)} · {money(liveComputed?.pay ?? 0)}
              </p>
            )}
            {statusState === "done" && todayDone && (
              <p className="text-xs text-foreground/80">
                الحضور {formatTime(todayDone.check_in)} · الانصراف {formatTime(todayDone.check_out!)}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Period summary */}
      <section className="rounded-3xl border border-border bg-card shadow-card p-4 md:p-5 space-y-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <h3 className="font-bold flex items-center gap-2 min-w-0"><CalendarDays className="w-5 h-5 text-primary shrink-0" /><span className="truncate">ملخص الحضور</span></h3>
          <Button variant="ghost" size="sm" onClick={() => setWeekRef(new Date())}>الفترة الحالية</Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-12 w-12 shrink-0 rounded-xl" aria-label="الفترة السابقة"
            onClick={() => { const d = new Date(wStart); d.setDate(d.getDate() - 1); setWeekRef(d); }}>
            <ChevronRight className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0 h-12 rounded-xl bg-muted flex items-center justify-center text-sm font-semibold px-2 text-center">
            <span className="truncate">{formatRange(wStart, wEnd)}</span>
          </div>
          <Button variant="outline" size="icon" className="h-12 w-12 shrink-0 rounded-xl" aria-label="الفترة التالية"
            onClick={() => { const d = new Date(wEnd); d.setDate(d.getDate() + 1); setWeekRef(d); }}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </div>
        {isAdmin && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">عرض الموظف</Label>
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="me">أنا</SelectItem>
                {Object.values(profiles).map((p) => (
                  <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {loading ? (
          <div className="grid grid-cols-7 gap-1.5">{Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />)}</div>
        ) : (
          <div className="grid grid-cols-5 sm:grid-cols-8 gap-1.5">
            {days.map((d) => {
              const s = DAY_STYLE[d.status];
              return (
                <div key={d.date.toISOString()} className={cn("rounded-xl border px-1 py-1.5 text-center min-w-0", s.cls)} title={s.label}>
                  <p className="text-[10px] truncate">{DAY_NAMES_AR[d.date.getDay()]}</p>
                  <p className="font-bold text-sm">{d.date.getDate().toLocaleString("ar-EG")}</p>
                  <p className="text-[9px] truncate">{s.label}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile loading={loading} icon={Clock} label="الساعات العادية" value={formatDuration(totals.regular)} tone="primary" />
        <StatTile loading={loading} icon={Timer} label="الساعات الإضافية" value={formatDuration(totals.overtime)} tone="warning" />
        <StatTile loading={loading} icon={TrendingUp} label="إجمالي الساعات" value={formatDuration(totals.totalHrs)} tone="success" />
        <StatTile loading={loading} icon={Wallet} label="إجمالي المستحقات" value={money(totals.pay)} tone="accent" />
      </div>

      {/* Admin daily rate manager */}
      {/* schedule editing moved to /attendance-settings */}
      {isAdmin && <AdminSalaryPanel profiles={profiles} salaries={salaries} onSaved={loadAll} />}

      {/* Filter & Search */}
      <Card className="glass-card">
        <CardContent className="p-4 grid gap-3 md:grid-cols-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="ابحث بالاسم أو الملاحظات..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-9"
            />
          </div>
          <div className="relative">
            <CalendarDays className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              type="date"
              value={dayFilter}
              onChange={(e) => setDayFilter(e.target.value)}
              className="pr-9"
              min={toLocalDateTimeInput(wStart.toISOString()).slice(0, 10)}
              max={toLocalDateTimeInput(wEnd.toISOString()).slice(0, 10)}
            />
            {(dayFilter || searchQuery) && (
              <Button
                size="sm"
                variant="ghost"
                className="absolute left-1 top-1/2 -translate-y-1/2 h-7 text-xs"
                onClick={() => {
                  setDayFilter("");
                  setSearchQuery("");
                }}
              >
                مسح
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Attendance rules */}
      <Card className="glass-card border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="w-5 h-5 text-primary" />
            قوانين الحضور والانصراف
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm leading-relaxed list-disc pr-5 marker:text-primary">
            <li>يوم العمل = <strong>8 ساعات</strong> (حسب ساعات كل يوم المحددة من الإدارة)، والوقت قبل بداية اليوم لا يُحتسب.</li>
            <li>الأوفر تايم: أول <strong>{settings.overtime_first_minutes} دقيقة</strong> لا تُحسب إلا بعد إكمالها، وبعدها يُحسب كل <strong>{settings.overtime_step_minutes} دقيقة كاملة</strong> فقط.</li>
            <li>مثال: حضور 8 ص وانصراف 5:29 م = ساعة إضافية واحدة، وانصراف 5:30 م = ساعة ونص.</li>
            <li>سعر الساعة = الأجر اليومي ÷ ساعات اليوم، والساعة الإضافية بنفس السعر.</li>
            <li>فترة الحساب كل 15 يوم: من يوم <strong>{settings.period_start_day_1}</strong> إلى يوم <strong>{settings.period_start_day_2 - 1}</strong>، ومن يوم <strong>{settings.period_start_day_2}</strong> إلى يوم <strong>{settings.period_start_day_1 - 1}</strong> من الشهر التالي.</li>
          </ul>
        </CardContent>
      </Card>

      {/* Sessions list (wrapped in printRef for PDF export) */}
      <div ref={printRef} className="bg-background space-y-3 p-2 rounded-2xl">
        <div className="flex items-center justify-between px-2">
          <div>
            <h2 className="font-bold text-lg">UECC — تقرير الحضور</h2>
            <p className="text-xs text-muted-foreground">
              {formatRange(wStart, wEnd)} · {totals.sessions} جلسة
            </p>
          </div>
          <Button onClick={handleExportPdf} variant="outline" size="sm" className="gap-2 print:hidden" disabled={exportingPdf || filteredRows.length === 0}>
            <FileText className="w-4 h-4" /> {exportingPdf ? "جارٍ..." : "تصدير PDF"}
          </Button>
        </div>
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>سجل الجلسات</span>
            <Badge variant="outline">{totals.sessions} جلسة</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-center py-8">جارٍ التحميل...</p>
          ) : filteredRows.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {rows.length === 0 ? "لا توجد جلسات في هذا الأسبوع" : "لا توجد نتائج مطابقة للفلتر"}
            </p>
          ) : (
            <div className="space-y-2">
              {filteredRows.map((r) => {
                const rate = salaries[r.user_id] ?? 0;
                const c = computeSession(r.check_in, r.check_out, rate, schedule);
                const who = profiles[r.user_id];
                return (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-lg border border-border bg-card/40 hover:bg-card/70 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{formatDate(r.check_in)}</span>
                        {isAdmin && who && (
                          <Badge variant="outline" className="text-[10px]">
                            {who.full_name || who.email}
                          </Badge>
                        )}
                        {!r.check_out && (
                          <Badge className="bg-success text-success-foreground animate-pulse">جارية</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {formatTime(r.check_in)} →{" "}
                        {r.check_out ? formatTime(r.check_out) : "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">المدة</p>
                        <p className="font-mono font-semibold">{formatDuration(c.totalHours)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">إضافي</p>
                        <p className="font-mono font-semibold text-warning">
                          {formatDuration(c.overtimeHours)}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">المستحق</p>
                        <p className="font-mono font-bold text-primary">{c.pay.toFixed(2)}</p>
                      </div>
                      {isAdmin && (
                        <Button size="icon" variant="ghost" onClick={() => setEditing(r)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      </div>

      {editing && (
        <EditSessionDialog
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            loadAll();
          }}
        />
      )}
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  tone = "primary",
  loading,
}: {
  icon: any;
  label: string;
  value: string;
  tone?: "primary" | "warning" | "success" | "accent";
  loading?: boolean;
}) {
  const toneCls = {
    primary: "bg-primary/15 text-primary",
    warning: "bg-warning/15 text-warning",
    success: "bg-success/15 text-success",
    accent: "bg-accent text-accent-foreground",
  }[tone];
  return (
    <div className="rounded-2xl border border-border bg-card shadow-card p-3 md:p-4 min-h-[96px] flex flex-col justify-between gap-2 transition-transform hover:-translate-y-0.5 min-w-0">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${toneCls}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] md:text-xs text-muted-foreground truncate">{label}</p>
        {loading ? (
          <div className="h-6 mt-1 w-3/4 rounded bg-muted animate-pulse" />
        ) : (
          <p className="font-bold text-base md:text-xl truncate tabular-nums">{value}</p>
        )}
      </div>
    </div>
  );
}

function AdminSalaryPanel({
  profiles,
  salaries,
  onSaved,
}: {
  profiles: Record<string, ProfileRow>;
  salaries: Record<string, number>;
  onSaved: () => void;
}) {
  const [edits, setEdits] = useState<Record<string, string>>({});

  async function save(uid: string) {
    const val = parseFloat(edits[uid] ?? "");
    if (Number.isNaN(val) || val < 0) {
      toast.error("قيمة غير صالحة");
      return;
    }
    const { error } = await supabase
      .from("user_salary")
      .upsert({ user_id: uid, daily_rate: val }, { onConflict: "user_id" });
    if (error) toast.error(error.message);
    else {
      toast.success("تم حفظ الأجر اليومي ✓");
      setEdits((e) => {
        const n = { ...e };
        delete n[uid];
        return n;
      });
      onSaved();
    }
  }

  return (
    <Card className="glass-card border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-primary" />
          إدارة الأجر اليومي (الأدمين فقط)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 md:grid-cols-2">
          {Object.values(profiles).map((p) => {
            const current = salaries[p.user_id] ?? 0;
            const editVal = edits[p.user_id];
            const isEditing = editVal !== undefined;
            return (
              <div
                key={p.user_id}
                className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card/40"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{p.full_name || p.email}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{p.email}</p>
                </div>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-28"
                  placeholder="0.00"
                  value={isEditing ? editVal : current}
                  onChange={(e) =>
                    setEdits((prev) => ({ ...prev, [p.user_id]: e.target.value }))
                  }
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">ج / يوم</span>
                <Button
                  size="icon"
                  variant={isEditing ? "default" : "outline"}
                  onClick={() => save(p.user_id)}
                  disabled={!isEditing}
                >
                  <Save className="w-4 h-4" />
                </Button>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          ملاحظة: ساعة العمل العادية = الأجر اليومي ÷ {STANDARD_HOURS}. سعر الساعة الإضافية مساوٍ لسعر الساعة العادية.
        </p>
      </CardContent>
    </Card>
  );
}

function EditSessionDialog({
  row,
  onClose,
  onSaved,
}: {
  row: AttendanceRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [checkIn, setCheckIn] = useState(toLocalDateTimeInput(row.check_in));
  const [checkOut, setCheckOut] = useState(toLocalDateTimeInput(row.check_out));
  const [notes, setNotes] = useState(row.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const payload: any = {
      check_in: new Date(checkIn).toISOString(),
      check_out: checkOut ? new Date(checkOut).toISOString() : null,
      notes: notes || null,
    };
    const { error } = await supabase.from("attendance").update(payload).eq("id", row.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("تم التحديث ✓");
      onSaved();
    }
  }

  async function remove() {
    if (!confirm("حذف هذه الجلسة نهائياً؟")) return;
    const { error } = await supabase.from("attendance").delete().eq("id", row.id);
    if (error) toast.error(error.message);
    else {
      toast.success("تم الحذف");
      onSaved();
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>تعديل جلسة الحضور</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>وقت الحضور</Label>
            <Input type="datetime-local" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
          </div>
          <div>
            <Label>وقت الانصراف</Label>
            <Input
              type="datetime-local"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
            />
          </div>
          <div>
            <Label>ملاحظات</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="destructive" onClick={remove}>
            حذف
          </Button>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "جارٍ الحفظ..." : "حفظ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AdminSchedulePanel({
  schedule,
  onSaved,
}: {
  schedule: ScheduleMap;
  onSaved: () => void;
}) {
  const [drafts, setDrafts] = useState<ScheduleMap>(schedule);
  const [savingDay, setSavingDay] = useState<number | null>(null);

  useEffect(() => {
    setDrafts(schedule);
  }, [schedule]);

  function update(day: number, patch: Partial<DayRule>) {
    setDrafts((prev) => ({
      ...prev,
      [day]: { ...prev[day], ...patch },
    }));
  }

  // Convert "HH:MM" string <-> decimal hour
  function hourToTime(h: number) {
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }
  function timeToHour(t: string) {
    const [hh, mm] = t.split(":").map(Number);
    return (hh || 0) + (mm || 0) / 60;
  }

  async function saveDay(day: number) {
    const r = drafts[day];
    if (!r) return;
    if (r.end_hour <= r.start_hour) {
      toast.error("ساعة الانصراف يجب أن تكون بعد ساعة الحضور");
      return;
    }
    if (r.standard_hours < 0 || r.standard_hours > 24) {
      toast.error("عدد الساعات الأساسية غير صالح");
      return;
    }
    setSavingDay(day);
    const { error } = await supabase
      .from("work_schedule")
      .upsert(
        {
          day_of_week: day,
          start_hour: r.start_hour,
          end_hour: r.end_hour,
          standard_hours: r.standard_hours,
          is_working_day: r.is_working_day,
        },
        { onConflict: "day_of_week" },
      );
    setSavingDay(null);
    if (error) toast.error(error.message);
    else {
      toast.success(`تم حفظ ${DAY_NAMES_AR[day]} ✓`);
      onSaved();
    }
  }

  // Display order: start week from Saturday (6), then Sun..Fri
  const order = [6, 0, 1, 2, 3, 4, 5];

  return (
    <Card className="glass-card border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          إدارة ساعات العمل الأسبوعية (الأدمين فقط)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2">
          {order.map((day) => {
            const r = drafts[day] ?? DEFAULT_SCHEDULE[day];
            const original = schedule[day] ?? DEFAULT_SCHEDULE[day];
            const dirty =
              r.start_hour !== original.start_hour ||
              r.end_hour !== original.end_hour ||
              r.standard_hours !== original.standard_hours ||
              r.is_working_day !== original.is_working_day;
            return (
              <div
                key={day}
                className="p-3 rounded-lg border border-border bg-card/40 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{DAY_NAMES_AR[day]}</span>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={r.is_working_day}
                      onChange={(e) => update(day, { is_working_day: e.target.checked })}
                    />
                    يوم عمل
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[11px]">من</Label>
                    <Input
                      type="time"
                      value={hourToTime(r.start_hour)}
                      onChange={(e) => update(day, { start_hour: timeToHour(e.target.value) })}
                      disabled={!r.is_working_day}
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">إلى</Label>
                    <Input
                      type="time"
                      value={hourToTime(r.end_hour)}
                      onChange={(e) => update(day, { end_hour: timeToHour(e.target.value) })}
                      disabled={!r.is_working_day}
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">ساعات أساسية</Label>
                    <Input
                      type="number"
                      step="0.5"
                      min="0"
                      max="24"
                      value={r.standard_hours}
                      onChange={(e) =>
                        update(day, { standard_hours: parseFloat(e.target.value) || 0 })
                      }
                      disabled={!r.is_working_day}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-muted-foreground">
                    {r.is_working_day
                      ? `الأوفر تايم بعد ${r.standard_hours} ساعة`
                      : "إجازة"}
                  </span>
                  <Button
                    size="sm"
                    variant={dirty ? "default" : "outline"}
                    onClick={() => saveDay(day)}
                    disabled={!dirty || savingDay === day}
                    className="gap-1"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {savingDay === day ? "جارٍ..." : "حفظ"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          ملاحظة: أي وقت قبل ساعة "من" لا يُحتسب. إكمال الساعات الأساسية = يوم كامل بأجر يومي. الأوفر تايم يُحتسب بعد ذلك بسعر الساعة (الأجر اليومي ÷ الساعات الأساسية).
        </p>
      </CardContent>
    </Card>
  );
}
