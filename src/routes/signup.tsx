import { createFileRoute, useNavigate, Navigate, Link } from "@tanstack/react-router";
import { useState, useRef, type FormEvent } from "react";
import { Loader2, UserPlus, CheckCircle2, Camera, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [dailyRate, setDailyRate] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (user) return <Navigate to="/" />;

  function pickAvatar(file: File | null) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("الصورة كبيرة جداً (الحد الأقصى 5MB)");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("الملف ليس صورة");
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  function clearAvatar() {
    setAvatarFile(null);
    setAvatarPreview("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const redirectUrl = `${window.location.origin}/`;
    const rate = parseFloat(dailyRate);
    if (Number.isNaN(rate) || rate < 0) {
      setSubmitting(false);
      toast.error("الأجر اليومي غير صالح");
      return;
    }

    const { data: signUpData, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { full_name: fullName, daily_rate: rate },
      },
    });

    if (error) {
      setSubmitting(false);
      toast.error("فشل إنشاء الحساب", { description: error.message });
      return;
    }

    // Upload avatar (if any) — needs an authenticated session
    const newUserId = signUpData.user?.id;
    if (avatarFile && newUserId && signUpData.session) {
      try {
        const ext = avatarFile.name.split(".").pop() || "jpg";
        const path = `${newUserId}/avatar.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("avatars")
          .upload(path, avatarFile, { upsert: true, contentType: avatarFile.type });
        if (!upErr) {
          const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
          await supabase
            .from("profiles")
            .update({ avatar_url: pub.publicUrl })
            .eq("user_id", newUserId);
        }
      } catch {
        // non-blocking
      }
    }

    setSubmitting(false);
    setDone(true);
    toast.success("تم إنشاء الحساب", { description: "بانتظار موافقة المدير" });
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative">
        <div className="absolute top-4 left-4"><ThemeToggle /></div>
        <div className="w-full max-w-md glass-card rounded-2xl shadow-luxe p-8 text-center animate-fade-up">
          <div className="w-16 h-16 mx-auto rounded-full bg-success/20 flex items-center justify-center mb-4">
            <CheckCircle2 className="w-9 h-9 text-success" />
          </div>
          <h1 className="text-xl font-bold mb-2">تم إنشاء حسابك بنجاح</h1>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
            حسابك الآن قيد المراجعة من قِبَل المدير. ستتمكن من الدخول بمجرد الموافقة على طلبك.
          </p>
          <Button onClick={() => navigate({ to: "/login" })} className="gradient-primary text-primary-foreground w-full">
            الذهاب لتسجيل الدخول
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <div className="absolute top-4 left-4"><ThemeToggle /></div>
      <div className="w-full max-w-md glass-card rounded-2xl shadow-luxe p-8 animate-fade-up">
        <div className="flex flex-col items-center mb-6">
          <Logo size={64} />
          <h1 className="text-2xl font-bold text-gradient-primary mt-4">إنشاء حساب جديد</h1>
          <p className="text-xs text-muted-foreground mt-2 text-center leading-relaxed">
            بعد إنشاء حسابك سيتم مراجعته من قبل المدير قبل تفعيله.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Avatar picker */}
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-24 h-24 rounded-full border-2 border-dashed border-primary/40 bg-muted/30 flex items-center justify-center overflow-hidden hover:border-primary transition-colors"
              >
                {avatarPreview ? (
                  <img src={avatarPreview} alt="معاينة الصورة" className="w-full h-full object-cover" />
                ) : (
                  <Camera className="w-8 h-8 text-muted-foreground" />
                )}
              </button>
              {avatarPreview && (
                <button
                  type="button"
                  onClick={clearAvatar}
                  className="absolute -top-1 -left-1 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-md"
                  aria-label="إزالة الصورة"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => pickAvatar(e.target.files?.[0] ?? null)}
            />
            <p className="text-[11px] text-muted-foreground">صورة شخصية (اختياري)</p>
          </div>

          <div className="space-y-2">
            <Label>الاسم الكامل</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>البريد الإلكتروني</Label>
            <Input
              type="email"
              dir="ltr"
              className="text-left"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>كلمة المرور (6 أحرف على الأقل)</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <div className="space-y-2">
            <Label>الأجر اليومي (بالجنيه)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={dailyRate}
              onChange={(e) => setDailyRate(e.target.value)}
              required
              placeholder="مثال: 400"
            />
            <p className="text-[11px] text-muted-foreground">
              يمكنك تعديله لاحقاً من صفحة الملف الشخصي
            </p>
          </div>
          <Button
            type="submit"
            disabled={submitting}
            className="w-full gradient-primary text-primary-foreground h-11 font-semibold shadow-luxe gap-2"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : (<><UserPlus className="w-4 h-4" /> إنشاء الحساب</>)}
          </Button>
        </form>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">أو</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <GoogleAuthButton label="إنشاء حساب بـ Google" />

        <p className="text-xs text-muted-foreground mt-6 text-center">
          لديك حساب بالفعل؟{" "}
          <Link to="/login" className="text-primary hover:underline font-semibold">تسجيل الدخول</Link>
        </p>
      </div>
    </div>
  );
}
