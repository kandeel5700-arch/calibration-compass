import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Protected } from "@/components/Protected";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Sparkles, FileSpreadsheet, FileDown, Loader2, BrainCircuit } from "lucide-react";
import {
  DEFAULT_SCHEDULE,
  DAY_NAMES_AR,
  computeSession,
  formatDuration,
  loadAttendanceSettings,
  payPeriod,
  type ScheduleMap,
} from "@/lib/attendance";
import { exportElementToPDF } from "@/lib/pdfExport";
import { analyzeAttendance } from "@/lib/attendanceAi.functions";

export const Route = createFileRoute("/attendance-insights")({
  head: () => ({
    meta: [
      { title: "تحليل وتصدير الحضور — UECC" },
      { name: "description", content: "تحليل ذكي لأنماط الحضور وتصدير السجلات إلى Excel وPDF" },
      { property: "og:title", content: "تحليل وتصدير الحضور — UECC" },
      { property: "og:description", content: "تحليل ذكي لأنماط الحضور وتصدير السجلات إلى Excel وPDF" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <Protected>
      <InsightsPage />
    </Protected>
  ),
});

type Profile = { user_id: string; full_name: string | null; email: string | null };
type Row = { id: string; user_id: string; check_in: string; check_out: string | null };

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtT = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—";

function InsightsPage() {
  const { isAdmin } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [salaries, setSalaries] = useState<Record<string, number>>({});
  const [schedule, setSchedule] = useState<ScheduleMap>(DEFAULT_SCHEDULE);
  const [employee, setEmployee] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const s = await loadAttendanceSettings(supabase);
      const p = payPeriod(new Date(), s);
      setFrom(ymd(p.start));
      setTo(ymd(p.end));
      const [pr, sa, ws] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, email"),
        supabase.from("user_salary").select("user_id, daily_rate"),
        supabase.from("work_schedule").select("*"),
      ]);
      setProfiles((pr.data as Profile[]) ?? []);
      const m: Record<string, number> = {};
      (sa.data ?? []).forEach((r: any) => (m[r.user_id] = Number(r.daily_rate) || 0));
      setSalaries(m);
      if (ws.data?.length) {
        const sm: ScheduleMap = { ...DEFAULT_SCHEDULE };
        ws.data.forEach((r: any) => (sm[r.day_of_week] = r));
        setSchedule(sm);
      }
    })();
  }, []);

  useEffect(() => {
    if (!from || !to) return;
    setLoading(true);
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T23:59:59`);
    let q = supabase
      .from("attendance")
      .select("id, user_id, check_in, check_out")
      .gte("check_in", start.toISOString())
      .lte("check_in", end.toISOString())
      .order("check_in");
    if (employee !== "all") q = q.eq("user_id", employee);
    q.then(({ data, error }) => {
      if (error) toast.error(error.message);
      setRows((data as Row[]) ?? []);
      setLoading(false);
    });
  }, [from, to, employee]);

  const nameOf = (id: string) => {
    const p = profiles.find((x) => x.user_id === id);
    return p?.full_name || p?.email || "—";
  };

  const detailed = useMemo(
    () =>
      rows.map((r) => {
        const c = computeSession(r.check_in, r.check_out, salaries[r.user_id] ?? 0, schedule);
        const d = new Date(r.check_in);
        return { ...r, ...c, date: ymd(d), dayName: DAY_NAMES_AR[d.getDay()], name: nameOf(r.user_id) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, salaries, schedule, profiles],
  );

  const perEmployee = useMemo(() => {
    const m = new Map<string, { name: string; days: Set<string>; hours: number; ot: number; pay: number }>();
    detailed.forEach((r) => {
      const e = m.get(r.user_id) ?? { name: r.name, days: new Set(), hours: 0, ot: 0, pay: 0 };
      e.days.add(r.date);
      e.hours += r.totalHours;
      e.ot += r.overtimeHours;
      e.pay += r.pay;
      m.set(r.user_id, e);
    });
    return Array.from(m.values());
  }, [detailed]);

  const totals = perEmployee.reduce(
    (a, e) => ({ hours: a.hours + e.hours, ot: a.ot + e.ot, pay: a.pay + e.pay }),
    { hours: 0, ot: 0, pay: 0 },
  );

  const periodLabel = `${from} → ${to}`;

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const summary = perEmployee.map((e) => ({
      "الموظف": e.name,
      "أيام الحضور": e.days.size,
      "ساعات العمل": +e.hours.toFixed(2),
      "الساعات الإضافية": +e.ot.toFixed(2),
      "المستحقات": +e.pay.toFixed(2),
    }));
    summary.push({ "الموظف": "الإجمالي", "أيام الحضور": 0, "ساعات العمل": +totals.hours.toFixed(2), "الساعات الإضافية": +totals.ot.toFixed(2), "المستحقات": +totals.pay.toFixed(2) });
    const s1 = XLSX.utils.json_to_sheet(summary);
    s1["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 14 }];
    const s2 = XLSX.utils.json_to_sheet(
      detailed.map((r) => ({
        "الموظف": r.name,
        "التاريخ": r.date,
        "اليوم": r.dayName,
        "الحضور": fmtT(r.check_in),
        "الانصراف": fmtT(r.check_out),
        "ساعات العمل": +r.totalHours.toFixed(2),
        "الإضافي": +r.overtimeHours.toFixed(2),
        "المستحقات": +r.pay.toFixed(2),
      })),
    );
    s2["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 }];
    wb.Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, s1, "ملخص الموظفين");
    XLSX.utils.book_append_sheet(wb, s2, "السجلات التفصيلية");
    XLSX.writeFile(wb, `attendance-${from}_${to}.xlsx`);
  };

  const exportPdf = async () => {
    if (!pdfRef.current) return;
    try {
      await exportElementToPDF(pdfRef.current, `attendance-${from}_${to}.pdf`);
    } catch (e: any) {
      toast.error(e?.message ?? "فشل تصدير PDF");
    }
  };

  const runAi = async () => {
    if (employee === "all") return toast.error("اختر موظفًا واحدًا للتحليل");
    if (!detailed.length) return toast.error("لا توجد سجلات في هذه الفترة");
    setAiLoading(true);
    setAiText("");
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s.session?.access_token;
      if (!token) throw new Error("انتهت الجلسة، سجّل الدخول مجددًا");
      const records = detailed
        .map((r) => {
          const rule = schedule[new Date(r.check_in).getDay()];
          return `${r.date} | ${r.dayName} | ${rule?.is_working_day ? `${rule.start_hour}:00` : "عطلة"} | ${fmtT(r.check_in)} | ${fmtT(r.check_out)} | ${r.totalHours.toFixed(2)} | ${r.overtimeHours.toFixed(2)}`;
        })
        .join("\n");
      const res = await analyzeAttendance({ data: { accessToken: token, employeeName: nameOf(employee), periodLabel, records } });
      if (!res.ok) throw new Error(res.error);
      setAiText(res.text);
    } catch (e: any) {
      toast.error(e?.message ?? "فشل التحليل");
    } finally {
      setAiLoading(false);
    }
  };

  if (!isAdmin) {
    return <div className="p-8 text-center text-muted-foreground">هذه الصفحة متاحة للمدير فقط.</div>;
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex items-center gap-3">
        <div className="size-11 rounded-xl bg-primary/15 text-primary grid place-items-center"><BrainCircuit className="size-6" /></div>
        <div>
          <h1 className="text-2xl font-bold">تحليل وتصدير الحضور</h1>
          <p className="text-sm text-muted-foreground">اختر الموظف والفترة، ثم صدّر التقرير أو اطلب تحليلًا ذكيًا.</p>
        </div>
      </header>

      <Card className="glass-card">
        <CardContent className="pt-6 grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>الموظف</Label>
            <Select value={employee} onValueChange={(v) => { setEmployee(v); setAiText(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الموظفين</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>من</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-2"><Label>إلى</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="sm:col-span-3 flex flex-wrap gap-2">
            <Button onClick={exportExcel} variant="outline" disabled={!detailed.length}><FileSpreadsheet className="size-4" />تصدير Excel</Button>
            <Button onClick={exportPdf} variant="outline" disabled={!detailed.length}><FileDown className="size-4" />تصدير PDF</Button>
            <Button onClick={runAi} disabled={aiLoading || employee === "all"}>
              {aiLoading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              تحليل ذكي للحضور
            </Button>
            {employee === "all" && <span className="text-xs text-muted-foreground self-center">التحليل الذكي يتطلب اختيار موظف واحد</span>}
          </div>
        </CardContent>
      </Card>

      {(aiLoading || aiText) && (
        <Card className="border-primary/40">
          <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="size-5 text-primary" />نتيجة التحليل الذكي</CardTitle></CardHeader>
          <CardContent>
            {aiLoading ? (
              <p className="text-muted-foreground flex items-center gap-2"><Loader2 className="size-4 animate-spin" />جاري تحليل السجلات…</p>
            ) : (
              <MiniMarkdown text={aiText} />
            )}
          </CardContent>
        </Card>
      )}

      <div ref={pdfRef} className="space-y-4 bg-background p-4 rounded-xl">
        <div>
          <h2 className="text-xl font-bold">تقرير الحضور والانصراف — UECC Survey</h2>
          <p className="text-sm text-muted-foreground">الفترة: {periodLabel} · {employee === "all" ? "كل الموظفين" : nameOf(employee)}</p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="ساعات العمل" value={formatDuration(totals.hours)} />
          <Stat label="الساعات الإضافية" value={formatDuration(totals.ot)} />
          <Stat label="المستحقات" value={totals.pay.toFixed(2)} />
        </div>
        <Card>
          <CardHeader><CardTitle className="text-base">ملخص الموظفين</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground"><tr className="border-b border-border">
                <th className="text-start p-2">الموظف</th><th className="p-2">أيام</th><th className="p-2">الساعات</th><th className="p-2">الإضافي</th><th className="p-2">المستحقات</th>
              </tr></thead>
              <tbody>
                {perEmployee.map((e) => (
                  <tr key={e.name} className="border-b border-border/50 text-center">
                    <td className="text-start p-2 font-medium">{e.name}</td><td className="p-2">{e.days.size}</td>
                    <td className="p-2">{formatDuration(e.hours)}</td><td className="p-2">{formatDuration(e.ot)}</td><td className="p-2 text-primary font-semibold">{e.pay.toFixed(2)}</td>
                  </tr>
                ))}
                {!perEmployee.length && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">{loading ? "جاري التحميل…" : "لا توجد سجلات"}</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">السجلات التفصيلية</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground"><tr className="border-b border-border">
                <th className="text-start p-2">الموظف</th><th className="p-2">التاريخ</th><th className="p-2">الحضور</th><th className="p-2">الانصراف</th><th className="p-2">الساعات</th><th className="p-2">الإضافي</th><th className="p-2">المستحقات</th>
              </tr></thead>
              <tbody>
                {detailed.map((r) => (
                  <tr key={r.id} className="border-b border-border/50 text-center">
                    <td className="text-start p-2">{r.name}</td><td className="p-2">{r.dayName} {r.date}</td>
                    <td className="p-2">{fmtT(r.check_in)}</td><td className="p-2">{fmtT(r.check_out)}</td>
                    <td className="p-2">{formatDuration(r.totalHours)}</td><td className="p-2">{formatDuration(r.overtimeHours)}</td><td className="p-2">{r.pay.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}

function MiniMarkdown({ text }: { text: string }) {
  return (
    <div className="space-y-2 leading-7">
      {text.split("\n").map((l, i) => {
        const clean = l.replace(/\*\*(.+?)\*\*/g, "$1");
        if (l.startsWith("## ") || l.startsWith("# ")) return <h3 key={i} className="text-lg font-bold text-primary mt-3">{clean.replace(/^#+\s/, "")}</h3>;
        if (l.startsWith("### ")) return <h4 key={i} className="font-semibold mt-2">{clean.slice(4)}</h4>;
        if (/^\s*[-*]\s/.test(l)) return <p key={i} className="ps-4">• {clean.replace(/^\s*[-*]\s/, "")}</p>;
        if (!l.trim()) return null;
        return <p key={i}>{clean}</p>;
      })}
    </div>
  );
}
