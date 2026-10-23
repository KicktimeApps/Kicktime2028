import { describe, expect, it } from "vitest";
import { isNewer } from "./useUpdateCheck";

describe("Update-Hinweis", () => {
  it("meldet nur echte neuere Versionen", () => {
    expect(isNewer("2.10.1", "2.9.0")).toBe(true);
    expect(isNewer("2.11.0", "2.10.9")).toBe(true);
    expect(isNewer("3.0.0", "2.99.99")).toBe(true);
    expect(isNewer("2.10.0", "2.10.0")).toBe(false);
    expect(isNewer("2.9.9", "2.10.0")).toBe(false);
    expect(isNewer("kaputt", "2.10.0")).toBe(false);
  });
});
