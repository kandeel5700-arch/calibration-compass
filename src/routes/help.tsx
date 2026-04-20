import { createFileRoute } from "@tanstack/react-router";
import { Protected } from "@/components/Protected";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  HelpCircle,
  Boxes,
  Clock,
  Calendar,
  User as UserIcon,
  Shield,
  Mail,
} from "lucide-react";

export const Route = createFileRoute("/help")({
  component: () => (
    <Protected>
      <HelpPage />
    </Protected>
  ),
});

const SECTIONS = [
  {
    icon: Boxes,
    title: "إدارة الأجهزة",
    items: [
      {
        q: "إزاي أضيف جهاز جديد؟",
        a: "ادخل صفحة الأجهزة، اضغط زر «إضافة جهاز». لازم تكون أدمين. املأ الاسم، الرقم التسلسلي، تاريخ آخر معايرة ومدة الصلاحية بالأشهر، والنظام هيحسب تاريخ المعايرة القادمة تلقائياً.",
      },
      {
        q: "إيه الفرق بين «سليم» و«قارب الانتهاء» و«منتهي»؟",
        a: "سليم: باقي على المعايرة أكثر من 30 يوم. قارب الانتهاء: باقي 30 يوم أو أقل. منتهي: عدّى تاريخ المعايرة القادمة.",
      },
      {
        q: "هل أقدر أرفع صورة للجهاز؟",
        a: "نعم، عند إضافة أو تعديل الجهاز يمكنك رفع صورة وستُعرض في كرت الجهاز.",
      },
    ],
  },
  {
    icon: Clock,
    title: "الحضور والانصراف",
    items: [
      {
        q: "إزاي أسجل حضوري؟",
        a: "ادخل صفحة «الحضور والانصراف»، اضغط «تسجيل الحضور الآن». لما تخلص الشغل اضغط «تسجيل الانصراف».",
      },
      {
        q: "إزاي بيتحسب الأوفر تايم؟",
        a: "اليوم القياسي 8 ساعات. أول ساعة إضافية لازم تكتمل بالكامل (أقل من 60 دقيقة = صفر). بعد إكمال الساعة الأولى، الدقايق الإضافية تتحسب بالنسبة. سعر الساعة الإضافية = الأجر اليومي ÷ 8.",
      },
      {
        q: "هل أقدر أعدّل وقت الحضور بعد التسجيل؟",
        a: "لا، فقط الأدمين يقدر يعدّل أو يحذف الجلسات.",
      },
      {
        q: "الأسبوع بيبدأ إمتى؟",
        a: "الأسبوع يبدأ السبت وينتهي الجمعة، والإجمالي يتقفّل أسبوعياً.",
      },
    ],
  },
  {
    icon: Calendar,
    title: "الإجازات",
    items: [
      {
        q: "إزاي أطلب إجازة؟",
        a: "ادخل صفحة «الإجازات»، اضغط «طلب إجازة جديد»، حدد النوع والتواريخ والسبب. الطلب هيوصل للأدمين للموافقة.",
      },
      {
        q: "هل أقدر ألغي طلبي؟",
        a: "نعم، طالما الطلب لسه «قيد المراجعة» تقدر تحذفه. بعد الموافقة أو الرفض ميقدرش يتحذف.",
      },
    ],
  },
  {
    icon: UserIcon,
    title: "الحساب الشخصي",
    items: [
      {
        q: "إزاي أغير اسمي أو كلمة المرور؟",
        a: "من قائمة «الملف الشخصي» تقدر تعدل اسمك الكامل وكلمة المرور.",
      },
      {
        q: "ليه حسابي «قيد المراجعة»؟",
        a: "لما تسجل حساب جديد بيكون في انتظار موافقة الأدمين قبل ما تقدر تستخدم النظام.",
      },
    ],
  },
  {
    icon: Shield,
    title: "الصلاحيات",
    items: [
      {
        q: "إيه الفرق بين الأدمين والمستخدم العادي؟",
        a: "الأدمين يقدر يضيف ويعدل ويحذف الأجهزة، يدير المستخدمين والإجازات واليوميات، ويعدّل سجلات الحضور. المستخدم العادي يشوف الأجهزة، يسجل حضوره وانصرافه، ويطلب إجازاته.",
      },
    ],
  },
];

function HelpPage() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto" dir="rtl">
      <Card className="glass-card border-primary/20">
        <CardContent className="p-6 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center shadow-luxe">
            <HelpCircle className="w-7 h-7 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">مركز المساعدة</h1>
            <p className="text-sm text-muted-foreground mt-1">
              دليل استخدام نظام UECC Survey والإجابة على الأسئلة الشائعة
            </p>
          </div>
        </CardContent>
      </Card>

      {SECTIONS.map((sec) => {
        const Icon = sec.icon;
        return (
          <Card key={sec.title} className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon className="w-5 h-5 text-primary" />
                {sec.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {sec.items.map((it, i) => (
                  <AccordionItem key={i} value={`${sec.title}-${i}`}>
                    <AccordionTrigger className="text-right">{it.q}</AccordionTrigger>
                    <AccordionContent className="text-muted-foreground leading-relaxed">
                      {it.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        );
      })}

      <Card className="glass-card border-primary/20">
        <CardContent className="p-5 flex items-center gap-3">
          <Mail className="w-5 h-5 text-primary" />
          <div>
            <p className="font-semibold">محتاج مساعدة إضافية؟</p>
            <p className="text-sm text-muted-foreground">
              تواصل مع مدير النظام للحصول على دعم سريع
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
