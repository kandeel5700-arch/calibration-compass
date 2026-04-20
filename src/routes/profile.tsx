import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Protected } from "@/components/Protected";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { User as UserIcon, Mail, Shield, Save, KeyRound, Wallet, Camera, Loader2, Trash2 } from "lucide-react";

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
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [pwd1, setPwd1] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);
  const [dailyRate, setDailyRate] = useState("");
  const [savingRate, setSavingRate] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const [{ data: prof }, { data: sal }] = await Promise.all([
        supabase.from("profiles").select("full_name, avatar_url").eq("user_id", user.id).maybeSingle(),
        supabase.from("user_salary").select("daily_rate").eq("user_id", user.id).maybeSingle(),
      ]);
      setFullName(prof?.full_name ?? "");
      setAvatarUrl(prof?.avatar_url ?? "");
      setDailyRate(sal?.daily_rate != null ? String(sal.daily_rate) : "0");
      setLoading(false);
    })();
  }, [user?.id]);

  async function handleAvatarChange(file: File | null) {
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("الصورة كبيرة جداً (الحد الأقصى 5MB)");
    if (!file.type.startsWith("image/")) return toast.error("الملف ليس صورة");

    setUploadingAvatar(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/avatar.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (upErr) {
      setUploadingAvatar(false);
      return toast.error("فشل رفع الصورة", { description: upErr.message });
    }

    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    const cacheBusted = `${pub.publicUrl}?t=${Date.now()}`;
    const { error: updErr } = await supabase
      .from("profiles")
      .update({ avatar_url: pub.publicUrl })
      .eq("user_id", user.id);

    setUploadingAvatar(false);
    if (updErr) return toast.error(updErr.message);
    setAvatarUrl(cacheBusted);
    toast.success("تم تحديث الصورة ✓");
  }

  async function removeAvatar() {
    if (!user || !avatarUrl) return;
    setUploadingAvatar(true);
    // Try common extensions
    await supabase.storage.from("avatars").remove([
      `${user.id}/avatar.jpg`,
      `${user.id}/avatar.jpeg`,
      `${user.id}/avatar.png`,
      `${user.id}/avatar.webp`,
    ]);
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: null })
      .eq("user_id", user.id);
    setUploadingAvatar(false);
    if (error) return toast.error(error.message);
    setAvatarUrl("");
    toast.success("تم حذف الصورة");
  }

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
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploadingAvatar}
              className="w-20 h-20 rounded-2xl gradient-primary flex items-center justify-center shadow-luxe overflow-hidden relative group"
              aria-label="تغيير الصورة"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="صورة البروفايل" className="w-full h-full object-cover" />
              ) : (
                <UserIcon className="w-10 h-10 text-primary-foreground" />
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                {uploadingAvatar ? (
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                ) : (
                  <Camera className="w-6 h-6 text-white" />
                )}
              </div>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleAvatarChange(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold truncate">{fullName || user?.email}</h2>
            <p className="text-sm text-muted-foreground flex items-center gap-1 truncate">
              <Mail className="w-3 h-3" /> {user?.email}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Badge variant="secondary" className="gap-1">
                <Shield className="w-3 h-3" />
                {isAdmin ? "مدير النظام" : "مستخدم عادي"}
              </Badge>
              {avatarUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={removeAvatar}
                  disabled={uploadingAvatar}
                  className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-3 h-3 ml-1" />
                  حذف الصورة
                </Button>
              )}
            </div>
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

      <Card className="glass-card border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            الأجر اليومي
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>قيمة الأجر اليومي (بالجنيه)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={dailyRate}
              onChange={(e) => setDailyRate(e.target.value)}
              disabled={loading}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              ساعة العمل العادية = الأجر اليومي ÷ 8 · سعر الساعة الإضافية = نفس سعر الساعة العادية
            </p>
          </div>
          <Button onClick={saveDailyRate} disabled={savingRate} className="gap-2 gradient-primary">
            <Save className="w-4 h-4" />
            {savingRate ? "جارٍ الحفظ..." : "حفظ الأجر اليومي"}
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
