import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyCoordinateOptions,
  detectPointFlags,
  parseCoordinateRows,
  parseSurveyFileText,
  projectFileName,
  serializeCoordinates,
  serializeDxf,
  serializeGsi,
  serializeSdr,
  type SurveyPoint,
} from "./surveyConverter";

describe("survey coordinate conversion", () => {
  it("parses labeled coordinate rows and comma decimals", () => {
    const points = parseCoordinateRows([
      ["PC", "N", "E", "Z", "Description"],
      ["A1", "25,125", "100.5", "3.25", "control"],
    ]);
    assert.deepEqual(points.map(({ point, easting, northing, elevation }) => ({ point, easting, northing, elevation })), [
      { point: "A1", easting: 100.5, northing: 25.125, elevation: 3.25 },
    ]);
  });

  it("reads fixed-width SDR coordinates in northing/easting field order", () => {
    const record = "08TP" + "P1".padEnd(16) + "20.500".padEnd(16) + "10.250".padEnd(16) + "3.000".padEnd(16);
    const points = parseSurveyFileText(record, "sdr");
    assert.equal(points[0]?.point, "P1");
    assert.equal(points[0]?.easting, 10.25);
    assert.equal(points[0]?.northing, 20.5);
  });

  it("round-trips GSI coordinate values to millimeter precision", () => {
    const source: SurveyPoint[] = [{ id: "p1", point: "15", easting: 123.456, northing: -54.321, elevation: 2.5, description: "" }];
    const imported = parseSurveyFileText(serializeGsi(source, true), "gsi");
    assert.equal(imported[0]?.point, "15");
    assert.equal(imported[0]?.easting, 123.456);
    assert.equal(imported[0]?.northing, -54.321);
    assert.equal(imported[0]?.elevation, 2.5);
  });

  it("exports SDR coordinate records using the fixed-width point fields", () => {
    const source: SurveyPoint[] = [{ id: "p1", point: "P1", easting: 10.25, northing: 20.5, elevation: 3, description: "" }];
    const output = serializeSdr(source);
    const imported = parseSurveyFileText(output, "sdr");
    assert.equal(imported[0]?.point, "P1");
    assert.equal(imported[0]?.easting, 10.25);
    assert.equal(imported[0]?.northing, 20.5);
    assert.equal(imported[0]?.elevation, 3);
  });

  it("marks repeated coordinates and removes unsafe filename characters", () => {
    const points: SurveyPoint[] = [
      { id: "a", point: "A", easting: 1, northing: 1, elevation: null, description: "" },
      { id: "b", point: "B", easting: 1.0002, northing: 1, elevation: null, description: "" },
    ];
    assert.equal(detectPointFlags(points).a?.duplicate, true);
    assert.equal(projectFileName("Villa / 7", "xlsx"), "Villa---7.xlsx");
  });

  it("swaps and offsets axes and writes export headers/entities", () => {
    const source: SurveyPoint[] = [{ id: "p1", point: "P1", easting: 100, northing: 200, elevation: null, description: "" }];
    const changed = applyCoordinateOptions(source, { swapAxes: true, deltaE: 5, deltaN: -2 });
    assert.equal(changed[0]?.easting, 205);
    assert.equal(changed[0]?.northing, 98);
    assert.match(serializeCoordinates(changed, false), /^PC\tE\tN/);
    assert.match(serializeDxf(changed), /\r\nPOINTS\r\n/);
  });
});