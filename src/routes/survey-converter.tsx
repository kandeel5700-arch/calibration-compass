import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Check,
  CircleAlert,
  Download,
  FileSpreadsheet,
  FileText,
  History,
  MapPinned,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { Protected } from "@/components/Protected";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  applyCoordinateOptions,
  detectPointFlags,
  parseSurveyFileText,
  parseTextCoordinates,
  projectFileName,
  serializeCoordinates,
  serializeDxf,
  serializeGsi,
  serializeSdr,
  type SurveyPoint,
} from "@/lib/surveyConverter";

export const Route = createFileRoute("/survey-converter")({
  head: () => ({
    meta: [
      { title: "محول ملفات المساحة — UECC Survey" },
      { name: "description", content: "استورد وحرر وحوّل إحداثيات المساحة بين SDR وGSI وExcel وTXT وDXF." },
      { property: "og:title", content: "محول ملفات المساحة — UECC Survey" },
      { property: "og:description", content: "تحويل ملفات الإحداثيات مع معاينة الرسم والتحقق من البيانات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <Protected>
      <SurveyConverterPage />
    </Protected>
  ),
});

interface RecentProject {
  id: string;
  name: string;
  points: SurveyPoint[];
  savedAt: string;
  source: string;
}

const HISTORY_KEY = "uecc-survey-converter-history-v1";
const PREVIEW_LIMIT = 250;

function downloadText(content: string, filename: string, mime = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function SurveyConverterPage() {
  const [mode, setMode] = useState("field");
  const [projectName, setProjectName] = useState("");
  const [points, setPoints] = useState<SurveyPoint[]>([]);
  const [sourceName, setSourceName] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [includeElevation, setIncludeElevation] = useState(false);
  const [swapAxes, setSwapAxes] = useState(false);
  const [deltaE, setDeltaE] = useState("0");
  const [deltaN, setDeltaN] = useState("0");
  const [history, setHistory] = useState<RecentProject[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [historyReady, setHistoryReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const fieldFileRef = useRef<HTMLInputElement>(null);
  const officeFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed)) setHistory(parsed.slice(0, 10) as RecentProject[]);
      }
    } catch {
      localStorage.removeItem(HISTORY_KEY);
    }
    setHistoryReady(true);
  }, []);

  useEffect(() => {
    if (!historyReady || !projectId || !projectName.trim() || points.length === 0) return;
    const current: RecentProject = {
      id: projectId,
      name: projectName.trim(),
      points,
      source: sourceName,
      savedAt: new Date().toISOString(),
    };
    setHistory((previous) => {
      const next = [current, ...previous.filter((project) => project.id !== projectId)].slice(0, 10);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        toast.error("تعذر حفظ المشروع في سجل المتصفح");
      }
      return next;
    });
  }, [historyReady, projectId, projectName, points, sourceName]);

  const adjustedPoints = useMemo(() =>
    applyCoordinateOptions(points, {
      swapAxes,
      deltaE: Number(deltaE) || 0,
      deltaN: Number(deltaN) || 0,
    }), [points, swapAxes, deltaE, deltaN]);
  const flags = useMemo(() => detectPointFlags(adjustedPoints), [adjustedPoints]);
  const duplicateCount = useMemo(() => Object.values(flags).filter((flag) => flag.duplicate).length, [flags]);
  const outlierCount = useMemo(() => Object.values(flags).filter((flag) => flag.outlier).length, [flags]);

  function requireProjectName() {
    if (projectName.trim()) return true;
    toast.error("اكتب اسم أو رقم الشاليه / الفيلا أولاً");
    return false;
  }

  async function handleFile(file: File) {
    if (!requireProjectName()) return;
    setBusy(true);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
      let imported: SurveyPoint[] = [];
      if (extension === "xlsx" || extension === "xls") {
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
        if (firstSheet) {
          const rows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, raw: true, defval: "" });
          imported = parseRowsForSpreadsheet(rows);
        }
      } else {
        imported = parseSurveyFileText(await file.text(), extension);
      }
      if (imported.length === 0) {
        toast.error("لم يتم العثور على إحداثيات صالحة", { description: "تحقق من ترتيب الأعمدة أو صيغة الملف." });
        return;
      }
      setPoints(imported);
      setSourceName(file.name);
      setProjectId(crypto.randomUUID());
      setPasteText("");
      toast.success(`تم استيراد ${imported.length} نقطة`);
    } catch (error) {
      toast.error("تعذر قراءة الملف", { description: error instanceof Error ? error.message : "صيغة الملف غير مدعومة." });
    } finally {
      setBusy(false);
    }
  }

  function parseRowsForSpreadsheet(rows: unknown[][]) {
    return parseSurveyFileText(rows.map((row) => row.map((cell) => String(cell ?? "")).join("\t")).join("\n"), "txt");
  }

  function readFileFromInput(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void handleFile(file);
  }

  function parsePastedData() {
    if (!requireProjectName()) return;
    const imported = parseTextCoordinates(pasteText);
    if (!imported.length) {
      toast.error("لم يتم التعرف على نقاط", { description: "استخدم الأعمدة: PC وE وN، مع Z اختياري." });
      return;
    }
    setPoints(imported);
    setSourceName("بيانات ملصقة");
    setProjectId(crypto.randomUUID());
    toast.success(`تم استيراد ${imported.length} نقطة`);
  }

  function updateDisplayedPoint(id: string, key: "point" | "easting" | "northing" | "elevation", value: string) {
    const screenEast = adjustedPoints.find((point) => point.id === id)?.easting;
    const screenNorth = adjustedPoints.find((point) => point.id === id)?.northing;
    setPoints((previous) => previous.map((point) => {
      if (point.id !== id) return point;
      if (key === "point") return { ...point, point: value };
      if (key === "elevation") return { ...point, elevation: value.trim() ? Number(value) : null };
      const nextEast = key === "easting" ? Number(value) : screenEast;
      const nextNorth = key === "northing" ? Number(value) : screenNorth;
      if (nextEast === undefined || nextNorth === undefined || !Number.isFinite(nextEast) || !Number.isFinite(nextNorth)) return point;
      const baseEast = swapAxes ? nextNorth - (Number(deltaN) || 0) : nextEast - (Number(deltaE) || 0);
      const baseNorth = swapAxes ? nextEast - (Number(deltaE) || 0) : nextNorth - (Number(deltaN) || 0);
      return { ...point, easting: baseEast, northing: baseNorth };
    }));
  }

  function removeDuplicates() {
    const seen = new Set<string>();
    const kept = adjustedPoints.filter((point) => {
      const key = `${point.easting.toFixed(3)}|${point.northing.toFixed(3)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    setPoints(kept.map((point) => ({ ...point, easting: swapAxes ? point.northing - (Number(deltaN) || 0) : point.easting - (Number(deltaE) || 0), northing: swapAxes ? point.easting - (Number(deltaE) || 0) : point.northing - (Number(deltaN) || 0) })));
    toast.success(`تم حذف ${points.length - kept.length} نقطة مكررة`);
  }

  function resetProject() {
    setPoints([]);
    setProjectName("");
    setSourceName("");
    setProjectId(null);
    setPasteText("");
    setSwapAxes(false);
    setDeltaE("0");
    setDeltaN("0");
  }

  function loadRecent(project: RecentProject) {
    setProjectId(project.id);
    setProjectName(project.name);
    setPoints(project.points);
    setSourceName(project.source);
    toast.success("تم فتح المشروع المحفوظ");
  }

  async function exportExcel() {
    if (!requireProjectName() || !adjustedPoints.length) return;
    setBusy(true);
    try {
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "UECC Survey";
      workbook.created = new Date();
      const worksheet = workbook.addWorksheet("الإحداثيات", { views: [{ rightToLeft: true, state: "normal" }] });
      const lastColumn = includeElevation ? "D" : "C";
      worksheet.mergeCells(`A1:${lastColumn}1`);
      const titleCell = worksheet.getCell("A1");
      titleCell.value = projectName.trim();
      titleCell.font = { name: "Arial", size: 14, bold: true };
      titleCell.alignment = { horizontal: "center", vertical: "middle" };
      titleCell.border = gridBorder();
      worksheet.getRow(1).height = 28;
      const columns = ["PC", "E", "N", ...(includeElevation ? ["Z"] : [])];
      const headerRow = worksheet.addRow(columns);
      headerRow.height = 22;
      headerRow.eachCell((cell) => {
        cell.font = { name: "Arial", bold: true };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = gridBorder();
      });
      for (const point of adjustedPoints) {
        const row = worksheet.addRow([
          point.point,
          point.easting,
          point.northing,
          ...(includeElevation ? [point.elevation] : []),
        ]);
        row.eachCell((cell, columnNumber) => {
          cell.font = { name: "Arial", size: 10 };
          cell.alignment = { horizontal: columnNumber === 1 ? "left" : "right", vertical: "middle" };
          cell.border = gridBorder();
          if (columnNumber > 1) cell.numFmt = "0.000;[Red]-0.000";
        });
      }
      worksheet.columns = [
        { key: "pc", width: 18 },
        { key: "e", width: 18 },
        { key: "n", width: 18 },
        ...(includeElevation ? [{ key: "z", width: 18 }] : []),
      ];
      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = projectFileName(projectName, "xlsx");
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("تم تجهيز ملف Excel");
    } catch (error) {
      toast.error("تعذر تصدير Excel", { description: error instanceof Error ? error.message : "حدث خطأ أثناء إنشاء الملف." });
    } finally {
      setBusy(false);
    }
  }

  function exportFile(format: "txt" | "dxf" | "gsi" | "sdr") {
    if (!requireProjectName() || !adjustedPoints.length) return;
    const content = format === "dxf"
      ? serializeDxf(adjustedPoints)
      : format === "gsi"
        ? serializeGsi(adjustedPoints, includeElevation)
        : format === "sdr"
          ? serializeSdr(adjustedPoints)
          : serializeCoordinates(adjustedPoints, includeElevation);
    downloadText(content, projectFileName(projectName, format), format === "dxf" ? "application/dxf;charset=utf-8" : "text/plain;charset=utf-8");
    toast.success(`تم تصدير ${format.toUpperCase()}`);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6" dir="rtl">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-primary">
            <MapPinned className="h-5 w-5" />
            <span className="text-sm font-semibold">أدوات المساحة</span>
          </div>
          <h1 className="text-2xl font-bold md:text-3xl">محول ملفات المساحة</h1>
          <p className="mt-1 text-sm text-muted-foreground">حوّل الإحداثيات وراجعها قبل تصديرها لجهازك أو مكتبك.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={resetProject} disabled={!points.length} className="gap-2">
            <RotateCcw className="h-4 w-4" /> مشروع جديد
          </Button>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
        <div className="space-y-2">
          <Label htmlFor="project-name">اسم أو رقم الشاليه / الفيلا <span className="text-destructive">*</span></Label>
          <Input
            id="project-name"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            placeholder="مثال: فيلا 24 — المرحلة الثانية"
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">يظهر هذا الاسم في عنوان ملف Excel واسم الملف المصدر.</p>
        </div>
        <div className="flex items-center justify-between gap-3 border-y border-border py-3 lg:border-y-0 lg:border-r lg:py-0 lg:pr-5">
          <div>
            <Label htmlFor="include-z">إظهار الارتفاع Z</Label>
            <p className="mt-1 text-xs text-muted-foreground">إضافة عمود الارتفاع في المعاينة والتصدير.</p>
          </div>
          <Switch id="include-z" checked={includeElevation} onCheckedChange={setIncludeElevation} />
        </div>
      </section>

      <Tabs value={mode} onValueChange={setMode} dir="rtl" className="space-y-5">
        <TabsList className="grid h-auto w-full max-w-lg grid-cols-2">
          <TabsTrigger value="field" className="min-h-10">أجهزة المساحة إلى المكتب</TabsTrigger>
          <TabsTrigger value="office" className="min-h-10">المكتب إلى أجهزة المساحة</TabsTrigger>
        </TabsList>
        <TabsContent value="field" className="mt-0">
          <section className="grid gap-5 border-y border-border py-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div>
              <h2 className="font-bold">استيراد SDR أو GSI</h2>
              <p className="mt-1 text-sm text-muted-foreground">تُقرأ الإحداثيات داخل المتصفح؛ لا تُرفع ملفاتك إلى خادم.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input ref={fieldFileRef} type="file" accept=".sdr,.gsi,.txt,.csv" onChange={readFileFromInput} className="hidden" />
              <Button onClick={() => requireProjectName() && fieldFileRef.current?.click()} disabled={busy} className="gap-2">
                <Upload className="h-4 w-4" /> {busy ? "جارٍ التحميل..." : "اختيار ملف ميداني"}
              </Button>
              <Button variant="outline" onClick={() => exportExcel()} disabled={busy || !points.length} className="gap-2">
                <FileSpreadsheet className="h-4 w-4" /> Excel
              </Button>
              <Button variant="outline" onClick={() => exportFile("dxf")} disabled={!points.length} className="gap-2">
                <Download className="h-4 w-4" /> DXF
              </Button>
              <Button variant="outline" onClick={() => exportFile("txt")} disabled={!points.length} className="gap-2">
                <FileText className="h-4 w-4" /> TXT
              </Button>
            </div>
          </section>
        </TabsContent>
        <TabsContent value="office" className="mt-0">
          <section className="grid gap-5 border-y border-border py-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div className="space-y-3">
              <div>
                <h2 className="font-bold">استيراد ملف مكتبي</h2>
                <p className="mt-1 text-sm text-muted-foreground">Excel أو CSV أو TXT بأعمدة PC وE وN، وZ اختياري.</p>
              </div>
              <input ref={officeFileRef} type="file" accept=".xlsx,.xls,.csv,.txt" onChange={readFileFromInput} className="hidden" />
              <Button variant="outline" onClick={() => requireProjectName() && officeFileRef.current?.click()} disabled={busy} className="gap-2">
                <Upload className="h-4 w-4" /> اختيار ملف مكتبي
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="paste-coordinates">أو ألصق صفوف الإحداثيات</Label>
              <Textarea
                id="paste-coordinates"
                value={pasteText}
                onChange={(event) => setPasteText(event.target.value)}
                placeholder={'PC\tE\tN\nP1\t100.250\t200.500'}
                className="min-h-24 font-mono text-sm"
                dir="ltr"
              />
              <Button onClick={parsePastedData} disabled={!pasteText.trim()} className="gap-2">
                <Check className="h-4 w-4" /> قراءة الإحداثيات
              </Button>
            </div>
          </section>
          <section className="flex flex-wrap gap-2 border-b border-border py-4">
            <Button variant="outline" onClick={() => exportFile("sdr")} disabled={!points.length} className="gap-2">
              <Download className="h-4 w-4" /> تصدير SDR
            </Button>
            <Button variant="outline" onClick={() => exportFile("gsi")} disabled={!points.length} className="gap-2">
              <Download className="h-4 w-4" /> تصدير GSI
            </Button>
            <Button variant="outline" onClick={() => exportExcel()} disabled={busy || !points.length} className="gap-2">
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
          </section>
        </TabsContent>
      </Tabs>

      {points.length > 0 ? (
        <>
          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]">
            <div className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
                <div>
                  <h2 className="font-bold">ضبط الإحداثيات</h2>
                  <p className="mt-1 text-xs text-muted-foreground">{sourceName || "بيانات الإحداثيات"} · {points.length} نقطة</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant={swapAxes ? "default" : "outline"} size="sm" onClick={() => setSwapAxes((value) => !value)} className="gap-2">
                    <ArrowLeftRight className="h-4 w-4" /> تبديل E / N
                  </Button>
                  {duplicateCount > 0 && (
                    <Button variant="outline" size="sm" onClick={removeDuplicates} className="gap-2 text-destructive">
                      <Trash2 className="h-4 w-4" /> حذف المكرر ({duplicateCount})
                    </Button>
                  )}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="delta-e">إزاحة E · ΔE</Label>
                  <Input id="delta-e" type="number" step="0.001" value={deltaE} onChange={(event) => setDeltaE(event.target.value)} dir="ltr" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="delta-n">إزاحة N · ΔN</Label>
                  <Input id="delta-n" type="number" step="0.001" value={deltaN} onChange={(event) => setDeltaN(event.target.value)} dir="ltr" />
                </div>
              </div>
              <div className="flex flex-wrap gap-3 text-xs">
                <span className="inline-flex items-center gap-1.5 text-warning"><CircleAlert className="h-3.5 w-3.5" /> مكرر: {duplicateCount}</span>
                <span className="inline-flex items-center gap-1.5 text-destructive"><CircleAlert className="h-3.5 w-3.5" /> خارج النطاق المعتاد: {outlierCount}</span>
                <span className="text-muted-foreground">تُطبّق الإزاحات والتبديل على الرسم والملفات المصدّرة.</span>
              </div>

              <div className="overflow-hidden border-y border-border">
                <div className="max-h-[440px] overflow-auto">
                  <table className="w-full min-w-[620px] border-collapse text-sm">
                    <thead className="sticky top-0 z-10 bg-secondary text-muted-foreground">
                      <tr>
                        <th className="border-b border-border p-2 text-right font-semibold">PC</th>
                        <th className="border-b border-border p-2 text-right font-semibold">E</th>
                        <th className="border-b border-border p-2 text-right font-semibold">N</th>
                        {includeElevation && <th className="border-b border-border p-2 text-right font-semibold">Z</th>}
                        <th className="border-b border-border p-2 text-right font-semibold">الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adjustedPoints.slice(0, PREVIEW_LIMIT).map((point) => {
                        const flag = flags[point.id];
                        return (
                          <tr key={point.id} className={flag?.outlier ? "bg-destructive/10" : flag?.duplicate ? "bg-warning/10" : "odd:bg-muted/30"}>
                            <td className="border-b border-border/70 p-1.5"><Input aria-label={`رقم النقطة ${point.point}`} value={point.point} onChange={(event) => updateDisplayedPoint(point.id, "point", event.target.value)} className="h-8 min-w-24" /></td>
                            <td className="border-b border-border/70 p-1.5"><Input aria-label={`E ${point.point}`} type="number" step="0.001" value={point.easting} onChange={(event) => updateDisplayedPoint(point.id, "easting", event.target.value)} className="h-8 min-w-28 font-mono" dir="ltr" /></td>
                            <td className="border-b border-border/70 p-1.5"><Input aria-label={`N ${point.point}`} type="number" step="0.001" value={point.northing} onChange={(event) => updateDisplayedPoint(point.id, "northing", event.target.value)} className="h-8 min-w-28 font-mono" dir="ltr" /></td>
                            {includeElevation && <td className="border-b border-border/70 p-1.5"><Input aria-label={`Z ${point.point}`} type="number" step="0.001" value={point.elevation ?? ""} onChange={(event) => updateDisplayedPoint(point.id, "elevation", event.target.value)} className="h-8 min-w-24 font-mono" dir="ltr" /></td>}
                            <td className="border-b border-border/70 p-2 text-xs">
                              {flag?.duplicate ? <span className="text-warning">إحداثي مكرر</span> : flag?.outlier ? <span className="text-destructive">تحقق من القيمة</span> : <span className="text-muted-foreground">سليم</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {points.length > PREVIEW_LIMIT && <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">تُعرض أول {PREVIEW_LIMIT} نقطة للتعديل؛ التصدير يشمل كل النقاط.</p>}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
                <div>
                  <h2 className="font-bold">مخطط الإحداثيات</h2>
                  <p className="mt-1 text-xs text-muted-foreground">عرض E / N بعد تطبيق الضبط.</p>
                </div>
                <MapPinned className="h-5 w-5 text-primary" />
              </div>
              <SurveyPlot points={adjustedPoints} flags={flags} />
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" /> نقطة</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-warning" /> مكرر</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-destructive" /> شاذ</span>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                <Button onClick={() => void exportExcel()} disabled={busy} className="gap-2"><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
                <Button variant="outline" onClick={() => exportFile("dxf")} className="gap-2"><Download className="h-4 w-4" /> DXF</Button>
                <Button variant="outline" onClick={() => exportFile("txt")} className="gap-2"><FileText className="h-4 w-4" /> TXT</Button>
              </div>
            </div>
          </section>
        </>
      ) : (
        <div className="border-y border-border py-10 text-center">
          <MapPinned className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-semibold">ابدأ بإدخال اسم المشروع ثم اختر ملفاً</p>
          <p className="mt-1 text-sm text-muted-foreground">يدعم التحويل ملفات الإحداثيات النصية وملفات Excel وبيانات أجهزة المساحة.</p>
        </div>
      )}

      {history.length > 0 && (
        <section className="border-t border-border pt-5">
          <div className="mb-3 flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <h2 className="font-bold">المشروعات الأخيرة</h2>
            <span className="text-xs text-muted-foreground">محفوظة على هذا الجهاز</span>
          </div>
          <div className="grid gap-x-5 sm:grid-cols-2 xl:grid-cols-3">
            {history.map((project) => (
              <button key={project.id} type="button" onClick={() => loadRecent(project)} className="flex min-w-0 items-center justify-between gap-3 border-b border-border py-3 text-right transition-colors hover:bg-muted/40">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{project.name}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{project.points.length} نقطة · {new Date(project.savedAt).toLocaleString("ar-EG")}</span>
                </span>
                <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function gridBorder() {
  return {
    top: { style: "thin" as const, color: { argb: "FF7A858C" } },
    left: { style: "thin" as const, color: { argb: "FF7A858C" } },
    bottom: { style: "thin" as const, color: { argb: "FF7A858C" } },
    right: { style: "thin" as const, color: { argb: "FF7A858C" } },
  };
}

function SurveyPlot({ points, flags }: { points: SurveyPoint[]; flags: ReturnType<typeof detectPointFlags> }) {
  const width = 620;
  const height = 320;
  const margin = 30;
  const minE = Math.min(...points.map((point) => point.easting));
  const maxE = Math.max(...points.map((point) => point.easting));
  const minN = Math.min(...points.map((point) => point.northing));
  const maxN = Math.max(...points.map((point) => point.northing));
  const rangeE = maxE - minE || 1;
  const rangeN = maxN - minN || 1;
  return (
    <div className="overflow-hidden border border-border bg-muted/20">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="مخطط انتشار نقاط الإحداثيات" className="block h-auto w-full">
        <path d={`M${margin} ${height - margin}H${width - margin}M${margin} ${margin}V${height - margin}`} className="stroke-border" strokeWidth="1" />
        {points.map((point, index) => {
          const x = margin + ((point.easting - minE) / rangeE) * (width - margin * 2);
          const y = height - margin - ((point.northing - minN) / rangeN) * (height - margin * 2);
          const flag = flags[point.id];
          const color = flag?.outlier ? "text-destructive" : flag?.duplicate ? "text-warning" : "text-primary";
          return <circle key={point.id} cx={x} cy={y} r={points.length < 80 ? 4 : 2.5} className={`fill-current ${color}`}><title>{`${point.point} · E ${point.easting} · N ${point.northing}`}</title></circle>;
        })}
        <text x={width / 2} y={height - 5} textAnchor="middle" className="fill-muted-foreground" fontSize="12">E</text>
        <text x="12" y={height / 2} textAnchor="middle" className="fill-muted-foreground" fontSize="12" transform={`rotate(-90 12 ${height / 2})`}>N</text>
      </svg>
    </div>
  );
}