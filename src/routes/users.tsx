import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { UserPlus, Trash2, Shield, User as UserIcon, Clock, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Protected } from "@/components/Protected";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/users")({
  component: () => (
    <Protected adminOnly>
      <UsersPage />
    </Protected>
  ),
});

interface Profile {
  user_id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
}

type AppRole = "admin" | "viewer" | "pending";

function UsersPage() {
  const { user: currentUser } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<Record<string, AppRole>>({});
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [newPwd, setNewPwd] = useState("");

  // Add user form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"admin" | "viewer">("viewer");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const [{ data: prof }, { data: r }] = await Promise.all([
      supabase.from("profiles").select("user_id,full_name,email,created_at").order("created_at"),
      supabase.from("user_roles").select("user_id,role"),
    ]);
    setProfiles((prof ?? []) as Profile[]);
    const map: Record<string, AppRole> = {};
    (r ?? []).forEach((row: { user_id: string; role: AppRole }) => {
      // admin wins if user has multiple roles
      if (map[row.user_id] !== "admin") map[row.user_id] = row.role;
    });
    setRoles(map);
    setLoading(false);
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/`,
      },
    });
    if (error) {
      toast.error("فشل إنشاء الحساب", { description: error.message });
      setSubmitting(false);
      return;
    }
    // Admin-created accounts are pre-approved with chosen role
    if (data.user) {
      await supabase.from("user_roles").delete().eq("user_id", data.user.id);
      await supabase.from("user_roles").insert({ user_id: data.user.id, role });
    }
    toast.success("تم إنشاء المستخدم");
    setAddOpen(false);
    setEmail("");
    setPassword("");
    setFullName("");
    setRole("viewer");
    setSubmitting(false);
    setTimeout(load, 800);
  }

  async function changeRole(userId: string, newRole: AppRole) {
    if (userId === currentUser?.id) {
      toast.error("لا يمكنك تغيير صلاحياتك الخاصة");
      return;
    }
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole });
    if (error) toast.error("فشل التحديث", { description: error.message });
    else toast.success("تم تحديث الصلاحية");
    load();
  }

  async function approve(userId: string, asRole: "viewer" | "admin" = "viewer") {
    await changeRole(userId, asRole);
    toast.success("تمت الموافقة على الحساب");
  }

  async function reject(userId: string) {
    if (!confirm("رفض هذا الطلب وحذف بيانات المستخدم؟")) return;
    await supabase.from("user_roles").delete().eq("user_id", userId);
    await supabase.from("profiles").delete().eq("user_id", userId);
    toast.success("تم رفض الطلب");
    load();
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    if (error) toast.error("فشل تغيير كلمة المرور", { description: error.message });
    else {
      toast.success("تم تغيير كلمة المرور");
      setPwdOpen(false);
      setNewPwd("");
    }
  }

  const pending = profiles.filter((p) => roles[p.user_id] === "pending");
  const active = profiles.filter((p) => roles[p.user_id] !== "pending");

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">المستخدمون</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {profiles.length} مستخدم • {pending.length} في انتظار الموافقة
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPwdOpen(true)}>تغيير كلمة المرور</Button>
          <Button onClick={() => setAddOpen(true)} className="gap-2 gradient-primary text-primary-foreground shadow-luxe">
            <UserPlus className="w-4 h-4" /> إضافة مستخدم
          </Button>
        </div>
      </header>

      {/* Pending approvals */}
      {pending.length > 0 && (
        <div className="glass-card rounded-2xl overflow-hidden shadow-card border-2 border-amber-500/40">
          <div className="bg-amber-500/10 px-4 py-3 flex items-center gap-2 border-b border-amber-500/30">
            <Clock className="w-5 h-5 text-amber-500" />
            <h2 className="font-bold text-amber-600 dark:text-amber-400">طلبات تسجيل بانتظار الموافقة ({pending.length})</h2>
          </div>
          <div className="divide-y divide-border">
            {pending.map((p) => (
              <div key={p.user_id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                    <UserIcon className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-semibold">{p.full_name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground" dir="ltr">{p.email}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => approve(p.user_id, "viewer")} className="gap-1">
                    <Check className="w-4 h-4" /> موافقة كمشاهد
                  </Button>
                  <Button size="sm" onClick={() => approve(p.user_id, "admin")} className="gap-1 gradient-primary text-primary-foreground">
                    <Shield className="w-4 h-4" /> موافقة كمدير
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => reject(p.user_id)} className="gap-1">
                    <X className="w-4 h-4" /> رفض
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="glass-card rounded-2xl overflow-hidden shadow-card">
        {loading ? (
          <div className="p-10 text-center text-muted-foreground">جاري التحميل...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="bg-secondary/50 text-muted-foreground">
                <tr>
                  <th className="p-3 text-right font-semibold">الاسم</th>
                  <th className="p-3 text-right font-semibold">البريد</th>
                  <th className="p-3 text-right font-semibold">الصلاحية</th>
                  <th className="p-3 text-right font-semibold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {active.map((p) => {
                  const r = (roles[p.user_id] ?? "viewer") as "admin" | "viewer";
                  const isCurrent = p.user_id === currentUser?.id;
                  return (
                    <tr key={p.user_id} className="border-t border-border">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {r === "admin" ? <Shield className="w-4 h-4 text-primary" /> : <UserIcon className="w-4 h-4 text-muted-foreground" />}
                          <span className="font-medium">{p.full_name ?? "—"}</span>
                          {isCurrent && <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full">أنت</span>}
                        </div>
                      </td>
                      <td className="p-3 text-muted-foreground">{p.email}</td>
                      <td className="p-3">
                        <Select value={r} onValueChange={(v) => changeRole(p.user_id, v as AppRole)} disabled={isCurrent}>
                          <SelectTrigger className="w-32 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">مدير</SelectItem>
                            <SelectItem value="viewer">مشاهدة</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-3">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={isCurrent}
                          onClick={async () => {
                            if (!confirm("حذف بيانات هذا المستخدم؟ (سيتم حذف الـprofile فقط)")) return;
                            const { error } = await supabase.from("profiles").delete().eq("user_id", p.user_id);
                            if (error) toast.error(error.message);
                            else { toast.success("تم الحذف"); load(); }
                          }}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add user */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة مستخدم جديد</DialogTitle>
            <DialogDescription>الحسابات التي ينشئها الأدمن مفعّلة مباشرة بدون موافقة.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-2">
              <Label>الاسم الكامل</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>البريد الإلكتروني</Label>
              <Input type="email" dir="ltr" className="text-left" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>كلمة المرور المؤقتة (6+)</Label>
              <Input type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>الصلاحية</Label>
              <Select value={role} onValueChange={(v) => setRole(v as "admin" | "viewer")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">مشاهدة فقط</SelectItem>
                  <SelectItem value="admin">مدير النظام</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={submitting} className="gradient-primary text-primary-foreground">
                {submitting ? "جاري الإنشاء..." : "إنشاء"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Change password */}
      <Dialog open={pwdOpen} onOpenChange={setPwdOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تغيير كلمة المرور</DialogTitle>
            <DialogDescription>تغيير كلمة المرور الخاصة بك.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label>كلمة المرور الجديدة</Label>
              <Input type="password" minLength={6} value={newPwd} onChange={(e) => setNewPwd(e.target.value)} required />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPwdOpen(false)}>إلغاء</Button>
              <Button type="submit" className="gradient-primary text-primary-foreground">حفظ</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
