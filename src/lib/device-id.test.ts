import { describe, expect, it } from "vitest";
import { formatRecoveryCode, parseRecoveryCode } from "./device-id";

const ID = "3f2a91c0-7b4e-4d21-9a8c-0e5f6b7c8d9e";

describe("Wiederherstellungs-Code", () => {
  it("zeigt die Geräte-ID in Vierergruppen", () => {
    expect(formatRecoveryCode(ID)).toBe("3F2A 91C0 7B4E 4D21 9A8C 0E5F 6B7C 8D9E");
  });

  it("liest den Code zurück – egal ob mit Leerzeichen, Bindestrichen oder klein", () => {
    expect(parseRecoveryCode(formatRecoveryCode(ID))).toBe(ID);
    expect(parseRecoveryCode(ID)).toBe(ID);
    expect(parseRecoveryCode(" 3f2a-91c0 7b4e4d21\n9A8C0E5F6B7C8D9E ")).toBe(ID);
  });

  it("lehnt unvollständige oder zu lange Codes ab", () => {
    expect(parseRecoveryCode("3F2A 91C0")).toBeNull();
    expect(parseRecoveryCode(formatRecoveryCode(ID) + "A")).toBeNull();
    expect(parseRecoveryCode("")).toBeNull();
  });
});
