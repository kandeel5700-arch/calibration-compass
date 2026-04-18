import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Protected } from "@/components/Protected";
import { AppShell } from "@/components/AppShell";
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
import { LogIn, LogOut as LogOutIcon, Pencil, Save, ChevronRight, ChevronLeft, Clock, Wallet, Timer, Sparkles } from "lucide-react";
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
} from "@/lib/attendance";

export const Route = createFileRoute("/attendance")({
  component: () => (
    <Protected>
      <AppShell>
        <AttendancePage />
      </AppShell>
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
}
interface SalaryRow {
  user_id: string;
  daily_rate: number;
}

function AttendancePage() {
  const { user, isAdmin } = useAuth();
  const [weekRef, setWeekRef] = useState<Date>(new Date());
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [salaries, setSalaries] = useState<Record<string, number>>({});
  const [selectedUser, setSelectedUser] = useState<string>("me");
  const [loading, setLoading] = useState(true);
  const [openCheckIn, setOpenCheckIn] = useState<AttendanceRow | null>(null); // ongoing
  const [editing, setEditing] = useState<AttendanceRow | null>(null);
  const [now, setNow] = useState(Date.now());

  const wStart = useMemo(() => weekStart(weekRef), [weekRef]);
  const wEnd = useMemo(() => weekEnd(weekRef), [weekRef]);

  const myDailyRate = salaries[user?.id ?? ""] ?? 0;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function loadAll() {
    if (!user) return;
    setLoading(true);

    // Profiles & salaries (admin sees all; viewer only own)
    const [{ data: profs }, { data: sals }] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, email"),
      supabase.from("user_salary").select("user_id, daily_rate"),
    ]);
    const pMap: Record<string, ProfileRow> = {};
    (profs ?? []).forEach((p: any) => (pMap[p.user_id] = p));
    setProfiles(pMap);
    const sMap: Record<string, number> = {};
    (sals ?? []).forEach((s: any) => (sMap[s.user_id] = Number(s.daily_rate)));
    setSalaries(sMap);

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
    if (error) toast.error(error.message);
    else {
      toast.success("تم تسجيل الحضور ✓");
      loadAll();
    }
  }

  async function handleCheckOut() {
    if (!openCheckIn) return;
    const { error } = await supabase
      .from("attendance")
      .update({ check_out: new Date().toISOString() })
      .eq("id", openCheckIn.id);
    if (error) toast.error(error.message);
    else {
      toast.success("تم تسجيل الانصراف ✓");
      loadAll();
    }
  }

  // --- Compute totals for visible rows ---
  const totals = useMemo(() => {
    let regular = 0,
      overtime = 0,
      pay = 0;
    rows.forEach((r) => {
      const rate = salaries[r.user_id] ?? 0;
      const c = computeSession(r.check_in, r.check_out, rate);
      regular += c.regularHours;
      overtime += c.overtimeHours;
      pay += c.pay;
    });
    return { regular, overtime, pay };
  }, [rows, salaries]);

  // Live session timer
  const liveDuration = openCheckIn
    ? (now - new Date(openCheckIn.check_in).getTime()) / 3_600_000
    : 0;
  const liveComputed = openCheckIn
    ? computeSession(openCheckIn.check_in, new Date(now).toISOString(), myDailyRate)
    : null;

  const myName = profiles[user?.id ?? ""]?.full_name ?? user?.email ?? "مستخدم";

  return (
    <div className="space-y-6 max-w-7xl mx-auto" dir="rtl">
      {/* Hero - my info */}
      <Card className="glass-card overflow-hidden border-primary/20">
        <CardContent className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center shadow-luxe">
              <Sparkles className="w-7 h-7 text-primary-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">مرحباً</p>
              <h2 className="text-2xl font-bold">{myName}</h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="gap-1">
                  <Wallet className="w-3 h-3" />
                  اليومية: {myDailyRate.toFixed(2)} ج
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <Clock className="w-3 h-3" />
                  ساعة إضافية: {hourlyRate(myDailyRate).toFixed(2)} ج
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            {openCheckIn ? (
              <>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">جلسة نشطة منذ</p>
                  <p className="font-mono font-bold text-lg text-gradient-primary">
                    {formatTime(openCheckIn.check_in)}
                  </p>
                  <p className="text-sm font-semibold">
                    {formatDuration(liveDuration)} ·{" "}
                    <span className="text-primary">{liveComputed?.pay.toFixed(2)} ج</span>
                  </p>
                </div>
                <Button onClick={handleCheckOut} variant="destructive" className="gap-2">
                  <LogOutIcon className="w-4 h-4" />
                  تسجيل الانصراف
                </Button>
              </>
            ) : (
              <Button onClick={handleCheckIn} className="gap-2 gradient-primary shadow-luxe">
                <LogIn className="w-4 h-4" />
                تسجيل الحضور الآن
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Week navigation + admin filter */}
      <Card className="glass-card">
        <CardContent className="p-4 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                const d = new Date(weekRef);
                d.setDate(d.getDate() - 7);
                setWeekRef(d);
              }}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <div className="px-4 py-2 rounded-lg bg-muted text-sm font-semibold">
              الأسبوع: {formatRange(wStart, wEnd)}
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                const d = new Date(weekRef);
                d.setDate(d.getDate() + 7);
                setWeekRef(d);
              }}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setWeekRef(new Date())}>
              هذا الأسبوع
            </Button>
          </div>

          {isAdmin && (
            <div className="flex items-center gap-2">
              <Label className="text-xs">عرض المستخدم:</Label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="me">أنا</SelectItem>
                  {Object.values(profiles).map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id}>
                      {p.full_name || p.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatTile icon={Clock} label="ساعات عادية" value={formatDuration(totals.regular)} />
        <StatTile icon={Timer} label="ساعات إضافية" value={formatDuration(totals.overtime)} accent />
        <StatTile icon={Wallet} label="إجمالي المستحق" value={`${totals.pay.toFixed(2)} ج`} />
      </div>

      {/* Admin daily rate manager */}
      {isAdmin && <AdminSalaryPanel profiles={profiles} salaries={salaries} onSaved={loadAll} />}

      {/* Sessions list */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>سجل الجلسات</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-center py-8">جارٍ التحميل...</p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">لا توجد جلسات في هذا الأسبوع</p>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => {
                const rate = salaries[r.user_id] ?? 0;
                const c = computeSession(r.check_in, r.check_out, rate);
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
  accent,
}: {
  icon: any;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? "glass-card border-warning/30" : "glass-card"}>
      <CardContent className="p-4 flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            accent ? "bg-warning/20 text-warning" : "bg-primary/15 text-primary"
          }`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="font-bold text-lg">{value}</p>
        </div>
      </CardContent>
    </Card>
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
      toast.success("تم حفظ اليومية ✓");
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
          إدارة اليوميات (الأدمين فقط)
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
                <span className="text-xs text-muted-foreground">ج / يوم</span>
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
          ملاحظة: ساعة العمل العادية = اليومية ÷ {STANDARD_HOURS}. سعر الساعة الإضافية مساوٍ لسعر الساعة العادية.
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
