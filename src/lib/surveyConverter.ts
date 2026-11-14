export interface SurveyPoint {
  id: string;
  point: string;
  easting: number;
  northing: number;
  elevation: number | null;
  description: string;
}

export interface PointFlags {
  duplicate: boolean;
  outlier: boolean;
}

const numberPattern = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;

export function parseCoordinateNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined) return null;
  const text = String(value).trim().replace(/\s/g, "");
  if (!numberPattern.test(text)) return null;
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function makePoint(
  index: number,
  point: unknown,
  easting: unknown,
  northing: unknown,
  elevation?: unknown,
  description?: unknown,
): SurveyPoint | null {
  const e = parseCoordinateNumber(easting);
  const n = parseCoordinateNumber(northing);
  const id = String(point ?? "").trim();
  if (!id || e === null || n === null) return null;
  return {
    id: `point-${index}`,
    point: id,
    easting: e,
    northing: n,
    elevation: parseCoordinateNumber(elevation),
    description: String(description ?? "").trim(),
  };
}

function headerKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./]+/g, "");
}

function findHeader(headers: string[], choices: string[]): number {
  return headers.findIndex((header) => choices.includes(header));
}

const POINT_HEADERS = ["pc", "point", "pointid", "pointno", "id", "النقطة", "رقمالنقطة"];
const EAST_HEADERS = ["e", "easting", "east", "x", "شرقي", "الشرقيات"];
const NORTH_HEADERS = ["n", "northing", "north", "y", "شمالي", "الشماليات"];
const ELEVATION_HEADERS = ["z", "elevation", "elev", "height", "منسوب", "الارتفاع"];
const DESCRIPTION_HEADERS = ["description", "desc", "code", "الوصف", "الكود"];

export function parseCoordinateRows(rows: unknown[][]): SurveyPoint[] {
  const cleaned = rows.filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));
  if (!cleaned.length) return [];

  const headers = cleaned[0].map(headerKey);
  const pointColumn = findHeader(headers, POINT_HEADERS);
  const eastColumn = findHeader(headers, EAST_HEADERS);
  const northColumn = findHeader(headers, NORTH_HEADERS);
  const hasHeaders = pointColumn >= 0 && eastColumn >= 0 && northColumn >= 0;
  const startIndex = hasHeaders ? 1 : 0;
  const indices = hasHeaders
    ? {
        point: pointColumn,
        east: eastColumn,
        north: northColumn,
        elevation: findHeader(headers, ELEVATION_HEADERS),
        description: findHeader(headers, DESCRIPTION_HEADERS),
      }
    : { point: 0, east: 1, north: 2, elevation: 3, description: 4 };

  const points: SurveyPoint[] = [];
  for (let rowIndex = startIndex; rowIndex < cleaned.length; rowIndex += 1) {
    const row = cleaned[rowIndex];
    const point = makePoint(
      rowIndex,
      row[indices.point],
      row[indices.east],
      row[indices.north],
      indices.elevation >= 0 ? row[indices.elevation] : undefined,
      indices.description >= 0 ? row[indices.description] : undefined,
    );
    if (point) points.push(point);
  }
  return points;
}

export function parseTextCoordinates(text: string): SurveyPoint[] {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const delimiter = line.includes("\t") ? "\t" : line.includes(";") ? ";" : line.includes(",") ? "," : null;
      if (delimiter) return line.split(delimiter).map((cell) => cell.trim().replace(/^['"]|['"]$/g, ""));
      return line.split(/\s+/).map((cell) => cell.trim());
    });
  return parseCoordinateRows(rows);
}

function parseSdr(text: string): SurveyPoint[] {
  const points: SurveyPoint[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.startsWith("08")) return;
    const body = line.slice(4);
    const chunks = Array.from({ length: Math.ceil(body.length / 16) }, (_, chunkIndex) =>
      body.slice(chunkIndex * 16, chunkIndex * 16 + 16).trim(),
    );
    let point = chunks[0] ?? "";
    let northing = parseCoordinateNumber(chunks[1]);
    let easting = parseCoordinateNumber(chunks[2]);
    let elevation = parseCoordinateNumber(chunks[3]);

    if (!point || northing === null || easting === null) {
      const tokens = body.trim().split(/\s+/);
      point = tokens[0] ?? "";
      northing = parseCoordinateNumber(tokens[1]);
      easting = parseCoordinateNumber(tokens[2]);
      elevation = parseCoordinateNumber(tokens[3]);
    }
    const result = makePoint(index, point, easting, northing, elevation);
    if (result) points.push(result);
  });
  return points;
}

function gsiWords(line: string): Map<string, string> {
  const words = new Map<string, string>();
  for (const rawWord of line.trim().split(/\s+/)) {
    const word = rawWord.replace(/^\*/, "");
    const match = word.match(/^(\d{2})(.{4})([+-])(.+)$/);
    if (!match) continue;
    words.set(match[1], `${match[3]}${match[4]}`);
  }
  return words;
}

function parseGsiValue(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = parseCoordinateNumber(value);
  if (parsed === null) return null;
  return parsed / 1000;
}

