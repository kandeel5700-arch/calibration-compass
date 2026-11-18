import type { SurveyPoint } from "@/lib/surveyConverter";

export interface DxfVertex {
  x: number;
  y: number;
  z: number;
}

export type DxfEntity =
  | { kind: "line"; points: [DxfVertex, DxfVertex] }
  | { kind: "polyline"; points: DxfVertex[]; closed: boolean }
  | { kind: "circle"; center: DxfVertex; radius: number }
  | { kind: "arc"; center: DxfVertex; radius: number; startAngle: number; endAngle: number }
  | { kind: "point"; point: DxfVertex }
  | { kind: "text"; point: DxfVertex; text: string; height: number };

export interface ParsedDxf {
  entities: DxfEntity[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

interface Pair {
  code: number;
  value: string;
}

const EMPTY_BOUNDS = { minX: -10, minY: -10, maxX: 10, maxY: 10 };

function parsePairs(content: string): Pair[] {
  if (content.includes("\u0000")) throw new Error("ملفات DXF الثنائية غير مدعومة؛ احفظ اللوحة بصيغة DXF نصية.");
  if (content.length > 20_000_000) throw new Error("حجم لوحة DXF أكبر من الحد المدعوم (20 ميجابايت).");
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  const pairs: Pair[] = [];
  for (let index = 0; index + 1 < lines.length; index += 2) {
    const code = Number(lines[index]?.trim());
    if (!Number.isInteger(code)) continue;
    pairs.push({ code, value: lines[index + 1] ?? "" });
  }
  return pairs;
}

function getValue(pairs: Pair[], code: number): string | undefined {
  return pairs.find((pair) => pair.code === code)?.value.trim();
}

function getNumber(pairs: Pair[], code: number, fallback = 0): number {
  const value = Number(getValue(pairs, code));
  return Number.isFinite(value) ? value : fallback;
}

function vertex(pairs: Pair[], xCode: number, yCode: number, zCode: number): DxfVertex | null {
  const x = Number(getValue(pairs, xCode));
  const y = Number(getValue(pairs, yCode));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y, z: getNumber(pairs, zCode) };
}

function sampleArc(center: DxfVertex, radius: number, start: number, end: number): DxfVertex[] {
  let sweep = end - start;
  while (sweep <= 0) sweep += 360;
  const segments = Math.max(12, Math.min(96, Math.ceil(sweep / 6)));
  return Array.from({ length: segments + 1 }, (_, index) => {
    const angle = ((start + (sweep * index) / segments) * Math.PI) / 180;
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius, z: center.z };
  });
}

function entityGroups(pairs: Pair[]): Pair[][] {
  const groups: Pair[][] = [];
  for (const pair of pairs) {
    if (pair.code === 0) groups.push([pair]);
    else groups.at(-1)?.push(pair);
  }
  return groups;
}

function decodeText(value: string): string {
  return value.replace(/\\P/g, " ").replace(/[{}\r\n]/g, " ").trim();
}

