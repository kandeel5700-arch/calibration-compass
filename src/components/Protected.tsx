import { Navigate } from "@tanstack/react-router";
import { Loader2, Clock, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "./AppShell";
import { Button } from "./ui/button";

export function Protected({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, loading, isAdmin, isPending, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" />;

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-card rounded-2xl p-10 text-center max-w-md w-full shadow-luxe">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/20 flex items-center justify-center">
            <Clock className="w-8 h-8 text-amber-500" />
          </div>
          <h2 className="text-2xl font-bold mb-2">حسابك قيد المراجعة</h2>
          <p className="text-muted-foreground mb-6">
            تم تسجيل حسابك بنجاح وهو الآن بانتظار موافقة مدير النظام. سيتم تفعيل وصولك بمجرد الموافقة.
          </p>
          <Button onClick={signOut} variant="outline" className="gap-2">
            <LogOut className="w-4 h-4" /> تسجيل الخروج
          </Button>
        </div>
      </div>
    );
  }

  if (adminOnly && !isAdmin) {
    return (
      <AppShell>
        <div className="glass-card rounded-2xl p-10 text-center">
          <h2 className="text-xl font-bold mb-2">غير مصرح</h2>
          <p className="text-muted-foreground">هذه الصفحة متاحة لمدير النظام فقط.</p>
        </div>
      </AppShell>
    );
  }

  return <AppShell>{children}</AppShell>;
}
