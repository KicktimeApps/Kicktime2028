import { describe, expect, it } from "vitest";
import { sanitizeError, unreported } from "./error-report";

describe("Fehlermeldungen ans Team", () => {
  it("nimmt Kennungen und Adress-Parameter heraus", () => {
    expect(
      sanitizeError(
        "Abruf https://x.supabase.co/rest/v1/rpc/kt_tip_board?apikey=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 für 3f2a91c0-7b4e-4d21-9a8c-0e5f6b7c8d9e\n fehlgeschlagen",
      ),
    ).toBe("Abruf https://x.supabase.co/rest/v1/rpc/kt_tip_board für … fehlgeschlagen");
    expect(sanitizeError("x".repeat(500)).length).toBeLessThanOrEqual(200);
  });
  it("meldet jeden Text nur einmal und höchstens 10 je Sitzung", () => {
    const sent = new Set<string>();
    const e = (message: string) => ({ ts: 1, category: "api" as const, message });
    expect(unreported([e("A"), e("A"), e("B")], sent).map((x) => x.message)).toEqual(["B", "A"]);
    expect(unreported([e("A"), e("B")], sent)).toEqual([]);
    const many = Array.from({ length: 30 }, (_, i) => e(`F${i}`));
    expect(unreported(many, sent).length).toBe(8);
  });
});
