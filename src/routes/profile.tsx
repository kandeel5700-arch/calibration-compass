import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Protected } from "@/components/Protected";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { User as UserIcon, Mail, Shield, Save, KeyRound, Wallet } from "lucide-react";

export const Route = createFileRoute("/profile")({
  component: () => (
    <Protected>
      <ProfilePage />
    </Protected>
  ),
});

function ProfilePage() {
  const { user, isAdmin } = useAuth();
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [pwd1, setPwd1] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);
  const [dailyRate, setDailyRate] = useState("");
  const [savingRate, setSavingRate] = useState(false);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const [{ data: prof }, { data: sal }] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
        supabase.from("user_salary").select("daily_rate").eq("user_id", user.id).maybeSingle(),
      ]);
      setFullName(prof?.full_name ?? "");
      setDailyRate(sal?.daily_rate != null ? String(sal.daily_rate) : "0");
      setLoading(false);
    })();
  }, [user?.id]);

  async function saveDailyRate() {
    if (!user) return;
    const val = parseFloat(dailyRate);
    if (Number.isNaN(val) || val < 0) return toast.error("قيمة غير صالحة");
    setSavingRate(true);
    const { error } = await supabase
      .from("user_salary")
      .upsert({ user_id: user.id, daily_rate: val }, { onConflict: "user_id" });
    setSavingRate(false);
    if (error) toast.error(error.message);
    else toast.success("تم حفظ الأجر اليومي ✓");
  }

  async function saveName() {
    if (!user) return;
    setSavingName(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName })
      .eq("user_id", user.id);
    setSavingName(false);
    if (error) toast.error(error.message);
    else toast.success("تم حفظ الاسم ✓");
  }

  async function changePassword() {
    if (pwd1.length < 6) return toast.error("كلمة المرور 6 أحرف على الأقل");
    if (pwd1 !== pwd2) return toast.error("كلمتا المرور غير متطابقتين");
    setSavingPwd(true);
    const { error } = await supabase.auth.updateUser({ password: pwd1 });
    setSavingPwd(false);
    if (error) toast.error(error.message);
    else {
      toast.success("تم تغيير كلمة المرور ✓");
      setPwd1("");
      setPwd2("");
    }
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto" dir="rtl">
      <Card className="glass-card border-primary/20">
        <CardContent className="p-6 flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center shadow-luxe">
            <UserIcon className="w-8 h-8 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold truncate">{fullName || user?.email}</h2>
            <p className="text-sm text-muted-foreground flex items-center gap-1 truncate">
              <Mail className="w-3 h-3" /> {user?.email}
            </p>
            <Badge variant="secondary" className="mt-2 gap-1">
              <Shield className="w-3 h-3" />
              {isAdmin ? "مدير النظام" : "مستخدم عادي"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>المعلومات الشخصية</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>الاسم الكامل</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={loading}
              placeholder="اكتب اسمك"
            />
          </div>
          <div>
            <Label>البريد الإلكتروني</Label>
            <Input value={user?.email ?? ""} disabled />
            <p className="text-[11px] text-muted-foreground mt-1">
              لا يمكن تغيير البريد الإلكتروني من هنا
            </p>
          </div>
          <Button onClick={saveName} disabled={savingName} className="gap-2 gradient-primary">
            <Save className="w-4 h-4" />
            {savingName ? "جارٍ الحفظ..." : "حفظ التغييرات"}
          </Button>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5" />
            تغيير كلمة المرور
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>كلمة المرور الجديدة</Label>
            <Input
              type="password"
              value={pwd1}
              onChange={(e) => setPwd1(e.target.value)}
              placeholder="6 أحرف على الأقل"
            />
          </div>
          <div>
            <Label>تأكيد كلمة المرور</Label>
            <Input
              type="password"
              value={pwd2}
              onChange={(e) => setPwd2(e.target.value)}
              placeholder="أعد كتابة كلمة المرور"
            />
          </div>
          <Button onClick={changePassword} disabled={savingPwd} variant="outline" className="gap-2">
            <KeyRound className="w-4 h-4" />
            {savingPwd ? "جارٍ التغيير..." : "تغيير كلمة المرور"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
