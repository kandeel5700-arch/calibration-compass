import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Pencil, Trash2, FileSpreadsheet, FileText, QrCode, History, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Protected } from "@/components/Protected";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
import { toast } from "sonner";
import QRCode from "qrcode";
import * as XLSX from "xlsx";
import { exportElementToPDF } from "@/lib/pdfExport";
import { useRef } from "react";
import { cn } from "@/lib/utils";
import { getStatus, STATUS_LABELS, STATUS_COLORS, daysUntil, type Equipment } from "@/lib/equipment";

export const Route = createFileRoute("/equipment")({
  component: () => (
    <Protected>
      <EquipmentPage />
    </Protected>
  ),
});

interface FormState {
  name: string;
  model: string;
  serial_number: string;
  last_calibration_date: string;
  validity_months: number;
  notes: string;
  imageFile: File | null;
}

const emptyForm: FormState = {
  name: "",
  model: "",
  serial_number: "",
  last_calibration_date: new Date().toISOString().slice(0, 10),
  validity_months: 12,
  notes: "",
  imageFile: null,
};

function EquipmentPage() {
  const { isAdmin } = useAuth();
  const printRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [items, setItems] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "valid" | "soon" | "expired">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [qrItem, setQrItem] = useState<Equipment | null>(null);
  const [qrUrl, setQrUrl] = useState("");
  const [historyItem, setHistoryItem] = useState<Equipment | null>(null);
  const [history, setHistory] = useState<{ calibration_date: string; validity_months: number; notes: string | null; created_at: string }[]>([]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("eq-list-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "equipment" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function load() {
    const { data, error } = await supabase.from("equipment").select("*").order("next_calibration_date");
    if (error) toast.error("فشل تحميل الأجهزة", { description: error.message });
    setItems((data ?? []) as Equipment[]);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    return items.filter((it) => {
      const s = search.trim().toLowerCase();
      const matches =
        !s ||
        it.name.toLowerCase().includes(s) ||
        (it.model ?? "").toLowerCase().includes(s) ||
        it.serial_number.toLowerCase().includes(s);
      const status = getStatus(it);
      const matchesFilter = filter === "all" || status === filter;
      return matches && matchesFilter;
    });
  }, [items, search, filter]);

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(eq: Equipment) {
    setEditingId(eq.id);
    setForm({
      name: eq.name,
      model: eq.model ?? "",
      serial_number: eq.serial_number,
      last_calibration_date: eq.last_calibration_date,
      validity_months: eq.validity_months,
      notes: eq.notes ?? "",
      imageFile: null,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.name || !form.serial_number || !form.last_calibration_date) {
      toast.error("يرجى ملء الحقول المطلوبة");
      return;
    }
    setSaving(true);

    let image_url: string | undefined;
    if (form.imageFile) {
      const path = `${Date.now()}-${form.imageFile.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from("equipment-images")
        .upload(path, form.imageFile, { upsert: false });
      if (upErr) {
        toast.error("فشل رفع الصورة", { description: upErr.message });
        setSaving(false);
        return;
      }
      const { data } = supabase.storage.from("equipment-images").getPublicUrl(path);
      image_url = data.publicUrl;
    }

    const payload = {
      name: form.name.trim(),
      model: form.model.trim() || null,
      serial_number: form.serial_number.trim(),
      last_calibration_date: form.last_calibration_date,
      validity_months: form.validity_months,
      notes: form.notes.trim() || null,
      next_calibration_date: form.last_calibration_date, // overwritten by trigger
      ...(image_url ? { image_url } : {}),
    };

    const { error } = editingId
      ? await supabase.from("equipment").update(payload).eq("id", editingId)
      : await supabase.from("equipment").insert([payload]);

    setSaving(false);
    if (error) {
      toast.error("فشل الحفظ", { description: error.message });
      return;
    }
    toast.success(editingId ? "تم تحديث الجهاز" : "تم إضافة الجهاز");
    setModalOpen(false);
    load();
  }

  async function handleDelete() {
    if (!deleteId) return;
    const { error } = await supabase.from("equipment").delete().eq("id", deleteId);
    if (error) {
      toast.error("فشل الحذف", { description: error.message });
    } else {
      toast.success("تم حذف الجهاز");
    }
    setDeleteId(null);
    load();
  }

  async function showQR(eq: Equipment) {
    const data = JSON.stringify({
      id: eq.id,
      name: eq.name,
      serial: eq.serial_number,
      next: eq.next_calibration_date,
    });
    const url = await QRCode.toDataURL(data, { width: 320, margin: 1, color: { dark: "#0a1f1a", light: "#ffffff" } });
    setQrUrl(url);
    setQrItem(eq);
  }

  async function showHistory(eq: Equipment) {
    setHistoryItem(eq);
    const { data } = await supabase
      .from("calibration_history")
      .select("calibration_date,validity_months,notes,created_at")
      .eq("equipment_id", eq.id)
      .order("calibration_date", { ascending: false });
    setHistory(data ?? []);
  }

  function exportExcel() {
    const rows = filtered.map((it) => ({
      "اسم الجهاز": it.name,
      "الموديل": it.model ?? "",
      "رقم السريال": it.serial_number,
      "آخر معايرة": it.last_calibration_date,
      "المعايرة القادمة": it.next_calibration_date,
      "مدة الصلاحية (شهر)": it.validity_months,
      "الحالة": STATUS_LABELS[getStatus(it)],
      "ملاحظات": it.notes ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الأجهزة");
    XLSX.writeFile(wb, `equipment-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("تم تصدير ملف Excel");
  }

  async function exportPDF() {
    if (!printRef.current) return;
    setExporting(true);
    try {
      await exportElementToPDF(
        printRef.current,
        `equipment-${new Date().toISOString().slice(0, 10)}.pdf`,
        { orientation: "landscape" }
      );
      toast.success("تم تصدير PDF بجودة عالية");
    } catch (e: any) {
      toast.error("فشل تصدير PDF", { description: e?.message });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">إدارة الأجهزة</h1>
          <p className="text-muted-foreground text-sm mt-1">{items.length} جهاز مسجّل</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={exportExcel} variant="outline" size="sm" className="gap-2">
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </Button>
          <Button onClick={exportPDF} variant="outline" size="sm" className="gap-2">
            <FileText className="w-4 h-4" /> PDF
          </Button>
          {isAdmin && (
            <Button onClick={openAdd} className="gap-2 gradient-primary text-primary-foreground shadow-luxe">
              <Plus className="w-4 h-4" /> جهاز جديد
            </Button>
          )}
        </div>
      </header>

      <div className="glass-card rounded-2xl p-4 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="بحث بالاسم، الموديل، أو رقم السريال..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-10"
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="md:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الحالات</SelectItem>
            <SelectItem value="valid">سليم</SelectItem>
            <SelectItem value="soon">قارب على الانتهاء</SelectItem>
            <SelectItem value="expired">منتهي الصلاحية</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden shadow-card">
        {loading ? (
          <div className="p-10 text-center text-muted-foreground">جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">لا توجد أجهزة مطابقة</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-secondary/50 text-muted-foreground">
                <tr>
                  <th className="p-3 text-right font-semibold">الجهاز</th>
                  <th className="p-3 text-right font-semibold">الموديل</th>
                  <th className="p-3 text-right font-semibold">السريال</th>
                  <th className="p-3 text-right font-semibold">آخر معايرة</th>
                  <th className="p-3 text-right font-semibold">المعايرة القادمة</th>
                  <th className="p-3 text-right font-semibold">الحالة</th>
                  <th className="p-3 text-right font-semibold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it) => {
                  const status = getStatus(it);
                  const days = daysUntil(it.next_calibration_date);
                  return (
                    <tr
                      key={it.id}
                      className={cn(
                        "border-t border-border hover:bg-secondary/30 transition-colors",
                        status === "expired" && "row-expired"
                      )}
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          {it.image_url ? (
                            <img src={it.image_url} alt={it.name} className="w-10 h-10 rounded-lg object-cover border border-border" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                              <ImageIcon className="w-4 h-4 text-muted-foreground" />
                            </div>
                          )}
                          <span className="font-medium">{it.name}</span>
                        </div>
                      </td>
                      <td className="p-3 text-muted-foreground">{it.model ?? "—"}</td>
                      <td className="p-3 font-mono text-xs">{it.serial_number}</td>
                      <td className="p-3 text-muted-foreground">{it.last_calibration_date}</td>
                      <td className="p-3">
                        <div className="flex flex-col">
                          <span>{it.next_calibration_date}</span>
                          <span className={cn("text-xs", status === "expired" ? "text-destructive" : status === "soon" ? "text-warning" : "text-muted-foreground")}>
                            {days < 0 ? `متأخر ${Math.abs(days)} يوم` : `${days} يوم متبقي`}
                          </span>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className={cn("text-xs px-2.5 py-1 rounded-full border font-semibold", STATUS_COLORS[status])}>
                          {STATUS_LABELS[status]}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => showQR(it)} title="QR Code">
                            <QrCode className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => showHistory(it)} title="السجل">
                            <History className="w-4 h-4" />
                          </Button>
                          {isAdmin && (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => openEdit(it)} title="تعديل">
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => setDeleteId(it.id)} className="text-destructive hover:text-destructive" title="حذف">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingId ? "تعديل جهاز" : "إضافة جهاز جديد"}</DialogTitle>
            <DialogDescription>
              املأ بيانات الجهاز. سيتم حساب تاريخ المعايرة القادمة تلقائياً.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            <div className="space-y-2 md:col-span-2">
              <Label>اسم الجهاز *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>الموديل</Label>
              <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>رقم السريال *</Label>
              <Input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>تاريخ آخر معايرة *</Label>
              <Input
                type="date"
                value={form.last_calibration_date}
                onChange={(e) => setForm({ ...form, last_calibration_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>مدة الصلاحية (بالأشهر) *</Label>
              <Input
                type="number"
                min={1}
                max={120}
                value={form.validity_months}
                onChange={(e) => setForm({ ...form, validity_months: Number(e.target.value) || 12 })}
              />
              <p className="text-xs text-muted-foreground">شائع: 6، 12، 24 شهر</p>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>صورة الجهاز</Label>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => setForm({ ...form, imageFile: e.target.files?.[0] ?? null })}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>ملاحظات</Label>
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="أي معلومات إضافية عن الجهاز..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={saving} className="gradient-primary text-primary-foreground">
              {saving ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Modal */}
      <Dialog open={!!qrItem} onOpenChange={(o) => !o && setQrItem(null)}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>QR Code</DialogTitle>
            <DialogDescription>{qrItem?.name} — {qrItem?.serial_number}</DialogDescription>
          </DialogHeader>
          {qrUrl && (
            <div className="flex flex-col items-center gap-3">
              <img src={qrUrl} alt="QR" className="w-64 h-64 rounded-lg bg-white p-2" />
              <a href={qrUrl} download={`qr-${qrItem?.serial_number}.png`}>
                <Button variant="outline" size="sm">تحميل QR</Button>
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* History Modal */}
      <Dialog open={!!historyItem} onOpenChange={(o) => !o && setHistoryItem(null)}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>سجل المعايرات</DialogTitle>
            <DialogDescription>{historyItem?.name}</DialogDescription>
          </DialogHeader>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">لا يوجد سجل بعد</p>
          ) : (
            <ul className="space-y-2 max-h-80 overflow-y-auto">
              {history.map((h, i) => (
                <li key={i} className="p-3 rounded-lg bg-secondary/40 border border-border">
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold">{h.calibration_date}</span>
                    <span className="text-muted-foreground">{h.validity_months} شهر</span>
                  </div>
                  {h.notes && <p className="text-xs text-muted-foreground mt-1">{h.notes}</p>}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف هذا الجهاز؟ سيتم حذف جميع سجلات المعايرة المرتبطة به أيضاً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
