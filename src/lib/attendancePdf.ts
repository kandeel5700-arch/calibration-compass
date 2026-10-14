import logoUrl from "@/assets/uecc-logo.png";
import { downloadReport, reportColors, reportFilename, reportTime, type AttendanceReport } from "./attendanceReport";

export async function createAttendancePdf(report: AttendanceReport): Promise<Blob> {
  const [{ default: JsPDF }, { default: autoTable }, fontResponse] = await Promise.all([
    import("jspdf"), import("jspdf-autotable"), fetch("/fonts/Cairo-Regular.ttf"),
  ]);
  if (!fontResponse.ok) throw new Error("تعذر تحميل الخط العربي، حاول مرة أخرى");
  const bytes = new Uint8Array(await fontResponse.arrayBuffer());
  let font = "";
  for (let i = 0; i < bytes.length; i += 8192) font += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const pdf = new JsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  pdf.addFileToVFS("Cairo.ttf", btoa(font)); pdf.addFont("Cairo.ttf", "Cairo", "normal"); pdf.setFont("Cairo");
  pdf.setProperties({ title: "UECC Survey — تقرير الحضور والمستحقات", author: "UECC Survey", subject: `${report.from} — ${report.to}` });
  const colors = reportColors();
  const hex = (key: keyof typeof colors) => `#${colors[key]}`;
  const image = new Image(); image.src = logoUrl; await image.decode();
  const logo = document.createElement("canvas"); logo.width = image.naturalWidth; logo.height = image.naturalHeight;
  const ctx = logo.getContext("2d"); if (ctx) ctx.drawImage(image, 0, 0);
  const text = (s: string, x: number, y: number, size = 10, color: keyof typeof colors = "ink") => { pdf.setFontSize(size); pdf.setTextColor(hex(color)); pdf.text(s, x, y, { align: "right" }); };
  const number = (n: number) => n.toFixed(2);
  let pageTitle = "ملخص الموظفين";
  const header = () => {
    pdf.setFillColor(hex("paper")); pdf.rect(0, 0, 297, 210, "F");
    pdf.setFillColor(hex("brand")); pdf.rect(12, 12, 273, 1.4, "F");
    if (ctx) pdf.addImage(logo, "PNG", 13, 17, 22, 22);
    text("UECC Survey", 284, 24, 19, "brand");
    text(`تقرير الحضور والمستحقات | ${pageTitle}`, 284, 32, 12);
    text(`الفترة: ${report.from} إلى ${report.to}`, 284, 40, 10, "muted");
  };
  const table = (head: string[], body: (string | number)[][], startY: number, small = false) => {
    autoTable(pdf, {
      startY, margin: { left: 12, right: 12, top: 48, bottom: 19 },
      head: [head.slice().reverse()], body: body.map(r => r.slice().reverse()),
      styles: { font: "Cairo", fontStyle: "normal", fontSize: small ? 8 : 9, cellPadding: 2.5, halign: "right", valign: "middle", textColor: hex("ink"), lineColor: hex("line"), overflow: "linebreak" },
      headStyles: { fillColor: hex("brand"), textColor: hex("paper"), fontStyle: "normal" },
      alternateRowStyles: { fillColor: hex("stripe") },
      theme: "grid", rowPageBreak: "avoid", showHead: "everyPage",
      willDrawPage: () => header(),
    });
    return (pdf as typeof pdf & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY;
  };
  header();
  table(["الموظف", "أيام حضور", "ساعات العمل", "إضافي", "أجر العمل", "أجر الإضافي", "المستحقات", "جلسات مفتوحة"], report.employees.map(e => [e.name, e.attendanceDays, number(e.hours), number(e.overtime), number(e.regularPay), number(e.overtimePay), number(e.pay), e.openSessions]), 49);
  for (const e of report.employees) {
    pdf.addPage(); pageTitle = e.name; header();
    text(`البريد: ${e.profile.email || "غير مسجل"} | الأجر اليومي: ${number(e.dailyRate)} | أيام الحضور: ${e.attendanceDays}`, 284, 49, 9);
    text(`الساعات: ${number(e.hours)} | الإضافي: ${number(e.overtime)} | المستحقات: ${number(e.pay)} | التأخير: ${e.lateMinutes} دقيقة`, 284, 57, 9, "brand");
    const finalY = table(["التاريخ / اليوم", "الحالة", "الحضور", "الانصراف", "الساعات", "الإضافي", "أجر العمل", "أجر الإضافي", "المستحقات"], [
      ...e.days.map(d => [`${d.date}\n${d.day}`, d.status, d.checkIn, d.checkOut, number(d.hours), number(d.overtime), number(d.regularPay), number(d.overtimePay), number(d.pay)]),
      ["الإجمالي", `${e.attendanceDays} يوم حضور`, "—", "—", number(e.hours), number(e.overtime), number(e.regularPay), number(e.overtimePay), number(e.pay)],
    ], 63, true);
    let y = finalY + 10;
    if (y > 167) { pdf.addPage(); header(); y = 51; }
    text("مراجعة المدير: __________________       توقيع الموظف: __________________", 284, y, 10);
    pdf.addPage(); pageTitle = `${e.name} — تفاصيل الجلسات`; header();
    table(["التاريخ", "الحضور", "تاريخ الانصراف", "الانصراف", "الدوام المقرر", "التأخير (د)", "سعر الساعة", "ملاحظات"], e.days.flatMap(d => d.sessions.map(r => [d.date, reportTime(r.check_in), r.check_out ? new Date(r.check_out).toLocaleDateString("en-CA") : "غير مسجل", reportTime(r.check_out), `${d.scheduledStart} - ${d.scheduledEnd}`, r === d.sessions[0] ? d.lateMinutes : "—", number(d.hourlyRate), r.notes || "—"])), 49, true);
  }
  pdf.addPage(); pageTitle = "ملاحظات وقواعد التقرير"; header();
  table(["البند", "التفاصيل"], [
    ["مصدر البيانات", `سجلات UECC Survey والإعدادات والأجور الحالية وقت الإصدار: ${report.generatedAt}`],
    ["الإضافي", `يبدأ بعد ${report.settings.overtime_first_minutes} دقيقة، ثم بزيادات ${report.settings.overtime_step_minutes} دقيقة مكتملة وفق إعدادات الحضور.`],
    ["الساعات", "أرقام عشرية: 1.50 = ساعة ونصف. الساعات قبل بدء الدوام لا تدخل في الحساب. كل جلسة تُحسب وفق قواعد التطبيق."],
    ["الجلسات المفتوحة", "لا يُحتسب للحضور دون انصراف ساعات أو مستحقات حتى إغلاق الجلسة."],
    ["الأيام بلا سجل", "لا يوجد سجل لا تعني غيابًا مؤكدًا. الأيام القادمة وأيام الراحة موضحة بشكل منفصل."],
    ["الأجور", "حسب الأجر اليومي الحالي، دون افتراض عملة أو إضافة خصومات غير مسجلة. هذا تقرير مراجعة وليس إثبات صرف."],
    ["التوقيت", `التوقيت المحلي: ${Intl.DateTimeFormat().resolvedOptions().timeZone}. الجلسات التي تعبر منتصف الليل تُنسب ليوم الحضور.`],
  ], 49);
  const count = pdf.getNumberOfPages();
  for (let i = 1; i <= count; i++) {
    pdf.setPage(i); pdf.setDrawColor(hex("line")); pdf.line(12, 193, 285, 193);
    text(`UECC Survey | ${i} / ${count}`, 284, 200, 8, "muted");
    text("سري — بيانات الموظفين", 86, 200, 8, "muted");
  }
  return pdf.output("blob");
}

export async function exportAttendancePdf(report: AttendanceReport) {
  downloadReport(await createAttendancePdf(report), reportFilename(report, "pdf"));
}