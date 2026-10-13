import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const Input = z.object({
  accessToken: z.string().min(10),
  employeeName: z.string().max(200),
  periodLabel: z.string().max(200),
  records: z.string().max(60000),
});

export const analyzeAttendance = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const url = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const sb = createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${data.accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: u, error: ue } = await sb.auth.getUser(data.accessToken);
    if (ue || !u.user) return { ok: false as const, error: "غير مصرح" };
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
    if (!isAdmin) return { ok: false as const, error: "هذه الميزة للمدير فقط" };

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ok: false as const, error: "مفتاح الذكاء الاصطناعي غير مُعد" };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        instructions:
          "أنت محلل موارد بشرية. حلّل سجلات حضور الموظف واكتب تقريرًا بالعربية بصيغة Markdown بالأقسام: ## ملخص عام، ## أنماط التأخير، ## الساعات الإضافية غير المعتادة، ## ملاحظات أخرى، ## إجراءات مقترحة. استخدم أرقامًا وتواريخ محددة من البيانات، وكن موجزًا وعمليًا.",
        input: `الموظف: ${data.employeeName}\nالفترة: ${data.periodLabel}\nالسجلات (التاريخ | اليوم | بداية الدوام المقررة | الحضور | الانصراف | الساعات | الإضافي):\n${data.records}`,
      }),
    });
    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => "");
      let msg = `فشل التحليل (${res.status})`;
      if (res.status === 429) msg = "تم تجاوز حد الطلبات، حاول بعد قليل";
      if (res.status === 402) msg = "رصيد الذكاء الاصطناعي غير كافٍ";
      try { const j = JSON.parse(t); if (j?.error?.message || j?.message) msg += `: ${j.error?.message ?? j.message}`; } catch {}
      return { ok: false as const, error: msg };
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload);
          if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
          if (ev.type === "error" || ev.type === "response.failed")
            return { ok: false as const, error: ev.error?.message ?? ev.response?.error?.message ?? "فشل التحليل" };
        } catch {}
      }
    }
    if (!text.trim()) return { ok: false as const, error: "لم يُرجع النموذج أي نتيجة" };
    return { ok: true as const, text };
  });
