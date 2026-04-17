import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Compass, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="glass-card rounded-2xl shadow-luxe p-8 md:p-10 animate-fade-up">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center shadow-luxe mb-4">
              <Compass className="w-8 h-8 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-gradient-primary">جرد أجهزة المساحة</h1>
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
                placeholder="admin@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
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
              className="w-full gradient-primary text-primary-foreground font-semibold shadow-luxe h-11"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "تسجيل الدخول"}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground mt-6 text-center leading-relaxed">
            لا يوجد تسجيل ذاتي. أول حساب يتم إنشاؤه عبر صفحة التسجيل الأولى يصبح مدير النظام،
            ثم يمكنه إضافة باقي المستخدمين.
          </p>
          <div className="mt-3 text-center">
            <a href="/signup-first" className="text-xs text-primary hover:underline">
              إنشاء أول حساب مدير
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
