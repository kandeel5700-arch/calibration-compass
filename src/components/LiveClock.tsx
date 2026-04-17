import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

const AR_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

export function LiveClock({ compact = false }: { compact?: boolean }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Clock className="w-4 h-4" />
        <span>--:--:--</span>
      </div>
    );
  }

  const time = now.toLocaleTimeString("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  const day = AR_DAYS[now.getDay()];
  const dateStr = `${day} ${now.getDate()} ${AR_MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs glass-card px-3 py-2 rounded-lg">
        <Clock className="w-4 h-4 text-primary" />
        <span className="font-mono font-semibold">{time}</span>
        <span className="text-muted-foreground hidden sm:inline">• {dateStr}</span>
      </div>
    );
  }

  return (
    <div className="px-3 py-3 rounded-lg bg-sidebar-accent/40 border border-sidebar-border/50">
      <div className="flex items-center gap-2 text-primary mb-1">
        <Clock className="w-4 h-4" />
        <span className="font-mono text-base font-bold tracking-wider">{time}</span>
      </div>
      <p className="text-xs text-muted-foreground">{dateStr}</p>
    </div>
  );
}
