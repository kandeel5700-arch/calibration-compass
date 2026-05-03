import { Outlet, createRootRoute, HeadContent, Scripts, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { SplashScreen } from "@/components/SplashScreen";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center glass-card rounded-2xl p-10 shadow-luxe">
        <h1 className="text-7xl font-bold text-gradient-primary">404</h1>
        <h2 className="mt-4 text-xl font-semibold">الصفحة غير موجودة</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          الصفحة التي تبحث عنها غير موجودة أو تم نقلها.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-lg gradient-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-luxe"
        >
          العودة للرئيسية
        </Link>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#0d1f2a" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { title: "UECC Survey" },
      { name: "description", content: "UECC Survey — نظام احترافي لإدارة وجرد أجهزة المساحة وتتبع المعايرات" },
      { property: "og:title", content: "UECC Survey" },
      { name: "twitter:title", content: "UECC Survey" },
      { property: "og:description", content: "UECC Survey — نظام احترافي لإدارة وجرد أجهزة المساحة وتتبع المعايرات" },
      { name: "twitter:description", content: "UECC Survey — نظام احترافي لإدارة وجرد أجهزة المساحة وتتبع المعايرات" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const [showSplash, setShowSplash] = useState(() => {
    if (typeof window === "undefined") return false;
    return !sessionStorage.getItem("uecc-splash-shown");
  });

  useEffect(() => {
    if (!showSplash) return;
    sessionStorage.setItem("uecc-splash-shown", "1");
  }, [showSplash]);

  return (
    <ThemeProvider>
      <AuthProvider>
        {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
        <Outlet />
        <Toaster richColors position="top-center" />
      </AuthProvider>
    </ThemeProvider>
  );
}
