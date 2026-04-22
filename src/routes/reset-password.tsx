import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect, type FormEvent } from "react";
import { Loader2, KeyRound, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Supabase parses the recovery hash automatically; wait for session
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    if (password !== confirm) {
      toast.error("كلمتا المرور غير متطابقتين");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      toast.error("فشل تحديث كلمة المرور", { description: error.message });
    } else {
      setDone(true);
      toast.success("تم تحديث كلمة المرور بنجاح");
      setTimeout(() => navigate({ to: "/" }), 1500);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative" dir="rtl">
      <div className="absolute top-4 left-4"><ThemeToggle /></div>
      <div className="w-full max-w-md">
        <div className="glass-card rounded-2xl shadow-luxe p-8 md:p-10 animate-fade-up">
          <div className="flex flex-col items-center mb-8">
            <Logo size={64} />
            <h1 className="text-2xl font-bold text-gradient-primary mt-4">كلمة مرور جديدة</h1>
            <p className="text-sm text-muted-foreground mt-2">اختر كلمة مرور قوية لحسابك</p>
          </div>

          {done ? (
            <div className="text-center space-y-3">
              <div className="w-16 h-16 mx-auto rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-success" />
              </div>
              <p className="font-semibold">تم تحديث كلمة المرور</p>
              <p className="text-sm text-muted-foreground">جارٍ تحويلك...</p>
            </div>
          ) : !ready ? (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
              <p className="text-sm text-muted-foreground mt-3">
                جارٍ التحقق من الرابط... إذا لم يعمل، اطلب رابطًا جديدًا.
              </p>
              <Link to="/forgot-password" className="text-primary hover:underline text-sm font-semibold mt-2 inline-block">
                طلب رابط جديد
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="password">كلمة المرور الجديدة</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">تأكيد كلمة المرور</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <Button
                type="submit"
                disabled={submitting}
                className="w-full gradient-primary text-primary-foreground font-semibold shadow-luxe h-11 gap-2"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : (<><KeyRound className="w-4 h-4" /> تحديث كلمة المرور</>)}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
