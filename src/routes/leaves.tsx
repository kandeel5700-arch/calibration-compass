import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Protected } from "@/components/Protected";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus,
  Calendar as CalendarIcon,
  CheckCircle2,
  XCircle,
  Clock as ClockIcon,
  Trash2,
  MessageSquare,
} from "lucide-react";

export const Route = createFileRoute("/leaves")({
  component: () => (
    <Protected>
      <LeavesPage />
    </Protected>
  ),
});

type LeaveType = "annual" | "casual" | "sick" | "permission";
type LeaveStatus = "pending" | "approved" | "rejected";

interface LeaveRow {
  id: string;
  user_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: LeaveStatus;
  admin_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
}

const TYPE_LABEL: Record<LeaveType, string> = {
  annual: "سنوية",
  casual: "عارضة",
  sick: "مرضية",
  permission: "إذن",
};

const STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: "قيد المراجعة",
  approved: "موافق عليها",
  rejected: "مرفوضة",
};

function LeavesPage() {
  const { user, isAdmin } = useAuth();
  const [rows, setRows] = useState<LeaveRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { full_name: string | null; email: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [openNew, setOpenNew] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: leaves }, { data: profs }] = await Promise.all([
      supabase.from("leave_requests").select("*").order("created_at", { ascending: false }),
      isAdmin
        ? supabase.from("profiles").select("user_id, full_name, email")
        : Promise.resolve({ data: [] }),
    ]);
    setRows((leaves ?? []) as LeaveRow[]);
    const map: Record<string, any> = {};
    (profs ?? []).forEach((p: any) => (map[p.user_id] = p));
    setProfiles(map);
    setLoading(false);
  }

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isAdmin]);

  const stats = useMemo(() => {
    const own = isAdmin ? rows : rows.filter((r) => r.user_id === user?.id);
    return {
      pending: own.filter((r) => r.status === "pending").length,
      approved: own.filter((r) => r.status === "approved").length,
      rejected: own.filter((r) => r.status === "rejected").length,
    };
  }, [rows, isAdmin, user?.id]);

  async function deleteLeave(id: string) {
    if (!confirm("حذف الطلب؟")) return;
    const { error } = await supabase.from("leave_requests").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("تم الحذف");
      load();
    }
  }

  async function review(id: string, status: "approved" | "rejected", notes?: string) {
    if (!user) return;
    const { error } = await supabase
      .from("leave_requests")
      .update({
        status,
        admin_notes: notes || null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(status === "approved" ? "تمت الموافقة ✓" : "تم الرفض");
      load();
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gradient-primary">الإجازات والأذونات</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isAdmin ? "إدارة طلبات الإجازات لجميع الموظفين" : "اطلب إجازتك وتابع الموافقة"}
          </p>
        </div>
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild>
            <Button className="gap-2 gradient-primary shadow-luxe">
              <Plus className="w-4 h-4" />
              طلب إجازة جديد
            </Button>
          </DialogTrigger>
          <DialogContent dir="rtl">
            <NewLeaveDialog
              onClose={() => setOpenNew(false)}
              onSaved={() => {
                setOpenNew(false);
                load();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatTile
          icon={ClockIcon}
          label="قيد المراجعة"
          value={stats.pending}
          color="text-warning bg-warning/15"
        />
        <StatTile
          icon={CheckCircle2}
          label="موافق عليها"
          value={stats.approved}
          color="text-success bg-success/15"
        />
        <StatTile
          icon={XCircle}
          label="مرفوضة"
          value={stats.rejected}
          color="text-destructive bg-destructive/15"
        />
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>سجل الطلبات</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center py-8 text-muted-foreground">جارٍ التحميل...</p>
          ) : rows.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">لا توجد طلبات حتى الآن</p>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <LeaveCard
                  key={r.id}
                  row={r}
                  profile={profiles[r.user_id]}
                  isAdmin={isAdmin}
                  isOwn={r.user_id === user?.id}
                  onDelete={() => deleteLeave(r.id)}
                  onReview={(status, notes) => review(r.id, status, notes)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <Card className="glass-card">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="font-bold text-2xl">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function LeaveCard({
  row,
  profile,
  isAdmin,
  isOwn,
  onDelete,
  onReview,
}: {
  row: LeaveRow;
  profile?: { full_name: string | null; email: string | null };
  isAdmin: boolean;
  isOwn: boolean;
  onDelete: () => void;
  onReview: (status: "approved" | "rejected", notes?: string) => void;
}) {
  const [showReview, setShowReview] = useState(false);
  const [notes, setNotes] = useState("");

  const days =
    Math.floor(
      (new Date(row.end_date).getTime() - new Date(row.start_date).getTime()) /
        (1000 * 60 * 60 * 24)
    ) + 1;

  const statusVariant: Record<LeaveStatus, string> = {
    pending: "bg-warning/20 text-warning border-warning/30",
    approved: "bg-success/20 text-success border-success/30",
    rejected: "bg-destructive/20 text-destructive border-destructive/30",
  };

  return (
    <div className="p-4 rounded-lg border border-border bg-card/40 hover:bg-card/70 transition-colors">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="gap-1">
              <CalendarIcon className="w-3 h-3" />
              {TYPE_LABEL[row.leave_type]}
            </Badge>
            <Badge className={statusVariant[row.status]}>{STATUS_LABEL[row.status]}</Badge>
            <span className="text-xs text-muted-foreground">{days} يوم</span>
            {isAdmin && profile && (
              <Badge variant="outline" className="text-[10px]">
                {profile.full_name || profile.email}
              </Badge>
            )}
          </div>
          <p className="text-sm font-semibold mt-2">
            من {new Date(row.start_date).toLocaleDateString("ar-EG")} إلى{" "}
            {new Date(row.end_date).toLocaleDateString("ar-EG")}
          </p>
          {row.reason && (
            <p className="text-sm text-muted-foreground mt-1">السبب: {row.reason}</p>
          )}
          {row.admin_notes && (
            <p className="text-xs mt-2 p-2 rounded bg-muted/40 flex gap-1">
              <MessageSquare className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>{row.admin_notes}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isAdmin && row.status === "pending" && (
            <>
              {!showReview ? (
                <>
                  <Button
                    size="sm"
                    onClick={() => onReview("approved")}
                    className="bg-success hover:bg-success/90 text-success-foreground gap-1"
                  >
                    <CheckCircle2 className="w-4 h-4" /> قبول
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowReview(true)}
                    className="gap-1"
                  >
                    <XCircle className="w-4 h-4" /> رفض
                  </Button>
                </>
              ) : (
                <div className="flex gap-1 items-center">
                  <Input
                    placeholder="سبب الرفض..."
                    className="h-8 w-40"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => onReview("rejected", notes)}
                  >
                    تأكيد
                  </Button>
                </div>
              )}
            </>
          )}
          {isOwn && row.status === "pending" && (
            <Button size="icon" variant="ghost" onClick={onDelete}>
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function NewLeaveDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const [type, setType] = useState<LeaveType>("casual");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!user) return;
    if (!start || !end) return toast.error("اختر التواريخ");
    if (new Date(end) < new Date(start)) return toast.error("تاريخ النهاية قبل البداية");
    setSaving(true);
    const { error } = await supabase.from("leave_requests").insert({
      user_id: user.id,
      leave_type: type,
      start_date: start,
      end_date: end,
      reason: reason || null,
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("تم إرسال الطلب ✓");
      onSaved();
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>طلب إجازة جديد</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>نوع الإجازة</Label>
          <Select value={type} onValueChange={(v) => setType(v as LeaveType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(TYPE_LABEL) as LeaveType[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {TYPE_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>من</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label>إلى</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>السبب (اختياري)</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="اكتب سبب الإجازة..."
          />
        </div>
      </div>
      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose}>
          إلغاء
        </Button>
        <Button onClick={submit} disabled={saving} className="gradient-primary">
          {saving ? "جارٍ الإرسال..." : "إرسال الطلب"}
        </Button>
      </DialogFooter>
    </>
  );
}