export function parseDxfDrawing(content: string): ParsedDxf {
  const pairs = parsePairs(content);
  let entitiesStart = -1;
  let entitiesEnd = -1;
  for (let index = 0; index < pairs.length - 2; index += 1) {
    if (pairs[index]?.code === 0 && pairs[index]?.value.trim().toUpperCase() === "SECTION" && pairs[index + 1]?.code === 2 && pairs[index + 1]?.value.trim().toUpperCase() === "ENTITIES") {
      entitiesStart = index + 2;
      for (let end = entitiesStart; end < pairs.length; end += 1) {
        if (pairs[end]?.code === 0 && pairs[end]?.value.trim().toUpperCase() === "ENDSEC") {
          entitiesEnd = end;
          break;
        }
      }
      break;
    }
  }
  if (entitiesStart < 0 || entitiesEnd < 0) throw new Error("تعذر العثور على قسم العناصر في ملف DXF.");

  const sourceGroups = entityGroups(pairs.slice(entitiesStart, entitiesEnd));
  const entities: DxfEntity[] = [];
  for (let index = 0; index < sourceGroups.length; index += 1) {
    const group = sourceGroups[index] ?? [];
    const type = group[0]?.value.trim().toUpperCase();
    if (type === "POLYLINE") {
      const vertices: DxfVertex[] = [];
      while (index + 1 < sourceGroups.length && sourceGroups[index + 1]?.[0]?.value.trim().toUpperCase() === "VERTEX") {
        index += 1;
        const item = sourceGroups[index] ?? [];
        const point = vertex(item, 10, 20, 30);
        if (point) vertices.push(point);
      }
      if (vertices.length > 1) entities.push({ kind: "polyline", points: vertices, closed: (getNumber(group, 70) & 1) === 1 });
      continue;
    }
    if (type === "LINE") {
      const start = vertex(group, 10, 20, 30);
      const end = vertex(group, 11, 21, 31);
      if (start && end) entities.push({ kind: "line", points: [start, end] });
    } else if (type === "LWPOLYLINE") {
      const vertices: DxfVertex[] = [];
      let x: number | null = null;
      for (const pair of group) {
        if (pair.code === 10) x = Number(pair.value);
        else if (pair.code === 20 && x !== null) {
          const y = Number(pair.value);
          if (Number.isFinite(x) && Number.isFinite(y)) vertices.push({ x, y, z: getNumber(group, 38) });
          x = null;
        }
      }
      if (vertices.length > 1) entities.push({ kind: "polyline", points: vertices, closed: (getNumber(group, 70) & 1) === 1 });
    } else if (type === "CIRCLE") {
      const center = vertex(group, 10, 20, 30);
      const radius = getNumber(group, 40);
      if (center && radius > 0) entities.push({ kind: "circle", center, radius });
    } else if (type === "ARC") {
      const center = vertex(group, 10, 20, 30);
      const radius = getNumber(group, 40);
      if (center && radius > 0) entities.push({ kind: "arc", center, radius, startAngle: getNumber(group, 50), endAngle: getNumber(group, 51) });
    } else if (type === "POINT") {
      const point = vertex(group, 10, 20, 30);
      if (point) entities.push({ kind: "point", point });
    } else if (type === "TEXT" || type === "MTEXT") {
      const point = vertex(group, 10, 20, 30);
      const text = type === "MTEXT"
        ? group.filter((pair) => pair.code === 3 || pair.code === 1).map((pair) => pair.value).join("")
        : getValue(group, 1) ?? "";
      if (point && text) entities.push({ kind: "text", point, text: decodeText(text), height: getNumber(group, 40, 1) });
    }
  }

  const coordinates: DxfVertex[] = [];
  for (const entity of entities) {
    if (entity.kind === "line" || entity.kind === "polyline") coordinates.push(...entity.points);
    else if (entity.kind === "point" || entity.kind === "text") coordinates.push(entity.point);
    else if (entity.kind === "circle") {
      coordinates.push({ x: entity.center.x - entity.radius, y: entity.center.y - entity.radius, z: entity.center.z });
      coordinates.push({ x: entity.center.x + entity.radius, y: entity.center.y + entity.radius, z: entity.center.z });
    } else if (entity.kind === "arc") coordinates.push(...sampleArc(entity.center, entity.radius, entity.startAngle, entity.endAngle));
  }
  const bounds = coordinates.length
    ? coordinates.reduce((current, point) => ({
        minX: Math.min(current.minX, point.x),
        minY: Math.min(current.minY, point.y),
        maxX: Math.max(current.maxX, point.x),
        maxY: Math.max(current.maxY, point.y),
      }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity })
    : EMPTY_BOUNDS;
  if (bounds.maxX === bounds.minX) { bounds.minX -= 1; bounds.maxX += 1; }
  if (bounds.maxY === bounds.minY) { bounds.minY -= 1; bounds.maxY += 1; }
  return { entities, bounds };
}

