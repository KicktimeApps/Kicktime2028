import { describe, expect, it } from "vitest";
import { nextTap, type TapState } from "./secret-taps";

const tapAt = (times: number[]) => {
  let s: TapState = { n: 0, t: 0 };
  const opened: number[] = [];
  for (const t of times) {
    const r = nextTap(s, t);
    s = r.state;
    if (r.open) opened.push(t);
  }
  return opened;
};

describe("Versteckter Zugang (5× tippen)", () => {
  it("öffnet beim 5. schnellen Tippen", () => {
    expect(tapAt([10_000, 10_300, 10_600, 10_900, 11_200])).toEqual([11_200]);
  });
  it("4 Tipper reichen nicht", () => {
    expect(tapAt([10_000, 10_300, 10_600, 10_900])).toEqual([]);
  });
  it("Pause über 1,5 s beginnt neu", () => {
    expect(tapAt([10_000, 10_300, 10_600, 12_500, 12_800, 13_100, 13_400])).toEqual([]);
    expect(tapAt([10_000, 10_300, 10_600, 12_500, 12_800, 13_100, 13_400, 13_700])).toEqual([
      13_700,
    ]);
  });
  it("nach dem Öffnen zählt es wieder von vorn", () => {
    const t = [10_000, 10_200, 10_400, 10_600, 10_800];
    expect(tapAt([...t, 11_000, 11_200, 11_400, 11_600])).toEqual([10_800]);
  });
});
