import { describe, expect, it } from "vitest";
import { clearErrors, getErrors, logError } from "./error-log";

describe("Fehlerprotokoll", () => {
  it("liefert ohne Änderung denselben Schnappschuss (nötig für useSyncExternalStore)", () => {
    expect(getErrors()).toBe(getErrors());
  });
  it("neuer Schnappschuss nach Änderung, neueste zuerst, max. 50", () => {
    const before = getErrors();
    for (let i = 0; i < 55; i++) logError("system", `f${i}`);
    expect(getErrors()).not.toBe(before);
    expect(getErrors()).toHaveLength(50);
    expect(getErrors()[0].message).toBe("f54");
    clearErrors();
    expect(getErrors()).toHaveLength(0);
  });
});
