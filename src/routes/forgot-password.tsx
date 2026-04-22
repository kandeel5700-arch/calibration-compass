import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Loader2, Mail, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "sonner";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);
    if (error) {
      toast.error("فشل إرسال الرابط", { description: error.message });
    } else {
      setSent(true);
      toast.success("تم إرسال رابط إعادة التعيين إلى بريدك");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative" dir="rtl">
      <div className="absolute top-4 left-4"><ThemeToggle /></div>
      <div className="w-full max-w-md">
        <div className="glass-card rounded-2xl shadow-luxe p-8 md:p-10 animate-fade-up">
          <div className="flex flex-col items-center mb-8">
            <Logo size={64} />
            <h1 className="text-2xl font-bold text-gradient-primary mt-4">نسيت كلمة المرور؟</h1>
            <p className="text-sm text-muted-foreground mt-2 text-center">
              أدخل بريدك الإلكتروني وسنرسل لك رابطًا لإعادة تعيين كلمة المرور
            </p>
          </div>

          {sent ? (
            <div className="space-y-4 text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-success/10 flex items-center justify-center">
                <Mail className="w-8 h-8 text-success" />
              </div>
              <p className="font-semibold">تحقق من بريدك الإلكتروني</p>
              <p className="text-sm text-muted-foreground">
                أرسلنا رابط إعادة تعيين كلمة المرور إلى <span className="font-mono">{email}</span>
              </p>
              <Link to="/login">
                <Button variant="outline" className="w-full gap-2">
                  <ArrowRight className="w-4 h-4" /> العودة لتسجيل الدخول
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  dir="ltr"
                  className="text-left"
                  placeholder="you@example.com"
                />
              </div>
              <Button
                type="submit"
                disabled={submitting}
                className="w-full gradient-primary text-primary-foreground font-semibold shadow-luxe h-11 gap-2"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : (<><Mail className="w-4 h-4" /> إرسال رابط الإعادة</>)}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                <Link to="/login" className="text-primary hover:underline font-semibold">
                  العودة لتسجيل الدخول
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
