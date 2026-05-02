import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  MapPin,
  Pencil,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Protected } from "@/components/Protected";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tasks")({
  component: () => (
    <Protected>
      <TasksPage />
    </Protected>
  ),
});

interface DailyTask {
  id: string;
  task_date: string;
  location_name: string;
  task_description: string;
  notes: string | null;
  created_by: string;
  completed_by: string | null;
  completed_at: string | null;
  completion_notes: string | null;
  created_at: string;
}

interface ProfileLite {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatArabicDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("ar-EG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function TasksPage() {
  const { user, isAdmin } = useAuth();
  const [date, setDate] = useState<string>(todayISO());
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [loading, setLoading] = useState(true);

  // create / edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    location_name: "",
    task_description: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  // complete modal
  const [completeTask, setCompleteTask] = useState<DailyTask | null>(null);
  const [completionNotes, setCompletionNotes] = useState("");

  // delete
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("daily-tasks-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_tasks" },
        load,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("daily_tasks")
      .select("*")
      .eq("task_date", date)
      .order("created_at", { ascending: true });
    if (error) {
      toast.error("تعذر تحميل المهام");
      setLoading(false);
      return;
    }
    const list = (data ?? []) as DailyTask[];
    setTasks(list);

    // load related profiles
    const ids = Array.from(
      new Set(
        list.flatMap((t) =>
          [t.created_by, t.completed_by].filter(Boolean) as string[],
        ),
      ),
    );
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", ids);
      const map: Record<string, ProfileLite> = {};
      (profs ?? []).forEach((p) => {
        map[p.user_id] = p as ProfileLite;
      });
      setProfiles(map);
    } else {
      setProfiles({});
    }
    setLoading(false);
  }

  function openCreate() {
    setEditingId(null);
    setForm({ location_name: "", task_description: "", notes: "" });
    setModalOpen(true);
  }

  function openEdit(t: DailyTask) {
    setEditingId(t.id);
    setForm({
      location_name: t.location_name,
      task_description: t.task_description,
      notes: t.notes ?? "",
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.location_name.trim() || !form.task_description.trim()) {
      toast.error("يرجى إدخال اسم الموقع والمهمة");
      return;
    }
    if (!user) return;
    setSaving(true);
    if (editingId) {
      const { error } = await supabase
        .from("daily_tasks")
        .update({
          location_name: form.location_name.trim(),
          task_description: form.task_description.trim(),
          notes: form.notes.trim() || null,
        })
        .eq("id", editingId);
      if (error) toast.error("فشل حفظ التعديلات");
      else {
        toast.success("تم تحديث المهمة");
        setModalOpen(false);
      }
    } else {
      const { error } = await supabase.from("daily_tasks").insert({
        task_date: date,
        location_name: form.location_name.trim(),
        task_description: form.task_description.trim(),
        notes: form.notes.trim() || null,
        created_by: user.id,
      });
      if (error) toast.error("فشل إضافة المهمة");
      else {
        toast.success("تمت إضافة المهمة");
        setModalOpen(false);
      }
    }
    setSaving(false);
    load();
  }

  async function handleComplete() {
    if (!completeTask || !user) return;
    const { error } = await supabase
      .from("daily_tasks")
      .update({
        completed_by: user.id,
        completed_at: new Date().toISOString(),
        completion_notes: completionNotes.trim() || null,
      })
      .eq("id", completeTask.id);
    if (error) toast.error("فشل تسجيل الإتمام");
    else {
      toast.success("تم تسجيل إتمام المهمة");
      setCompleteTask(null);
      setCompletionNotes("");
      load();
    }
  }

  async function handleUndo(t: DailyTask) {
    const { error } = await supabase
      .from("daily_tasks")
      .update({
        completed_by: null,
        completed_at: null,
        completion_notes: null,
      })
      .eq("id", t.id);
    if (error) toast.error("تعذر التراجع");
    else {
      toast.success("تم التراجع عن الإتمام");
      load();
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    const { error } = await supabase
      .from("daily_tasks")
      .delete()
      .eq("id", deleteId);
    if (error) toast.error("فشل الحذف");
    else {
      toast.success("تم حذف المهمة");
      setDeleteId(null);
      load();
    }
  }

  const stats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.completed_at).length;
    return { total, done, pending: total - done };
  }, [tasks]);

  const isToday = date === todayISO();

  return (
    <div className="max-w-5xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <div className="glass-card rounded-2xl p-6 shadow-luxe">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gradient-primary">
              مهام اليوم
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {formatArabicDate(date)}
              {isToday && (
                <Badge className="mr-2 bg-primary/20 text-primary border-0">
                  اليوم
                </Badge>
              )}
            </p>
          </div>
          {isAdmin && (
            <Button onClick={openCreate} className="gap-2 gradient-primary">
              <Plus className="w-4 h-4" />
              إضافة مهمة
            </Button>
          )}
        </div>

        {/* Date navigator */}
        <div className="mt-5 flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDate(shiftDate(date, -1))}
            className="gap-1"
          >
            <ChevronRight className="w-4 h-4" />
            اليوم السابق
          </Button>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={todayISO()}
            className="w-auto"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDate(shiftDate(date, 1))}
            disabled={date >= todayISO()}
            className="gap-1"
          >
            اليوم التالي
            <ChevronLeft className="w-4 h-4" />
          </Button>
          {!isToday && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDate(todayISO())}
            >
              العودة لليوم
            </Button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mt-5">
          <StatBox label="الإجمالي" value={stats.total} tone="primary" />
          <StatBox label="مكتملة" value={stats.done} tone="success" />
          <StatBox label="متبقية" value={stats.pending} tone="warn" />
        </div>
      </div>

      {/* Tasks list */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          جاري التحميل...
        </div>
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            لا توجد مهام لهذا اليوم
            {isAdmin && isToday && (
              <div className="mt-4">
                <Button onClick={openCreate} className="gap-2">
                  <Plus className="w-4 h-4" />
                  أضف أول مهمة
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => {
            const done = !!t.completed_at;
            const completer = t.completed_by ? profiles[t.completed_by] : null;
            return (
              <Card
                key={t.id}
                className={cn(
                  "transition-all hover:shadow-luxe",
                  done && "bg-success/5 border-success/30",
                )}
              >
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() =>
                        done ? handleUndo(t) : setCompleteTask(t)
                      }
                      className={cn(
                        "mt-1 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                        done
                          ? "bg-success border-success text-white"
                          : "border-muted-foreground/40 hover:border-primary",
                      )}
                      title={done ? "تراجع" : "تم"}
                    >
                      {done && <CheckCircle2 className="w-5 h-5" />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        <MapPin className="w-4 h-4 text-primary" />
                        <span className="font-semibold text-foreground">
                          {t.location_name}
                        </span>
                      </div>
                      <p
                        className={cn(
                          "text-base",
                          done && "line-through text-muted-foreground",
                        )}
                      >
                        {t.task_description}
                      </p>
                      {t.notes && (
                        <p className="text-xs text-muted-foreground mt-2 bg-muted/40 rounded p-2">
                          📝 {t.notes}
                        </p>
                      )}

                      {done && (
                        <div className="mt-3 pt-3 border-t border-border/50 space-y-1 text-xs">
                          <div className="flex items-center gap-2 text-success">
                            <UserIcon className="w-3.5 h-3.5" />
                            <span className="font-medium">
                              {completer?.full_name ||
                                completer?.email ||
                                "مستخدم"}
                            </span>
                            <span className="text-muted-foreground">
                              <Clock className="w-3 h-3 inline ml-1" />
                              {new Date(t.completed_at!).toLocaleString("ar-EG")}
                            </span>
                          </div>
                          {t.completion_notes && (
                            <p className="text-muted-foreground bg-success/5 rounded p-2 mt-1">
                              💬 {t.completion_notes}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {isAdmin && (
                      <div className="flex flex-col gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEdit(t)}
                          className="h-8 w-8"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeleteId(t.id)}
                          className="h-8 w-8 text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / Edit modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "تعديل المهمة" : "إضافة مهمة جديدة"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>اسم الشاليه أو الفيلا</Label>
              <Input
                value={form.location_name}
                onChange={(e) =>
                  setForm({ ...form, location_name: e.target.value })
                }
                placeholder="مثال: شاليه 24 أو فيلا A-12"
              />
            </div>
            <div>
              <Label>المهمة المطلوبة</Label>
              <Textarea
                value={form.task_description}
                onChange={(e) =>
                  setForm({ ...form, task_description: e.target.value })
                }
                placeholder="اكتب وصف المهمة..."
                rows={3}
              />
            </div>
            <div>
              <Label>ملاحظات (اختياري)</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="أي تعليمات إضافية"
                rows={2}
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

      {/* Complete modal */}
      <Dialog
        open={!!completeTask}
        onOpenChange={(o) => !o && setCompleteTask(null)}
      >
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تأكيد إتمام المهمة</DialogTitle>
          </DialogHeader>
          {completeTask && (
            <div className="space-y-3">
              <div className="bg-muted/40 rounded-lg p-3">
                <div className="text-sm font-semibold flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary" />
                  {completeTask.location_name}
                </div>
                <p className="text-sm mt-1">{completeTask.task_description}</p>
              </div>
              <div>
                <Label>ملاحظاتك على المهمة (اختياري)</Label>
                <Textarea
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  placeholder="مثال: تم التنفيذ كاملاً، أو هناك ملاحظة..."
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteTask(null)}>
              إلغاء
            </Button>
            <Button onClick={handleComplete} className="gap-2">
              <CheckCircle2 className="w-4 h-4" />
              تأكيد الإتمام
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المهمة؟</AlertDialogTitle>
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
