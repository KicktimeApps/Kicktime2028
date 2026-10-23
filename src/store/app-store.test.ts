import { describe, expect, it } from "vitest";
import { useAppStore } from "./app-store";

describe("Vorschau neu starten", () => {
  it("vergisst Vorschau-Tipps und Vorschau-Feier, startet die Uhr neu", () => {
    useAppStore.setState({
      demo: { enabled: true, scenario: "done", startedAt: 1 },
      demoPredictions: { m01: { home: 1, away: 0, createdAt: 1 } },
      demoChampionTip: "GER",
      celebratedChampion: "demo:TUR",
      predictions: { m01: { home: 2, away: 2, createdAt: 1 } },
    });
    useAppStore.getState().restartDemo();
    const s = useAppStore.getState();
    expect(s.demo.enabled).toBe(true);
    expect(s.demo.scenario).toBe("done");
    expect(s.demo.startedAt).toBeGreaterThan(1);
    expect(s.demoPredictions).toEqual({});
    expect(s.demoChampionTip).toBeNull();
    expect(s.celebratedChampion).toBeNull();
    // Echte Tipps bleiben
    expect(s.predictions.m01).toMatchObject({ home: 2, away: 2 });
  });

  it("lässt die echte Feier stehen", () => {
    useAppStore.setState({ celebratedChampion: "TUR" });
    useAppStore.getState().restartDemo();
    expect(useAppStore.getState().celebratedChampion).toBe("TUR");
  });
});
