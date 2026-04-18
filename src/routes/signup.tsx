import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState, useEffect, type FormEvent } from "react";
import { Compass, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({
  component: SignupFirstPage,
});

function SignupFirstPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [hasUsers, setHasUsers] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Check if any user exists by counting profiles
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .then(({ count }) => setHasUsers((count ?? 0) > 0));
  }, []);

  if (user) return <Navigate to="/" />;

  if (hasUsers === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (hasUsers) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-card rounded-2xl shadow-luxe p-8 max-w-md text-center">
          <h1 className="text-xl font-bold mb-3">تم إنشاء حساب المدير مسبقاً</h1>
          <p className="text-sm text-muted-foreground mb-6">
            يمكنك تسجيل الدخول مباشرة. إضافة مستخدمين جدد تتم من قبل المدير من داخل النظام.
          </p>
          <Button onClick={() => navigate({ to: "/login" })} className="gradient-primary text-primary-foreground">
            الذهاب لتسجيل الدخول
          </Button>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { full_name: fullName },
      },
    });
    setSubmitting(false);
    if (error) {
      toast.error("فشل إنشاء الحساب", { description: error.message });
      return;
    }
    toast.success("تم إنشاء حساب المدير بنجاح", { description: "يمكنك الآن تسجيل الدخول" });
    navigate({ to: "/login" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md glass-card rounded-2xl shadow-luxe p-8 animate-fade-up">
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center shadow-luxe mb-3">
            <Compass className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-gradient-primary">إنشاء حساب المدير</h1>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            هذه أول مرة تستخدم فيها النظام. سيتم منح هذا الحساب صلاحيات مدير النظام.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
          <Button
            type="submit"
            disabled={submitting}
            className="w-full gradient-primary text-primary-foreground h-11 font-semibold shadow-luxe"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "إنشاء حساب المدير"}
          </Button>
        </form>
      </div>
    </div>
  );
}
