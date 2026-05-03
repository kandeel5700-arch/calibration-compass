import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  MapPin,
  Star,
  Copy,
  FileSpreadsheet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Protected } from "@/components/Protected";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/control-points")({
  component: () => (
    <Protected>
      <ControlPointsPage />
    </Protected>
  ),
});

interface ControlPoint {
  id: string;
  name: string;
  easting: number;
  northing: number;
  elevation: number;
  location_description: string | null;
  is_primary: boolean;
  created_at: string;
}

interface FormState {
  name: string;
  easting: string;
  northing: string;
  elevation: string;
  location_description: string;
  is_primary: boolean;
}

const emptyForm: FormState = {
  name: "",
  easting: "",
  northing: "",
  elevation: "",
  location_description: "",
  is_primary: true,
};

function ControlPointsPage() {
  const { user, isAdmin } = useAuth();
  const [points, setPoints] = useState<ControlPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "primary" | "auxiliary">("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("control-points-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "control_points" },
        load,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("control_points")
      .select("*")
      .order("is_primary", { ascending: false })
      .order("name");
    if (error) toast.error("تعذر تحميل النقاط");
    setPoints((data ?? []) as ControlPoint[]);
    setLoading(false);
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(p: ControlPoint) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      easting: String(p.easting),
      northing: String(p.northing),
      elevation: String(p.elevation),
      location_description: p.location_description ?? "",
      is_primary: p.is_primary,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("يرجى إدخال اسم النقطة");
      return;
    }
    const e = parseFloat(form.easting);
    const n = parseFloat(form.northing);
    const z = parseFloat(form.elevation);
    if (!isFinite(e) || !isFinite(n) || !isFinite(z)) {
      toast.error("يرجى إدخال إحداثيات صحيحة");
      return;
    }
    if (!user) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      easting: e,
      northing: n,
      elevation: z,
      location_description: form.location_description.trim() || null,
      is_primary: form.is_primary,
    };
    if (editingId) {
      const { error } = await supabase
        .from("control_points")
        .update(payload)
        .eq("id", editingId);
      if (error) toast.error("فشل حفظ التعديلات");
      else {
        toast.success("تم تحديث النقطة");
        setModalOpen(false);
      }
    } else {
      const { error } = await supabase
        .from("control_points")
        .insert({ ...payload, created_by: user.id });
      if (error) toast.error("فشل إضافة النقطة");
      else {
        toast.success("تمت إضافة النقطة");
        setModalOpen(false);
      }
    }
    setSaving(false);
    load();
  }

  async function handleDelete() {
    if (!deleteId) return;
    const { error } = await supabase
      .from("control_points")
      .delete()
      .eq("id", deleteId);
    if (error) toast.error("فشل الحذف");
    else {
      toast.success("تم حذف النقطة");
      setDeleteId(null);
      load();
    }
  }

  function copyPoint(p: ControlPoint) {
    const text = `${p.name}\tE: ${p.easting}\tN: ${p.northing}\tZ: ${p.elevation}`;
    navigator.clipboard.writeText(text);
    toast.success("تم النسخ");
  }

  function exportExcel() {
    const rows = filtered.map((p) => ({
      Name: p.name,
      Easting: p.easting,
      Northing: p.northing,
      Elevation: p.elevation,
      Type: p.is_primary ? "Primary" : "Auxiliary",
      Location: p.location_description ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Control Points");
    XLSX.writeFile(wb, `control-points-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const filtered = useMemo(() => {
    return points.filter((p) => {
      if (filter === "primary" && !p.is_primary) return false;
      if (filter === "auxiliary" && p.is_primary) return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          p.name.toLowerCase().includes(s) ||
          (p.location_description ?? "").toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [points, search, filter]);

  const stats = useMemo(
    () => ({
      total: points.length,
      primary: points.filter((p) => p.is_primary).length,
      auxiliary: points.filter((p) => !p.is_primary).length,
    }),
    [points],
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <div className="glass-card rounded-2xl p-6 shadow-luxe">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gradient-primary">
              النقاط المساحية
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              قائمة بنقاط التحكم والمرجعيات المساحية
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={exportExcel}
              className="gap-2"
              disabled={!points.length}
            >
              <FileSpreadsheet className="w-4 h-4" />
              تصدير Excel
            </Button>
            {isAdmin && (
              <Button onClick={openCreate} className="gap-2 gradient-primary">
                <Plus className="w-4 h-4" />
                إضافة نقطة
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-5">
          <StatBox label="الإجمالي" value={stats.total} tone="primary" />
          <StatBox label="أساسية" value={stats.primary} tone="success" />
          <StatBox label="مساعدة" value={stats.auxiliary} tone="warn" />
        </div>

        <div className="mt-5 flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="بحث بالاسم أو الموقع..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-10"
            />
          </div>
          <Select
            value={filter}
            onValueChange={(v) => setFilter(v as typeof filter)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع النقاط</SelectItem>
              <SelectItem value="primary">أساسية فقط</SelectItem>
              <SelectItem value="auxiliary">مساعدة فقط</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          جاري التحميل...
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            لا توجد نقاط
            {isAdmin && (
              <div className="mt-4">
                <Button onClick={openCreate} className="gap-2">
                  <Plus className="w-4 h-4" />
                  أضف أول نقطة
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <Card
              key={p.id}
              className={cn(
                "transition-all hover:shadow-luxe relative overflow-hidden",
                p.is_primary
                  ? "border-primary/40"
                  : "border-warning/30 bg-warning/5",
              )}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={cn(
                        "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                        p.is_primary
                          ? "bg-primary/15 text-primary"
                          : "bg-warning/15 text-warning",
                      )}
                    >
                      {p.is_primary ? (
                        <Star className="w-5 h-5 fill-current" />
                      ) : (
                        <MapPin className="w-5 h-5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold truncate">{p.name}</h3>
                      <Badge
                        variant="outline"
                        className={cn(
                          "mt-0.5 text-[10px]",
                          p.is_primary
                            ? "border-primary/40 text-primary"
                            : "border-warning/40 text-warning",
                        )}
                      >
                        {p.is_primary ? "أساسية" : "مساعدة"}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => copyPoint(p)}
                    className="h-7 w-7 shrink-0"
                    title="نسخ"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>

                <div className="space-y-1.5 text-sm font-mono bg-muted/40 rounded-lg p-3">
                  <CoordRow label="E" value={p.easting} />
                  <CoordRow label="N" value={p.northing} />
                  <CoordRow label="Z" value={p.elevation} />
                </div>

                {p.location_description && (
                  <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                    📍 {p.location_description}
                  </p>
                )}

                {isAdmin && (
                  <div className="flex gap-2 mt-4 pt-3 border-t border-border/50">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(p)}
                      className="flex-1 gap-1"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      تعديل
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDeleteId(p.id)}
                      className="text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "تعديل النقطة" : "إضافة نقطة جديدة"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>اسم النقطة</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="مثال: CP-01"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Easting</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={form.easting}
                  onChange={(e) =>
                    setForm({ ...form, easting: e.target.value.replace(/[^0-9.\-]/g, "") })
                  }
                />
              </div>
              <div>
                <Label>Northing</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={form.northing}
                  onChange={(e) =>
                    setForm({ ...form, northing: e.target.value.replace(/[^0-9.\-]/g, "") })
                  }
                />
              </div>
              <div>
                <Label>Elevation</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={form.elevation}
                  onChange={(e) =>
                    setForm({ ...form, elevation: e.target.value.replace(/[^0-9.\-]/g, "") })
                  }
                />
              </div>
            </div>
            <div>
              <Label>وصف المكان</Label>
              <Textarea
                value={form.location_description}
                onChange={(e) =>
                  setForm({ ...form, location_description: e.target.value })
                }
                placeholder="مثال: بجانب البوابة الرئيسية، على السور الشمالي"
                rows={2}
              />
            </div>
            <div className="flex items-center justify-between bg-muted/40 rounded-lg p-3">
              <div>
                <Label className="cursor-pointer">نقطة أساسية</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {form.is_primary
                    ? "نقطة تحكم رئيسية معتمدة"
                    : "نقطة مساعدة / ثانوية"}
                </p>
              </div>
              <Switch
                checked={form.is_primary}
                onCheckedChange={(v) => setForm({ ...form, is_primary: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setModalOpen(false)}
              disabled={saving}
            >
              إلغاء
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف النقطة؟</AlertDialogTitle>
            <AlertDialogDescription>
              لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CoordRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-muted-foreground font-bold w-6">{label}:</span>
      <span className="font-semibold tabular-nums" dir="ltr">
        {Number.isInteger(value) ? value.toString() : value.toFixed(3)}
      </span>
    </div>
  );
}

function StatBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "primary" | "success" | "warn";
}) {
  const cls =
    tone === "primary"
      ? "bg-primary/10 text-primary"
      : tone === "success"
      ? "bg-success/10 text-success"
      : "bg-warning/10 text-warning";
  return (
    <div className={cn("rounded-xl p-3 text-center", cls)}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
}
