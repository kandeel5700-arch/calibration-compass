import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Boxes, AlertTriangle, Clock, CheckCircle2, TrendingUp } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Protected } from "@/components/Protected";
import { getStatus, type Equipment } from "@/lib/equipment";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: () => (
    <Protected>
      <Dashboard />
    </Protected>
  ),
});

function Dashboard() {
  const [items, setItems] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("equipment-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "equipment" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function load() {
    const { data } = await supabase.from("equipment").select("*").order("next_calibration_date");
    setItems((data ?? []) as Equipment[]);
    setLoading(false);
  }

  const total = items.length;
  const expired = items.filter((i) => getStatus(i) === "expired").length;
  const soon = items.filter((i) => getStatus(i) === "soon").length;
  const valid = items.filter((i) => getStatus(i) === "valid").length;

  const pieData = [
    { name: "سليم", value: valid, color: "oklch(0.68 0.16 165)" },
    { name: "قارب على الانتهاء", value: soon, color: "oklch(0.75 0.18 60)" },
    { name: "منتهي", value: expired, color: "oklch(0.62 0.22 25)" },
  ];

  const barData = [
    { name: "سليم", count: valid },
    { name: "قارب", count: soon },
    { name: "منتهي", count: expired },
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">الداشبورد</h1>
          <p className="text-muted-foreground text-sm mt-1">نظرة عامة على حالة جميع الأجهزة</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground glass-card px-3 py-2 rounded-lg">
          <TrendingUp className="w-4 h-4 text-primary" />
          تحديث مباشر
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Boxes} label="إجمالي الأجهزة" value={total} accent="primary" />
        <StatCard icon={CheckCircle2} label="سليم" value={valid} accent="success" />
        <StatCard icon={Clock} label="قارب على الانتهاء" value={soon} accent="warning" />
        <StatCard icon={AlertTriangle} label="منتهي الصلاحية" value={expired} accent="destructive" />
      </div>

      {loading ? (
        <div className="glass-card rounded-2xl p-10 text-center text-muted-foreground">جاري التحميل...</div>
      ) : total === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center">
          <Boxes className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">لا توجد أجهزة بعد. ابدأ بإضافة أول جهاز من صفحة الأجهزة.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title="توزيع حالة الأجهزة">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value">
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.22 0.02 220)",
                    border: "1px solid oklch(0.3 0.02 220)",
                    borderRadius: 8,
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="عدد الأجهزة حسب الحالة">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={barData}>
                <XAxis dataKey="name" tick={{ fill: "oklch(0.68 0.02 200)" }} />
                <YAxis tick={{ fill: "oklch(0.68 0.02 200)" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.22 0.02 220)",
                    border: "1px solid oklch(0.3 0.02 220)",
                    borderRadius: 8,
                  }}
                  cursor={{ fill: "oklch(0.3 0.02 220 / 0.3)" }}
                />
                <Bar dataKey="count" fill="oklch(0.68 0.16 165)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}
    </div>
  );
}

const accentMap = {
  primary: "from-primary/20 to-primary/5 text-primary border-primary/30",
  success: "from-success/20 to-success/5 text-success border-success/30",
  warning: "from-warning/20 to-warning/5 text-warning border-warning/30",
  destructive: "from-destructive/20 to-destructive/5 text-destructive border-destructive/30",
};

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  accent: keyof typeof accentMap;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl p-5 border bg-gradient-to-br shadow-card transition-transform hover:scale-[1.02]",
        accentMap[accent]
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs md:text-sm font-medium opacity-90">{label}</p>
          <p className="text-3xl md:text-4xl font-bold mt-2">{value}</p>
        </div>
        <Icon className="w-8 h-8 md:w-10 md:h-10 opacity-80" />
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-card rounded-2xl p-5 shadow-card">
      <h3 className="font-semibold mb-4">{title}</h3>
      {children}
    </div>
  );
}
