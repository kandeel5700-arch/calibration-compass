import { createFileRoute } from "@tanstack/react-router";
import { Protected } from "@/components/Protected";
import { AttendancePage } from "./attendance";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "الحضور والانصراف — UECC Survey" },
      { name: "description", content: "سجّل حضورك وانصرافك وتابع ساعات العمل والأوفر تايم والمستحقات." },
      { property: "og:title", content: "الحضور والانصراف — UECC Survey" },
      { property: "og:description", content: "سجّل حضورك وانصرافك وتابع ساعات العمل والأوفر تايم." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <Protected>
      <AttendancePage />
    </Protected>
  ),
});
