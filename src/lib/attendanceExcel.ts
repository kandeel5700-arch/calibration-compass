import type ExcelJS from "exceljs";
import { downloadReport, reportColors, reportFilename, reportTime, type AttendanceReport } from "./attendanceReport";

export async function createAttendanceExcel(report: AttendanceReport): Promise<Blob> {
  const { default: Excel } = await import("exceljs");
  const wb = new Excel.Workbook();
  wb.creator = "UECC Survey"; wb.created = new Date(); wb.title = "تقرير الحضور والمستحقات";
  wb.calcProperties.fullCalcOnLoad = true;
  const colors = reportColors();
  const numberFormat = '#,##0.00;(#,##0.00);"—"';
  const styleSheet = (sheet: ExcelJS.Worksheet, widths: number[], headerRow: number) => {
    sheet.views = [{ rightToLeft: true, state: "frozen", ySplit: headerRow, xSplit: 2 }];
    sheet.columns = widths.map(width => ({ width }));
    sheet.pageSetup = { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `1:${headerRow}` };
    sheet.headerFooter.oddFooter = "UECC Survey | صفحة &P من &N";
    sheet.eachRow((row, index) => {
      row.height = index === 1 ? 34 : index >= headerRow ? 28 : 24;
      row.eachCell({ includeEmpty: true }, cell => {
        cell.font = { name: "Arial", size: 11, color: { argb: colors.ink } };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true, readingOrder: "rtl" };
        if (index > headerRow) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 ? colors.stripe : colors.paper } };
          cell.border = { bottom: { style: "hair", color: { argb: colors.line } } };
        }
        if (typeof cell.value === "number" || (typeof cell.value === "object" && cell.value && "formula" in cell.value)) cell.numFmt = numberFormat;
      });
    });
    for (const n of [1, headerRow]) sheet.getRow(n).eachCell({ includeEmpty: true }, cell => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.brand } };
      cell.font = { name: "Arial", size: n === 1 ? 16 : 10, bold: true, color: { argb: colors.paper } };
    });
    sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: Math.max(headerRow, sheet.rowCount - 1), column: widths.length } };
    sheet.pageSetup.printArea = `A1:${sheet.getColumn(widths.length).letter}${sheet.rowCount}`;
  };
  const banner = (sheet: ExcelJS.Worksheet, title: string, count: number) => {
    sheet.addRow([title]); sheet.mergeCells(1, 1, 1, count);
    sheet.addRow([`الفترة: ${report.from} إلى ${report.to}`]); sheet.mergeCells(2, 1, 2, count);
    sheet.addRow([`تاريخ الإصدار: ${report.generatedAt}`]); sheet.mergeCells(3, 1, 3, count);
  };
  const summary = wb.addWorksheet("ملخص الموظفين");
  banner(summary, "UECC Survey | ملخص الحضور والمستحقات", 11);
  summary.addRow(["الموظف", "البريد الإلكتروني", "الأجر اليومي", "أيام الحضور", "الساعات", "الإضافي", "مستحقات العمل", "مستحقات الإضافي", "إجمالي المستحقات", "التأخير (دقيقة)", "جلسات مفتوحة"]);
  report.employees.forEach(e => summary.addRow([e.name, e.profile.email || "—", e.dailyRate, e.attendanceDays, e.hours, e.overtime, e.regularPay, e.overtimePay, e.pay, e.lateMinutes, e.openSessions]));
  const sr = summary.addRow(["الإجمالي"]);
  for (let c = 4; c <= 11; c++) sr.getCell(c).value = { formula: `SUM(${summary.getColumn(c).letter}5:${summary.getColumn(c).letter}${sr.number - 1})`, result: report.employees.reduce((s, e) => s + [e.attendanceDays, e.hours, e.overtime, e.regularPay, e.overtimePay, e.pay, e.lateMinutes, e.openSessions][c - 4], 0) };
  styleSheet(summary, [28, 34, 16, 14, 14, 14, 20, 20, 22, 20, 18], 4);
  sr.font = { name: "Arial", bold: true, color: { argb: colors.brand } };
  const names = new Set([summary.name, "كل الجلسات", "دليل التقرير"]);
  for (const e of report.employees) {
    const base = e.name.replace(/[\\/*?:\[\]]/g, "-").replace(/^'+|'+$/g, "").slice(0, 25) || "موظف";
    let name = base, suffix = 1;
    while (names.has(name)) name = `${base}-${suffix++}`;
    names.add(name);
    const sheet = wb.addWorksheet(name);
    banner(sheet, `UECC Survey | كشف حضور ${e.name}`, 17);
    sheet.addRow([`الموظف: ${e.name} | البريد: ${e.profile.email || "غير مسجل"}`]); sheet.mergeCells("A4:Q4");
    sheet.addRow([`معرّف الموظف: ${e.profile.user_id} | الأجر اليومي: ${e.dailyRate.toFixed(2)} | أيام الحضور: ${e.attendanceDays}`]); sheet.mergeCells("A5:Q5");
    sheet.addRow(["التاريخ", "اليوم", "الحالة", "عدد الجلسات", "بدء الدوام", "نهاية الدوام", "أول حضور", "آخر انصراف", "الساعات", "ساعات عادية", "إضافي محسوب", "تأخير (دقيقة)", "سعر الساعة", "مستحقات العمل", "مستحقات الإضافي", "الإجمالي", "ملاحظات"]);
    e.days.forEach(d => {
      const r = sheet.addRow([d.date, d.day, d.status, d.sessions.length, d.scheduledStart, d.scheduledEnd, d.checkIn, d.checkOut, d.hours, d.regular, d.overtime, d.lateMinutes, d.hourlyRate, { formula: `J${sheet.rowCount + 1}*M${sheet.rowCount + 1}`, result: d.regularPay }, { formula: `K${sheet.rowCount + 1}*M${sheet.rowCount + 1}`, result: d.overtimePay }, { formula: `N${sheet.rowCount + 1}+O${sheet.rowCount + 1}`, result: d.pay }, d.notes]);
      r.getCell(13).note = "Source: UECC Survey — الأجر اليومي الحالي مقسومًا على ساعات اليوم القياسية.";
    });
    const total = sheet.addRow(["الإجمالي"]);
    for (const c of [4, 9, 10, 11, 12, 14, 15, 16]) total.getCell(c).value = { formula: `SUM(${sheet.getColumn(c).letter}7:${sheet.getColumn(c).letter}${total.number - 1})`, result: e.days.reduce((s, d) => s + ({4:d.sessions.length,9:d.hours,10:d.regular,11:d.overtime,12:d.lateMinutes,14:d.regularPay,15:d.overtimePay,16:d.pay}[c] ?? 0), 0) };
    styleSheet(sheet, [14, 14, 24, 14, 14, 14, 14, 18, 15, 15, 17, 18, 16, 20, 20, 22, 46], 6);
    e.days.forEach((d, i) => { if (d.status === "انصراف غير مسجل") sheet.getRow(i + 7).getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.warning } }; });
    total.font = { name: "Arial", bold: true, color: { argb: colors.brand } };
  }
  const sessions = wb.addWorksheet("كل الجلسات");
  banner(sessions, "UECC Survey | تفاصيل كل جلسة حضور", 10);
  sessions.addRow(["الموظف", "التاريخ", "اليوم", "الحضور", "تاريخ الانصراف", "الانصراف", "حالة الجلسة", "ملاحظات", "معرّف الموظف", "معرّف السجل"]);
  report.employees.forEach(e => e.days.forEach(d => d.sessions.forEach(r => sessions.addRow([e.name, d.date, d.day, reportTime(r.check_in), r.check_out ? new Date(r.check_out).toLocaleDateString("en-CA") : "—", reportTime(r.check_out), r.check_out ? "مكتملة" : "مفتوحة", r.notes || "—", e.profile.user_id, r.id]))));
  sessions.addRow(["نهاية السجلات"]);
  styleSheet(sessions, [28, 16, 14, 14, 18, 14, 16, 48, 40, 40], 4);
  const guide = wb.addWorksheet("دليل التقرير");
  banner(guide, "UECC Survey | قواعد وبيانات التقرير", 2);
  guide.addRow(["البند", "التفاصيل"]);
  [
    ["مصدر البيانات", "Source: UECC Survey — سجلات الحضور، ملفات الموظفين، الأجور والإعدادات الحالية وقت التصدير."],
    ["الحساب", "الحساب لكل جلسة وفق قواعد التطبيق الحالية؛ الساعات قبل بدء الدوام لا تدخل في الساعات المحسوبة."],
    ["الإضافي", `يبدأ بعد ${report.settings.overtime_first_minutes} دقيقة، ثم يُحسب بزيادات ${report.settings.overtime_step_minutes} دقيقة مكتملة.`],
    ["الجلسات المفتوحة", "الحضور دون انصراف يظهر للتنبيه، ولا يُحتسب له أجر أو ساعات حتى تسجيل الانصراف."],
    ["الأيام بلا سجل", "لا يوجد سجل لا تعني غيابًا مؤكدًا؛ قد يكون اليوم إجازة أو لم تُسجل بياناته."],
    ["الساعات", "الساعات أرقام عشرية: 1.50 = ساعة ونصف؛ الإضافي عمود مستقل وقد يكون أقل من الزمن الفعلي بسبب التقريب."],
    ["المستحقات", "المبالغ وفق الأجر اليومي الحالي دون افتراض عملة أو احتساب خصومات غير مسجلة."],
    ["التوقيت", `التوقيت المحلي: ${Intl.DateTimeFormat().resolvedOptions().timeZone}؛ الجلسة تُنسب لتاريخ الحضور ولو كان الانصراف اليوم التالي.`],
  ].forEach(r => guide.addRow(r));
  guide.addRow(["نهاية التقرير"]); styleSheet(guide, [28, 110], 4);
  guide.eachRow((r, i) => { if (i > 4) r.height = 44; });
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export async function exportAttendanceExcel(report: AttendanceReport) {
  downloadReport(await createAttendanceExcel(report), reportFilename(report, "xlsx"));
}