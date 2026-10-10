import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Protected } from "@/components/Protected";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  FileText,
  Download,
  Printer,
  Calendar,
  Users,
  Boxes,
  Wallet,
  Clock,
} from "lucide-react";
import { computeSession, formatDuration, loadAttendanceSettings } from "@/lib/attendance";

export const Route = createFileRoute("/reports")({
  component: () => (
    <Protected>
      <ReportsPage />
    </Protected>
  ),
});

type ReportType = "attendance" | "equipment";

function ReportsPage() {
  const { user, isAdmin } = useAuth();
  const [type, setType] = useState<ReportType>("attendance");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedUser, setSelectedUser] = useState<string>("me");
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [salaries, setSalaries] = useState<Record<string, number>>({});
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: profs }, { data: sals }] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, email"),
        supabase.from("user_salary").select("user_id, daily_rate"),
      ]);
      const p: Record<string, any> = {};
      (profs ?? []).forEach((x: any) => (p[x.user_id] = x));
      setProfiles(p);
      const s: Record<string, number> = {};
      (sals ?? []).forEach((x: any) => (s[x.user_id] = Number(x.daily_rate)));
      setSalaries(s);
    })();
  }, []);

  async function generate() {
    setLoading(true);
    await loadAttendanceSettings(supabase);
    if (type === "attendance") {
      let q = supabase
        .from("attendance")
        .select("*")
        .gte("check_in", startDate + "T00:00:00")
        .lte("check_in", endDate + "T23:59:59")
        .order("check_in", { ascending: false });
      if (!isAdmin || selectedUser === "me") q = q.eq("user_id", user!.id);
      else if (selectedUser !== "all") q = q.eq("user_id", selectedUser);
      const { data: rows, error } = await q;
      if (error) toast.error(error.message);
      setData(rows ?? []);
    } else {
      const { data: rows, error } = await supabase
        .from("equipment")
        .select("*")
        .order("next_calibration_date", { ascending: true });
      if (error) toast.error(error.message);
      setData(rows ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const totals = useMemo(() => {
    if (type !== "attendance") return null;
    let regular = 0,
      overtime = 0,
      pay = 0;
    data.forEach((r: any) => {
      const rate = salaries[r.user_id] ?? 0;
      const c = computeSession(r.check_in, r.check_out, rate);
      regular += c.regularHours;
      overtime += c.overtimeHours;
      pay += c.pay;
    });
    return { regular, overtime, pay };
  }, [data, type, salaries]);

  function exportCSV() {
    let csv = "";
    if (type === "attendance") {
      csv = "الموظف,البريد,تاريخ الحضور,وقت الحضور,وقت الانصراف,ساعات عادية,ساعات إضافية,المستحق\n";
      data.forEach((r: any) => {
        const p = profiles[r.user_id];
        const rate = salaries[r.user_id] ?? 0;
        const c = computeSession(r.check_in, r.check_out, rate);
        csv += `"${p?.full_name ?? ""}","${p?.email ?? ""}","${new Date(r.check_in).toLocaleDateString("ar-EG")}","${new Date(r.check_in).toLocaleTimeString("ar-EG")}","${r.check_out ? new Date(r.check_out).toLocaleTimeString("ar-EG") : "-"}","${c.regularHours.toFixed(2)}","${c.overtimeHours.toFixed(2)}","${c.pay.toFixed(2)}"\n`;
      });
    } else {
      csv = "الاسم,الموديل,الرقم التسلسلي,آخر معايرة,المعايرة القادمة,صلاحية (شهور),الحالة\n";
      const today = new Date();
      data.forEach((e: any) => {
        const next = new Date(e.next_calibration_date);
        const diff = Math.floor((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const status = diff < 0 ? "منتهي" : diff <= 30 ? "قارب الانتهاء" : "سليم";
        csv += `"${e.name}","${e.model ?? ""}","${e.serial_number}","${e.last_calibration_date}","${e.next_calibration_date}","${e.validity_months}","${status}"\n`;
      });
    }
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${type}-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("تم التصدير ✓");
  }

  function printReport() {
    window.print();
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto" dir="rtl">
      <Card className="glass-card border-primary/20 print:hidden">
        <CardContent className="p-6 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center shadow-luxe">
            <FileText className="w-7 h-7 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">التقارير</h1>
            <p className="text-sm text-muted-foreground mt-1">
              تقارير الحضور والمرتبات وحالة الأجهزة
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card print:hidden">
        <CardHeader>
          <CardTitle>إعدادات التقرير</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label>نوع التقرير</Label>
              <Select value={type} onValueChange={(v) => setType(v as ReportType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="attendance">
                    <span className="flex items-center gap-2">
                      <Clock className="w-4 h-4" /> تقرير الحضور والمرتبات
                    </span>
                  </SelectItem>
                  <SelectItem value="equipment">
                    <span className="flex items-center gap-2">
                      <Boxes className="w-4 h-4" /> تقرير الأجهزة
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isAdmin && type === "attendance" && (
              <div>
                <Label>المستخدم</Label>
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="me">أنا</SelectItem>
                    <SelectItem value="all">جميع المستخدمين</SelectItem>
                    {Object.values(profiles).map((p: any) => (
                      <SelectItem key={p.user_id} value={p.user_id}>
                        {p.full_name || p.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {type === "attendance" && (
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label>من تاريخ</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <Label>إلى تاريخ</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={generate} disabled={loading} className="gradient-primary gap-2">
              <Calendar className="w-4 h-4" />
              {loading ? "جارٍ التحميل..." : "إنشاء التقرير"}
            </Button>
            <Button onClick={exportCSV} variant="outline" disabled={!data.length} className="gap-2">
              <Download className="w-4 h-4" />
              تصدير Excel/CSV
            </Button>
            <Button onClick={printReport} variant="outline" disabled={!data.length} className="gap-2">
              <Printer className="w-4 h-4" />
              طباعة / PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {type === "attendance" && totals && data.length > 0 && (
        <div className="grid grid-cols-3 gap-3 print:grid-cols-3">
          <SummaryCard icon={Clock} label="ساعات عادية" value={formatDuration(totals.regular)} />
          <SummaryCard
            icon={Clock}
            label="ساعات إضافية"
            value={formatDuration(totals.overtime)}
            accent
          />
          <SummaryCard icon={Wallet} label="إجمالي المستحق" value={`${totals.pay.toFixed(2)} ج`} />
        </div>
      )}

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>
            {type === "attendance" ? "سجل الحضور" : "قائمة الأجهزة"}{" "}
            <span className="text-sm font-normal text-muted-foreground">({data.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {data.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">لا توجد بيانات</p>
          ) : type === "attendance" ? (
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr className="text-right">
                  {isAdmin && <th className="p-2">الموظف</th>}
                  <th className="p-2">التاريخ</th>
                  <th className="p-2">الحضور</th>
                  <th className="p-2">الانصراف</th>
                  <th className="p-2">عادي</th>
                  <th className="p-2">إضافي</th>
                  <th className="p-2">المستحق</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r: any) => {
                  const p = profiles[r.user_id];
                  const rate = salaries[r.user_id] ?? 0;
                  const c = computeSession(r.check_in, r.check_out, rate);
                  return (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30">
                      {isAdmin && (
                        <td className="p-2 font-medium">{p?.full_name || p?.email || "—"}</td>
                      )}
                      <td className="p-2">
                        {new Date(r.check_in).toLocaleDateString("ar-EG")}
                      </td>
                      <td className="p-2">{new Date(r.check_in).toLocaleTimeString("ar-EG")}</td>
                      <td className="p-2">
                        {r.check_out ? new Date(r.check_out).toLocaleTimeString("ar-EG") : "—"}
                      </td>
                      <td className="p-2 font-mono">{formatDuration(c.regularHours)}</td>
                      <td className="p-2 font-mono text-warning">
                        {formatDuration(c.overtimeHours)}
                      </td>
                      <td className="p-2 font-mono font-bold text-primary">
                        {c.pay.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr className="text-right">
                  <th className="p-2">الجهاز</th>
                  <th className="p-2">الموديل</th>
                  <th className="p-2">الرقم</th>
                  <th className="p-2">آخر معايرة</th>
                  <th className="p-2">المعايرة القادمة</th>
                  <th className="p-2">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {data.map((e: any) => {
                  const next = new Date(e.next_calibration_date);
                  const today = new Date();
                  const diff = Math.floor(
                    (next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
                  );
                  const status =
                    diff < 0
                      ? { label: "منتهي", cls: "bg-destructive/20 text-destructive" }
                      : diff <= 30
                        ? { label: "قارب الانتهاء", cls: "bg-warning/20 text-warning" }
                        : { label: "سليم", cls: "bg-success/20 text-success" };
                  return (
                    <tr key={e.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="p-2 font-medium">{e.name}</td>
                      <td className="p-2">{e.model ?? "—"}</td>
                      <td className="p-2 font-mono text-xs">{e.serial_number}</td>
                      <td className="p-2">{e.last_calibration_date}</td>
                      <td className="p-2">{e.next_calibration_date}</td>
                      <td className="p-2">
                        <Badge className={status.cls}>{status.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
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