function entityPairs(type: string, values: Array<[number, string | number]>): Pair[] {
  return [{ code: 0, value: type }, ...values.map(([code, value]) => ({ code, value: String(value) }))];
}

function layerEntity(name: string, color: number): Pair[] {
  return entityPairs("LAYER", [[2, name], [70, 0], [62, color], [6, "CONTINUOUS"]]);
}

function appendLayerDefinitions(pairs: Pair[]): Pair[] {
  const missing = ["POINTS", "LABELS"].filter((name) => {
    for (let index = 0; index < pairs.length; index += 1) {
      if (pairs[index]?.code === 0 && pairs[index]?.value.trim().toUpperCase() === "LAYER" && pairs[index + 1]?.code === 2 && pairs[index + 1]?.value.trim().toUpperCase() === name) return false;
    }
    return true;
  });
  if (!missing.length) return pairs;
  const newLayers = [...(missing.includes("POINTS") ? layerEntity("POINTS", 3) : []), ...(missing.includes("LABELS") ? layerEntity("LABELS", 2) : [])];
  let tablesStart = -1;
  let tablesEnd = -1;
  for (let index = 0; index < pairs.length - 1; index += 1) {
    if (pairs[index]?.code === 0 && pairs[index]?.value.trim().toUpperCase() === "SECTION" && pairs[index + 1]?.code === 2 && pairs[index + 1]?.value.trim().toUpperCase() === "TABLES") {
      tablesStart = index + 2;
      for (let end = tablesStart; end < pairs.length; end += 1) {
        if (pairs[end]?.code === 0 && pairs[end]?.value.trim().toUpperCase() === "ENDSEC") { tablesEnd = end; break; }
      }
      break;
    }
  }
  if (tablesStart >= 0 && tablesEnd >= 0) {
    let layerTableStart = -1;
    let layerTableEnd = -1;
    for (let index = tablesStart; index < tablesEnd - 1; index += 1) {
      if (pairs[index]?.code === 0 && pairs[index]?.value.trim().toUpperCase() === "TABLE" && pairs[index + 1]?.code === 2 && pairs[index + 1]?.value.trim().toUpperCase() === "LAYER") {
        layerTableStart = index;
        for (let end = index + 2; end < tablesEnd; end += 1) {
          if (pairs[end]?.code === 0 && pairs[end]?.value.trim().toUpperCase() === "ENDTAB") { layerTableEnd = end; break; }
        }
        break;
      }
    }
    if (layerTableStart >= 0 && layerTableEnd >= 0) {
      const countPair = pairs.slice(layerTableStart, layerTableEnd).find((pair) => pair.code === 70);
      if (countPair) countPair.value = String(Number(countPair.value) + newLayers.filter((pair) => pair.value === "LAYER").length);
      pairs.splice(layerTableEnd, 0, ...newLayers);
      return pairs;
    }
    if (layerTableStart < 0) {
      pairs.splice(tablesEnd, 0, ...entityPairs("TABLE", [[2, "LAYER"], [70, 2]]), ...newLayers, { code: 0, value: "ENDTAB" });
      return pairs;
    }
  }

  let entitiesSection = pairs.findIndex((pair, index) => pair.code === 0 && pair.value.trim().toUpperCase() === "SECTION" && pairs[index + 1]?.code === 2 && pairs[index + 1]?.value.trim().toUpperCase() === "ENTITIES");
  if (entitiesSection < 0) throw new Error("تعذر إضافة طبقات النقاط إلى ملف DXF.");
  const newTableSection: Pair[] = [
    { code: 0, value: "SECTION" }, { code: 2, value: "TABLES" },
    ...entityPairs("TABLE", [[2, "LAYER"], [70, 2]]), ...newLayers,
    { code: 0, value: "ENDTAB" }, { code: 0, value: "ENDSEC" },
  ];
  pairs.splice(entitiesSection, 0, ...newTableSection);
  return pairs;
}

