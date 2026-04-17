import { Outlet, createRootRoute, HeadContent, Scripts, Link } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/useAuth";
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
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "جرد أجهزة المساحة" },
      { name: "description", content: "نظام احترافي لإدارة وجرد أجهزة المساحة وتتبع المعايرات" },
      { property: "og:title", content: "جرد أجهزة المساحة" },
      { name: "twitter:title", content: "جرد أجهزة المساحة" },
      { property: "og:description", content: "نظام احترافي لإدارة وجرد أجهزة المساحة وتتبع المعايرات" },
      { name: "twitter:description", content: "نظام احترافي لإدارة وجرد أجهزة المساحة وتتبع المعايرات" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/42a3d885-e255-49a7-841b-ac50ce8acef5/id-preview-17ddf952--62a0c63c-ce00-43b7-8502-545142fa925d.lovable.app-1776432542477.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/42a3d885-e255-49a7-841b-ac50ce8acef5/id-preview-17ddf952--62a0c63c-ce00-43b7-8502-545142fa925d.lovable.app-1776432542477.png" },
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
  return (
    <AuthProvider>
      <Outlet />
      <Toaster richColors position="top-center" />
    </AuthProvider>
  );
}
