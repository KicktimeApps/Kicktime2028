import { create } from "zustand";

/** Globale Detail-Ansichten (Spiel / Team) – einmal im Root gerendert. */
type UiState = {
  matchId: string | null;
  teamCode: string | null;
  openMatch: (id: string) => void;
  openTeam: (code: string) => void;
  closeMatch: () => void;
  closeTeam: () => void;
};

export const useUi = create<UiState>((set) => ({
  matchId: null,
  teamCode: null,
  openMatch: (matchId) => set({ matchId }),
  openTeam: (teamCode) => set({ teamCode }),
  closeMatch: () => set({ matchId: null }),
  closeTeam: () => set({ teamCode: null }),
}));