function parseGsi(text: string): SurveyPoint[] {
  const points: SurveyPoint[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    const words = gsiWords(line);
    const rawPoint = words.get("11");
    const rawEast = words.get("81");
    const rawNorth = words.get("82");
    if (!rawPoint || !rawEast || !rawNorth) return;
    const point = rawPoint.replace(/^[+-]/, "").replace(/^0+(?=\d)/, "");
    const elevation = parseGsiValue(words.get("83"));
    const result = makePoint(index, point, parseGsiValue(rawEast), parseGsiValue(rawNorth), elevation);
    if (result) points.push(result);
  });
  return points;
}

export function parseSurveyFileText(text: string, extension: string): SurveyPoint[] {
  const ext = extension.toLowerCase().replace(/^\./, "");
  if (ext === "sdr") return parseSdr(text);
  if (ext === "gsi") return parseGsi(text);
  return parseTextCoordinates(text);
}

export function detectPointFlags(points: SurveyPoint[]): Record<string, PointFlags> {
  const frequencies = new Map<string, number>();
  for (const point of points) {
    const key = `${point.easting.toFixed(3)}|${point.northing.toFixed(3)}`;
    frequencies.set(key, (frequencies.get(key) ?? 0) + 1);
  }

  const valid = points.filter((point) => Number.isFinite(point.easting) && Number.isFinite(point.northing));
  const extremeValues = new Set<string>();
  if (valid.length >= 4) {
    for (const axis of ["easting", "northing"] as const) {
      const values = valid.map((point) => point[axis]).sort((a, b) => a - b);
      const q1 = values[Math.floor((values.length - 1) * 0.25)];
      const q3 = values[Math.floor((values.length - 1) * 0.75)];
      const spread = q3 - q1;
      if (spread <= 0) continue;
      const low = q1 - spread * 3;
      const high = q3 + spread * 3;
      for (const point of valid) {
        if (point[axis] < low || point[axis] > high) extremeValues.add(point.id);
      }
    }
  }

  return Object.fromEntries(
    points.map((point) => {
      const key = `${point.easting.toFixed(3)}|${point.northing.toFixed(3)}`;
      return [point.id, { duplicate: (frequencies.get(key) ?? 0) > 1, outlier: extremeValues.has(point.id) }];
    }),
  );
}

export function applyCoordinateOptions(
  points: SurveyPoint[],
  options: { swapAxes: boolean; deltaE: number; deltaN: number },
): SurveyPoint[] {
  return points.map((point) => ({
    ...point,
    easting: (options.swapAxes ? point.northing : point.easting) + options.deltaE,
    northing: (options.swapAxes ? point.easting : point.northing) + options.deltaN,
  }));
}

export function serializeCoordinates(points: SurveyPoint[], includeElevation: boolean): string {
  const headers = ["PC", "E", "N", ...(includeElevation ? ["Z"] : [])];
  const values = points.map((point) =>
    [point.point, point.easting.toFixed(3), point.northing.toFixed(3), ...(includeElevation ? [point.elevation?.toFixed(3) ?? ""] : [])].join("\t"),
  );
  return [headers.join("\t"), ...values].join("\r\n");
}

export function serializeDxf(points: SurveyPoint[]): string {
  const lines = [
    "0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1009",
    "0", "ENDSEC", "0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER", "70", "2",
    "0", "LAYER", "2", "POINTS", "70", "0", "62", "3", "6", "CONTINUOUS",
    "0", "LAYER", "2", "LABELS", "70", "0", "62", "2", "6", "CONTINUOUS", "0", "ENDTAB", "0", "ENDSEC",
    "0", "SECTION", "2", "ENTITIES",
  ];
  for (const point of points) {
    const z = point.elevation ?? 0;
    lines.push("0", "POINT", "8", "POINTS", "10", String(point.easting), "20", String(point.northing), "30", String(z));
    lines.push("0", "TEXT", "8", "LABELS", "10", String(point.easting), "20", String(point.northing), "30", String(z), "40", "1.5", "1", point.point);
  }
  lines.push("0", "ENDSEC", "0", "EOF");
  return lines.join("\r\n");
}

export function serializeGsi(points: SurveyPoint[], includeElevation: boolean): string {
  const word = (index: string, value: number | string, signOverride?: "+" | "-") => {
    const isNumber = typeof value === "number";
    const sign = signOverride ?? (isNumber && value < 0 ? "-" : "+");
    const encoded = isNumber
      ? String(Math.round(Math.abs(value) * 1000)).padStart(16, "0")
      : String(value).slice(0, 16).padEnd(16, " ");
    return `*${index}${index === "11" ? "0000" : "..00"}${sign}${encoded}`;
  };
  return points
    .map((point) => {
      const words = [word("11", point.point), word("81", point.easting), word("82", point.northing)];
      if (includeElevation && point.elevation !== null) words.push(word("83", point.elevation));
      return words.join(" ");
    })
    .join("\r\n");
}

export function projectFileName(projectName: string, extension: string): string {
  const safeName = projectName
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .trim()
    .replace(/\s+/g, "-") || "survey-project";
  return `${safeName}.${extension.replace(/^\./, "")}`;
}