export function appendPointsToDxf(content: string, points: SurveyPoint[]): string {
  if (!points.length) return content;
  const pairs = parsePairs(content);
  let entityEnd = -1;
  for (let index = 0; index < pairs.length - 2; index += 1) {
    if (pairs[index]?.code === 0 && pairs[index]?.value.trim().toUpperCase() === "SECTION" && pairs[index + 1]?.code === 2 && pairs[index + 1]?.value.trim().toUpperCase() === "ENTITIES") {
      for (let end = index + 2; end < pairs.length; end += 1) {
        if (pairs[end]?.code === 0 && pairs[end]?.value.trim().toUpperCase() === "ENDSEC") { entityEnd = end; break; }
      }
      break;
    }
  }
  if (entityEnd < 0) throw new Error("ملف DXF لا يحتوي على قسم صالح للعناصر.");
  appendLayerDefinitions(pairs);

  const spread = points.reduce((maximum, point) => Math.max(maximum, Math.abs(point.easting), Math.abs(point.northing)), 0);
  const textHeight = Math.max(spread * 0.001, 0.5);
  const added: Pair[] = [];
  for (const point of points) {
    const safeLabel = point.point.replace(/[\r\n\u0000-\u001f]/g, " ").slice(0, 200);
    added.push(...entityPairs("POINT", [[8, "POINTS"], [10, point.easting], [20, point.northing], [30, point.elevation ?? 0]]));
    added.push(...entityPairs("TEXT", [[8, "LABELS"], [10, point.easting + textHeight], [20, point.northing + textHeight], [30, point.elevation ?? 0], [40, textHeight], [1, safeLabel]]));
  }

  let targetEnd = -1;
  for (let index = 0; index < pairs.length - 2; index += 1) {
    if (pairs[index]?.code === 0 && pairs[index]?.value.trim().toUpperCase() === "SECTION" && pairs[index + 1]?.code === 2 && pairs[index + 1]?.value.trim().toUpperCase() === "ENTITIES") {
      for (let end = index + 2; end < pairs.length; end += 1) {
        if (pairs[end]?.code === 0 && pairs[end]?.value.trim().toUpperCase() === "ENDSEC") { targetEnd = end; break; }
      }
      break;
    }
  }
  if (targetEnd < 0) throw new Error("تعذر تحديد نهاية عناصر لوحة DXF.");
  pairs.splice(targetEnd, 0, ...added);
  return pairs.map((pair) => `${pair.code}\r\n${pair.value}`).join("\r\n") + "\r\n";
}

export function dxfBoundsWithPoints(drawing: ParsedDxf | null, points: SurveyPoint[]): ParsedDxf["bounds"] {
  const coordinates = [
    ...(drawing ? [drawing.bounds.minX, drawing.bounds.maxX].flatMap((x) => [{ x, y: drawing.bounds.minY }, { x, y: drawing.bounds.maxY }]) : []),
    ...points.map((point) => ({ x: point.easting, y: point.northing })),
  ];
  if (!coordinates.length) return EMPTY_BOUNDS;
  const bounds = coordinates.reduce((result, point) => ({
    minX: Math.min(result.minX, point.x), minY: Math.min(result.minY, point.y),
    maxX: Math.max(result.maxX, point.x), maxY: Math.max(result.maxY, point.y),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const padX = Math.max((bounds.maxX - bounds.minX) * 0.06, 1);
  const padY = Math.max((bounds.maxY - bounds.minY) * 0.06, 1);
  return { minX: bounds.minX - padX, minY: bounds.minY - padY, maxX: bounds.maxX + padX, maxY: bounds.maxY + padY };
}

export function arcVertices(center: DxfVertex, radius: number, startAngle: number, endAngle: number): DxfVertex[] {
  return sampleArc(center, radius, startAngle, endAngle);
}