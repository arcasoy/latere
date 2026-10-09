import assert from "node:assert/strict";
import test from "node:test";
import { type Chart, chartRows } from "./model";

const fixture = (): Chart => ({
  measures: [{ display_name: "Paid" }, { display_name: "Trials" }],
  values: [
    { cohort: 1780272000, measure: 1, value: 4, incomplete: true },
    { cohort: 1780272000, measure: 0, value: 0, incomplete: false },
  ],
});
test("chart columns follow measure names and preserve true zero and partial periods", () => {
  assert.deepEqual(chartRows(fixture(), ["Trials", "Paid"]), [
    { start: "2026-06-01", incomplete: true, values: [4, 0] },
  ]);
});
test("missing values stay unavailable and missing measures fail", () => {
  const chart = fixture();
  chart.values.pop();
  assert.deepEqual(chartRows(chart, ["Trials", "Paid"])[0]?.values, [4, null]);
  assert.throws(() => chartRows(chart, ["Proceeds"]), /missing/);
});
test("duplicate or unsupported chart results cannot inflate totals", () => {
  const chart = fixture();
  const first = chart.values[0];
  assert.ok(first);
  chart.values.push(first);
  assert.throws(() => chartRows(chart, ["Trials"]), /Duplicate/);
  assert.throws(
    () => chartRows({ ...fixture(), unsupported_params: ["resolution"] }, ["Trials"]),
    /Unexpected/,
  );
});
