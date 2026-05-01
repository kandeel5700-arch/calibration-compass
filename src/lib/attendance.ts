// Attendance helpers
// Week starts Saturday, ends Friday
// Standard work day = 8 hours
// Overtime hourly rate = daily_rate / 8

export const STANDARD_HOURS = 8;

export interface DayRule {
  day_of_week: number; // 0=Sun..6=Sat
  start_hour: number;  // billable start (e.g., 8 for 08:00)
  end_hour: number;    // end (informational)
  standard_hours: number; // hours considered a "full day"
  is_working_day: boolean;
}

export type ScheduleMap = Record<number, DayRule>;

export const DEFAULT_SCHEDULE: ScheduleMap = {
  0: { day_of_week: 0, start_hour: 8,  end_hour: 16, standard_hours: 8, is_working_day: true },
  1: { day_of_week: 1, start_hour: 8,  end_hour: 16, standard_hours: 8, is_working_day: true },
  2: { day_of_week: 2, start_hour: 8,  end_hour: 16, standard_hours: 8, is_working_day: true },
  3: { day_of_week: 3, start_hour: 8,  end_hour: 16, standard_hours: 8, is_working_day: true },
  4: { day_of_week: 4, start_hour: 8,  end_hour: 16, standard_hours: 8, is_working_day: true },
  5: { day_of_week: 5, start_hour: 8,  end_hour: 16, standard_hours: 8, is_working_day: false },
  6: { day_of_week: 6, start_hour: 12, end_hour: 16, standard_hours: 4, is_working_day: true },
};

export const DAY_NAMES_AR = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export function hourlyRate(dailyRate: number, standardHours: number = STANDARD_HOURS) {
  return dailyRate / (standardHours || STANDARD_HOURS);
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

export function computeSession(
  checkIn: string,
  checkOut: string | null,
  dailyRate: number,
  schedule: ScheduleMap = DEFAULT_SCHEDULE,
): ComputedDay {
  if (!checkOut) return { totalHours: 0, regularHours: 0, overtimeHours: 0, pay: 0 };

  const inDate = new Date(checkIn);
  const outDate = new Date(checkOut);
  const day = inDate.getDay();

  const rule = schedule[day] ?? DEFAULT_SCHEDULE[day];
  const standardForDay = Math.max(0, Number(rule.standard_hours) || 0);
  const startHour = Number(rule.start_hour) || 0;

  // Billable start = max(checkIn, day's start_hour)
  const billableStart = new Date(inDate);
  const sh = Math.floor(startHour);
  const sm = Math.round((startHour - sh) * 60);
  billableStart.setHours(sh, sm, 0, 0);

  const effectiveStartMs = Math.max(inDate.getTime(), billableStart.getTime());
  const ms = outDate.getTime() - effectiveStartMs;
  const totalHours = Math.max(0, ms / 3_600_000);

  const regularHours = Math.min(totalHours, standardForDay);
  const rawOvertime = Math.max(0, totalHours - standardForDay);
  // First overtime hour must complete fully before counting.
  const overtimeHours = rawOvertime < 1 ? 0 : rawOvertime;

  const hr = hourlyRate(dailyRate, standardForDay || STANDARD_HOURS);
  // If the user completes the day's standard hours, pay full daily rate
  // (not pro-rated). Otherwise, pay hourly for the regular portion.
  const regularPay =
    standardForDay > 0 && regularHours >= standardForDay
      ? dailyRate
      : regularHours * hr;
  const pay = regularPay + overtimeHours * hr;
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
