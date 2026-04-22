import { createFileRoute, useNavigate, Navigate, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Loader2, LogIn } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { signIn, user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (user) return <Navigate to="/" />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (error) {
      toast.error("فشل تسجيل الدخول", { description: "تحقق من البريد وكلمة المرور" });
    } else {
      toast.success("تم تسجيل الدخول بنجاح");
      navigate({ to: "/" });
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <div className="absolute top-4 left-4"><ThemeToggle /></div>
      <div className="w-full max-w-md">
        <div className="glass-card rounded-2xl shadow-luxe p-8 md:p-10 animate-fade-up">
          <div className="flex flex-col items-center mb-8">
            <Logo size={72} />
            <h1 className="text-2xl font-bold text-gradient-primary mt-4">UECC Survey</h1>
            <p className="text-sm text-muted-foreground mt-2">سجّل الدخول للوصول إلى النظام</p>
          </div>

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
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">كلمة المرور</Label>
                <Link to="/forgot-password" className="text-xs text-primary hover:underline font-semibold">
                  نسيت كلمة المرور؟
                </Link>
              </div>
              <Input
                id="password"
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
              className="w-full gradient-primary text-primary-foreground font-semibold shadow-luxe h-11 gap-2"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : (<><LogIn className="w-4 h-4" /> تسجيل الدخول</>)}
            </Button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">أو</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <GoogleAuthButton label="تسجيل الدخول بـ Google" />

          <p className="text-xs text-muted-foreground mt-6 text-center">
            ليس لديك حساب؟{" "}
            <Link to="/signup" className="text-primary hover:underline font-semibold">إنشاء حساب</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
