import type ExcelJS from "exceljs";
import { type AttendanceReport, type EmployeeReport, reportColors } from "./attendanceReport";

/** Paper-style employee form; only existing payroll values are populated. */
export function addEmployeeAttendanceForm(wb: ExcelJS.Workbook, name: string, e: EmployeeReport, report: AttendanceReport, logoId?: number) {
  const sheet = wb.addWorksheet(name);
  const colors = reportColors();
  const ink = `FF${colors.formInk}`, line = `FF${colors.formLine}`, paper = `FF${colors.paper}`, header = `FF${colors.formHeader}`;
  const money = '#,##0.00;(#,##0.00);"—"';
  const integer = '0;(0);"—"';
  const widths = [5, 13, 11, 24, 13, 12, 20, 7, 10, 12, 10, 10, 7, 7, 13, 7, 7, 13, 10, 13, 12, 12, 12, 13, 15, 30];
  sheet.columns = widths.map(width => ({ width }));
  sheet.views = [{ rightToLeft: true, state: "frozen", ySplit: 16, xSplit: 3, showGridLines: false, zoomScale: 75 }];
  const merged = (r1: number, c1: number, r2: number, c2: number, value: ExcelJS.CellValue) => {
    sheet.mergeCells(r1, c1, r2, c2); sheet.getCell(r1, c1).value = value;
  };
  merged(1, 5, 2, 22, "Casual Employees Attendance");
  merged(1, 23, 2, 26, "UECC Survey");
  if (logoId !== undefined) sheet.addImage(logoId, { tl: { col: 23.4, row: 0.1 }, ext: { width: 80, height: 55 } });
  const first = 17, last = first + e.days.length - 1, total = last + 1;
  const sum = (column: string, result: number): ExcelJS.CellFormulaValue => ({ formula: `SUM(${column}${first}:${column}${last})`, result });
  const info: [string, ExcelJS.CellValue][] = [
    ["الفترة من", report.from], ["الفترة إلى", report.to], ["اسم الموظف", e.name],
    ["معرّف الموظف", e.profile.user_id], ["البريد الإلكتروني", e.profile.email || "غير مسجل"],
    ["الوظيفة / الموقع", "غير مسجل"], ["الأجر اليومي", e.dailyRate],
    ["أيام الحضور", e.attendanceDays], ["إجمالي المستحقات", { formula: `Y${total}`, result: e.pay }],
  ];
  info.forEach(([label, value], i) => { merged(i + 3, 1, i + 3, 3, label); merged(i + 3, 4, i + 3, 9, value); });
  const stats: [string, ExcelJS.CellValue][] = [
    ["ساعات العمل العادية", e.regular], ["ساعات الإضافي المحسوبة", e.overtime], ["التأخير بالدقائق", e.lateMinutes],
    ["جلسات دون انصراف", e.openSessions], ["أيام دون سجل", e.missingDays],
  ];
  stats.forEach(([label, value], i) => { merged(i + 7, 12, i + 7, 17, label); merged(i + 7, 18, i + 7, 20, value); });
  merged(12, 1, 12, 26, "كشف الحضور والانصراف والأجور اليومية");
  merged(13, 1, 13, 26, `تاريخ الإصدار: ${report.generatedAt}`);
  const vertical = [[1,"م"],[2,"التاريخ"],[3,"اليوم"],[4,"اسم الموظف"],[5,"الوظيفة"],[6,"نوع الأجر"],[7,"حالة اليوم"],[8,"عدد الجلسات"],[19,"تأخير بالدقائق"],[20,"وقت غير محتسب بالدقائق"],[21,"بدلات"],[22,"خصومات"],[23,"مستحقات أخرى"],[24,"الأجر اليومي"],[25,"إجمالي المستحقات"],[26,"ملاحظات"]] as const;
  vertical.forEach(([c, label]) => merged(15, c, 16, c, label));
  for (const [start, end, label, children] of [
    [9,10,"الحضور والانصراف",["الحضور","الانصراف"]],
    [11,12,"الدوام المقرر",["من","إلى"]],
    [13,15,"وقت العمل العادي",["ساعة","دقيقة","القيمة"]],
    [16,18,"وقت العمل الإضافي",["ساعة","دقيقة","القيمة"]],
  ] as [number, number, string, string[]][]) {
    merged(15, start, 15, end, label); children.forEach((label, i) => { sheet.getCell(16, start + i).value = label; });
  }
  e.days.forEach((d, i) => {
    const r = first + i;
    const regularMinutes = Math.round(d.regular * 60), overtimeMinutes = Math.round(d.overtime * 60);
    const unpaidMinutes = Math.max(0, Math.round((d.hours - d.regular - d.overtime) * 60));
    const values: ExcelJS.CellValue[] = [i+1,d.date,d.day,e.name,null,"يومي",d.status,d.sessions.length,d.checkIn,d.checkOut,d.scheduledStart,d.scheduledEnd,
      Math.floor(regularMinutes/60), regularMinutes%60, {formula:`(M${r}+N${r}/60)*IFERROR(X${r}/${d.standardHours || 8},0)`,result:d.regularPay},
      Math.floor(overtimeMinutes/60), overtimeMinutes%60, {formula:`(P${r}+Q${r}/60)*IFERROR(X${r}/${d.standardHours || 8},0)`,result:d.overtimePay},
      d.lateMinutes,unpaidMinutes,null,null,null,e.dailyRate,{formula:`SUM(O${r},R${r})`,result:d.pay},d.notes || null];
    values.forEach((v,c) => { sheet.getCell(r,c+1).value=v; });
    for (const c of [5,21,22,23]) sheet.getCell(r,c).note = "غير مسجل بالتطبيق؛ تُرك فارغًا دون افتراض قيمة أو خصم.";
    sheet.getCell(r,25).note = "Source: UECC Survey — مستحقات العمل + الإضافي طبقًا لقواعد التطبيق؛ لا يشمل بدلات أو خصومات غير مسجلة.";
    sheet.getCell(r,24).note = `Source: UECC Survey, ${report.generatedAt}, الأجر اليومي الحالي؛ ساعات اليوم القياسية: ${d.standardHours}.`;
  });
  merged(total,1,total,7,"الإجمالي");
  sheet.getCell(total,8).value=sum("H",e.days.reduce((n,d)=>n+d.sessions.length,0));
  for (const [hourCol,minCol,hours] of [[13,14,e.regular],[16,17,e.overtime]] as const) {
    const h=sheet.getColumn(hourCol).letter,m=sheet.getColumn(minCol).letter;
    sheet.getCell(total,hourCol).value={formula:`INT((SUM(${h}${first}:${h}${last})*60+SUM(${m}${first}:${m}${last}))/60)`,result:Math.floor(Math.round(hours*60)/60)};
    sheet.getCell(total,minCol).value={formula:`MOD(SUM(${h}${first}:${h}${last})*60+SUM(${m}${first}:${m}${last}),60)`,result:Math.round(hours*60)%60};
  }
  sheet.getCell(total,15).value=sum("O",e.regularPay); sheet.getCell(total,18).value=sum("R",e.overtimePay);
  sheet.getCell(total,19).value=sum("S",e.lateMinutes); sheet.getCell(total,20).value=sum("T",e.days.reduce((n,d)=>n+Math.max(0,Math.round((d.hours-d.regular-d.overtime)*60)),0));
  sheet.getCell(total,25).value=sum("Y",e.pay);
  merged(total+1,1,total+1,26,"البدلات والخصومات والوظيفة والموقع غير مسجلة؛ الخانات الفارغة لا تعني صفرًا، والإجمالي حسب حساب التطبيق فقط.");
  merged(total+2,1,total+2,26,"الأيام دون سجل ليست غيابًا مؤكدًا. الحضور دون انصراف لا يُحتسب حتى إغلاق الجلسة. الوقت غير المحتسب ناتج عن تقريب الإضافي.");
  for (const [start,end,label] of [[1,6,"توقيع الموظف"],[8,13,"مسؤول الموقع"],[15,20,"شؤون إدارية"],[22,26,"مراجعة واعتماد"]] as const) {
    merged(total+4,start,total+4,end,label); merged(total+5,start,total+6,end,"................................");
  }
  for(let r=1;r<=total+6;r++) {
    const row=sheet.getRow(r); row.height=r===15||r===16?30:r>=first&&r<=last?30:r===total+1||r===total+2?24:22;
    for(let c=1;c<=26;c++) {
      const cell=row.getCell(c);
      cell.font={name:"Arial",size:9,color:{argb:ink}};
      cell.alignment={vertical:"middle",horizontal:"center",wrapText:true,readingOrder:"rtl"};
      cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:paper}};
      if((r>=15&&r<=total)||(r>=3&&r<=11&&c<=9)||(r>=7&&r<=11&&c>=12&&c<=20))
        cell.border={top:{style:"thin",color:{argb:line}},bottom:{style:"thin",color:{argb:line}},left:{style:"thin",color:{argb:line}},right:{style:"thin",color:{argb:line}}};
      if(r===15||r===16||r===total) {cell.font={name:"Arial",size:9,bold:true,color:{argb:ink}};cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:header}};}
      if([15,18,21,22,23,24,25].includes(c))cell.numFmt=money;
      else if(c>=8&&c!==9&&c!==10&&c!==11&&c!==12&&c!==26)cell.numFmt=integer;
    }
  }
  sheet.getCell(1,5).font={name:"Arial",size:20,bold:true,color:{argb:ink}};
  sheet.getCell(12,1).font={name:"Arial",size:12,bold:true,color:{argb:ink}};
  sheet.getRow(1).height=32;
  sheet.getCell(11,4).numFmt=money;sheet.getCell(9,4).numFmt=money;
  sheet.pageSetup={paperSize:8,orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:"15:16",printArea:`A1:Z${total+6}`,horizontalCentered:true,margins:{left:0.25,right:0.25,top:0.3,bottom:0.3,header:0.1,footer:0.1}};
  sheet.headerFooter.oddFooter="&CUECC Survey | صفحة &P من &N";
  return sheet;
}