import { computeSession, DAY_NAMES_AR, DEFAULT_SCHEDULE, hourlyRate, type AttendanceSettings, type ScheduleMap } from "@/lib/attendance";

export type ReportProfile = { user_id: string; full_name: string | null; email: string | null };
export type ReportRow = { id: string; user_id: string; check_in: string; check_out: string | null; notes?: string | null };
export type ReportDay = {
  date: string; day: string; status: string; sessions: ReportRow[]; checkIn: string; checkOut: string;
  scheduledStart: string; scheduledEnd: string; standardHours: number; hourlyRate: number;
  hours: number; regular: number; overtime: number; lateMinutes: number; regularPay: number; overtimePay: number; pay: number; notes: string;
};
export type EmployeeReport = { profile: ReportProfile; name: string; dailyRate: number; days: ReportDay[]; attendanceDays: number; openSessions: number; missingDays: number; hours: number; regular: number; overtime: number; regularPay: number; overtimePay: number; pay: number; lateMinutes: number };
export type AttendanceReport = { from: string; to: string; generatedAt: string; settings: AttendanceSettings; employees: EmployeeReport[] };

export const reportDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const reportTime = (iso: string | null) => iso ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—";
export const hourTime = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;

export function buildAttendanceReport(profiles: ReportProfile[], rows: ReportRow[], salaries: Record<string, number>, schedule: ScheduleMap, settings: AttendanceSettings, from: string, to: string): AttendanceReport {
  const dates: Date[] = [];
  for (const d = new Date(`${from}T00:00:00`); reportDate(d) <= to; d.setDate(d.getDate() + 1)) dates.push(new Date(d));
  const employees = profiles.map((profile): EmployeeReport => {
    const dailyRate = salaries[profile.user_id] ?? 0;
    const employeeRows = rows.filter(r => r.user_id === profile.user_id);
    const days = dates.map((date): ReportDay => {
      const key = reportDate(date);
      const rule = schedule[date.getDay()] ?? DEFAULT_SCHEDULE[date.getDay()];
      const sessions = employeeRows.filter(r => reportDate(new Date(r.check_in)) === key).sort((a, b) => a.check_in.localeCompare(b.check_in));
      const closed = sessions.filter(r => r.check_out);
      const calc = sessions.map(r => computeSession(r.check_in, r.check_out, dailyRate, schedule, settings));
      const sum = (field: "totalHours" | "regularHours" | "overtimeHours" | "pay") => calc.reduce((n, c) => n + c[field], 0);
      const rate = hourlyRate(dailyRate, rule.standard_hours);
      const first = sessions[0];
      const start = new Date(date); start.setHours(Math.floor(rule.start_hour), Math.round((rule.start_hour % 1) * 60), 0, 0);
      const lateMinutes = first && rule.is_working_day ? Math.max(0, Math.floor((new Date(first.check_in).getTime() - start.getTime()) / 60000)) : 0;
      const open = sessions.some(r => !r.check_out);
      const overtimePay = sum("overtimeHours") * rate;
      return {
        date: key, day: DAY_NAMES_AR[date.getDay()], sessions,
        status: open ? "انصراف غير مسجل" : sessions.length ? "حضور مكتمل" : !rule.is_working_day ? "يوم راحة" : key > reportDate(new Date()) ? "يوم قادم" : "لا يوجد سجل",
        checkIn: first ? reportTime(first.check_in) : "—",
        checkOut: open ? "غير مسجل" : closed.length ? reportTime(closed.map(r => r.check_out).filter((v): v is string => Boolean(v)).sort().at(-1) ?? null) : "—",
        scheduledStart: hourTime(rule.start_hour), scheduledEnd: hourTime(rule.end_hour), standardHours: rule.standard_hours, hourlyRate: rate,
        hours: sum("totalHours"), regular: sum("regularHours"), overtime: sum("overtimeHours"), lateMinutes,
        regularPay: sum("pay") - overtimePay, overtimePay, pay: sum("pay"), notes: sessions.map(r => r.notes?.trim()).filter(Boolean).join(" | "),
      };
    });
    const total = (field: "hours" | "regular" | "overtime" | "regularPay" | "overtimePay" | "pay" | "lateMinutes") => days.reduce((s, d) => s + d[field], 0);
    return { profile, name: profile.full_name || profile.email || "موظف", dailyRate, days, attendanceDays: days.filter(d => d.sessions.length).length, missingDays: days.filter(d => d.status === "لا يوجد سجل").length, openSessions: employeeRows.filter(r => !r.check_out).length, hours: total("hours"), regular: total("regular"), overtime: total("overtime"), regularPay: total("regularPay"), overtimePay: total("overtimePay"), pay: total("pay"), lateMinutes: total("lateMinutes") };
  });
  return { from, to, settings, generatedAt: new Date().toLocaleString("ar-EG"), employees };
}

export function reportColors() {
  const css = getComputedStyle(document.documentElement);
  const read = (key: string) => {
    const value = css.getPropertyValue(`--report-${key}`).trim().replace("#", "").toUpperCase();
    return value.length === 3 ? value.split("").map(c => c + c).join("") : value;
  };
  return { paper: read("paper"), ink: read("ink"), brand: read("brand"), muted: read("muted"), line: read("line"), stripe: read("stripe"), warning: read("warning"), input: read("input") };
}

export function downloadReport(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export const reportFilename = (report: AttendanceReport, extension: string) => `UECC-${report.employees.length === 1 ? report.employees[0].name.replace(/[\\/:*?"<>|]/g, "-").slice(0, 60) : "attendance"}-${report.from}_${report.to}.${extension}`;