import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Protected } from "@/components/Protected";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Settings, Timer, CalendarRange } from "lucide-react";
import {
  DEFAULT_SCHEDULE,
  DEFAULT_SETTINGS,
  loadAttendanceSettings,
  type AttendanceSettings,
  type ScheduleMap,
} from "@/lib/attendance";
import { AdminSchedulePanel } from "./attendance";

export const Route = createFileRoute("/attendance-settings")({
  head: () => ({
    meta: [
      { title: "إعدادات الحضور — UECC" },
      { name: "description", content: "إدارة قوانين الحضور والأوفر تايم وفترات الحساب" },
      { property: "og:title", content: "إعدادات الحضور — UECC" },
      { property: "og:description", content: "إدارة قوانين الحضور والأوفر تايم وفترات الحساب" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <Protected adminOnly>
      <SettingsPage />
    </Protected>
  ),
});

function SettingsPage() {
  const { user } = useAuth();
  const [s, setS] = useState<AttendanceSettings>(DEFAULT_SETTINGS);
  const [schedule, setSchedule] = useState<ScheduleMap>(DEFAULT_SCHEDULE);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    const st = await loadAttendanceSettings(supabase);
    setS(st);
    const { data } = await supabase.from("work_schedule").select("*");
    const map: ScheduleMap = { ...DEFAULT_SCHEDULE };
    (data ?? []).forEach((r: any) => {
      map[r.day_of_week] = {
        day_of_week: r.day_of_week,
        start_hour: Number(r.start_hour),
        end_hour: Number(r.end_hour),
        standard_hours: Number(r.standard_hours),
        is_working_day: !!r.is_working_day,
      };
    });
    setSchedule(map);
    setReady(true);
  }
  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (
      s.period_mode === "semimonthly" &&
      (s.period_start_day_1 < 1 || s.period_start_day_2 > 28 || s.period_start_day_1 >= s.period_start_day_2)
    ) {
      toast.error("أيام بداية الفترات يجب أن تكون بين 1 و 28 والأولى أصغر من الثانية");
      return;
    }
    if (s.overtime_step_minutes < 1) return toast.error("مدة الخطوة يجب أن تكون دقيقة على الأقل");
    setSaving(true);
    const { error } = await supabase
      .from("attendance_settings")
      .upsert({ id: 1, ...s, updated_by: user?.id, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("تم حفظ الإعدادات ✓");
  }

  const num = (k: keyof AttendanceSettings) => ({
    type: "number" as const,
    value: s[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: Number(e.target.value) }),
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto" dir="rtl">
      <Card className="glass-card border-primary/20">
        <CardContent className="p-6 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center shadow-luxe">
            <Settings className="w-7 h-7 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">إعدادات الحضور</h1>
            <p className="text-sm text-muted-foreground mt-1">قوانين الأوفر تايم وفترات الحساب وساعات العمل</p>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Timer className="w-5 h-5 text-primary" /> قوانين الأوفر تايم
          </CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>أول فترة أوفر تايم (دقيقة)</Label>
            <Input {...num("overtime_first_minutes")} min={0} />
            <p className="text-xs text-muted-foreground mt-1">لا يُحسب أي أوفر تايم قبل إكمالها</p>
          </div>
          <div>
            <Label>بعدها يُحسب كل (دقيقة)</Label>
            <Input {...num("overtime_step_minutes")} min={1} />
            <p className="text-xs text-muted-foreground mt-1">تُحسب الفترات الكاملة فقط</p>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarRange className="w-5 h-5 text-primary" /> فترات الحساب
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setS({ ...s, period_mode: "semimonthly" })}
              className={`rounded-xl border p-3 text-sm font-semibold transition-all ${
                s.period_mode === "semimonthly"
                  ? "border-primary bg-primary/10 text-primary shadow-luxe"
                  : "border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              كل 15 يوم
            </button>
            <button
              type="button"
              onClick={() => setS({ ...s, period_mode: "weekly" })}
              className={`rounded-xl border p-3 text-sm font-semibold transition-all ${
                s.period_mode === "weekly"
                  ? "border-primary bg-primary/10 text-primary shadow-luxe"
                  : "border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              كل أسبوع (السبت → الجمعة)
            </button>
          </div>
          {s.period_mode === "semimonthly" ? (
            <>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>بداية الفترة الأولى (يوم)</Label>
                  <Input {...num("period_start_day_1")} min={1} max={28} />
                </div>
                <div>
                  <Label>بداية الفترة الثانية (يوم)</Label>
                  <Input {...num("period_start_day_2")} min={1} max={28} />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                الفترة 1: من يوم {s.period_start_day_1} إلى يوم {s.period_start_day_2 - 1} · الفترة 2: من يوم{" "}
                {s.period_start_day_2} إلى يوم {s.period_start_day_1 - 1} من الشهر التالي
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              الحساب أسبوعي: كل فترة تبدأ يوم السبت وتنتهي يوم الجمعة
            </p>
          )}
          <Button onClick={save} disabled={saving} className="gradient-primary">
            {saving ? "جارٍ الحفظ..." : "حفظ الإعدادات"}
          </Button>
        </CardContent>
      </Card>

      {ready && <AdminSchedulePanel schedule={schedule} onSaved={load} />}
    </div>
  );
}
