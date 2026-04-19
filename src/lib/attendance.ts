// Attendance helpers
// Week starts Saturday, ends Friday
// Standard work day = 8 hours
// Overtime hourly rate = daily_rate / 8

export const STANDARD_HOURS = 8;

export function hourlyRate(dailyRate: number) {
  return dailyRate / STANDARD_HOURS;
}

/** Returns the Saturday (00:00) of the week containing `date`. */
export function weekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // JS: Sun=0, Mon=1, ... Sat=6. We want Sat as start.
  const day = d.getDay();
  const diff = (day + 1) % 7; // days since last Saturday
  d.setDate(d.getDate() - diff);
  return d;
}

/** Returns the Friday 23:59:59.999 of the week containing `date`. */
export function weekEnd(date: Date): Date {
  const start = weekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function formatRange(start: Date, end: Date) {
  const fmt = new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short" });
  return `${fmt.format(start)} → ${fmt.format(end)}`;
}

export interface ComputedDay {
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  pay: number;
}

export function computeSession(checkIn: string, checkOut: string | null, dailyRate: number): ComputedDay {
  if (!checkOut) return { totalHours: 0, regularHours: 0, overtimeHours: 0, pay: 0 };
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  const totalHours = Math.max(0, ms / 3_600_000);
  const regularHours = Math.min(totalHours, STANDARD_HOURS);
  // Overtime rule:
  // - First overtime hour must complete fully (<60 min after standard day = 0 OT).
  // - Once 1 full hour is reached, additional minutes count proportionally.
  const rawOvertime = Math.max(0, totalHours - STANDARD_HOURS);
  const overtimeHours = rawOvertime < 1 ? 0 : rawOvertime;
  const hr = hourlyRate(dailyRate);
  const pay = regularHours * hr + overtimeHours * hr;
  return { totalHours, regularHours, overtimeHours, pay };
}

export function formatDuration(hours: number) {
  if (!hours) return "0س 0د";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}س ${m}د`;
}

export function formatTime(iso: string) {
  return new Intl.DateTimeFormat("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat("ar-EG", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

export function toLocalDateTimeInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
