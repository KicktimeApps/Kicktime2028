import { describe, expect, it } from "vitest";
import { backupHint } from "./backup-hint";

const T = { start: "2028-06-09T19:00:00Z", end: "2028-07-09T22:00:00Z" };
const at = (iso: string) => Date.parse(iso);
const s = (done: boolean, seen = false, reminded = false) => ({ done, seen, reminded });

describe("Hinweis „Code sichern“", () => {
  it("zuerst einmal, egal wann", () => {
    expect(backupHint(s(false), at("2026-11-01T12:00:00Z"), T)).toBe("first");
  });
  it("nur weggeklickt: Erinnerung ab 14 Tage vor dem Eröffnungsspiel bis zum Ende", () => {
    expect(backupHint(s(true), at("2028-05-25T12:00:00Z"), T)).toBeNull();
    expect(backupHint(s(true), at("2028-05-27T12:00:00Z"), T)).toBe("reminder");
    expect(backupHint(s(true), at("2028-06-20T12:00:00Z"), T)).toBe("reminder");
    expect(backupHint(s(true), at("2028-07-10T12:00:00Z"), T)).toBeNull();
  });
  it("Code angesehen oder Erinnerung weggeklickt: nichts mehr", () => {
    expect(backupHint(s(true, true), at("2028-06-01T12:00:00Z"), T)).toBeNull();
    expect(backupHint(s(true, false, true), at("2028-06-01T12:00:00Z"), T)).toBeNull();
  });
});
