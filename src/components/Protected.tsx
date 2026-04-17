import { Navigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "./AppShell";

export function Protected({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, loading, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" />;
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
