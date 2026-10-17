import { CalendarDays, Home, Settings, Target, Trophy } from "lucide-react";

export const NAV_ITEMS = [
  { to: "/", label: "Für dich", icon: Home },
  { to: "/spielplan", label: "Spielplan", icon: CalendarDays },
  { to: "/turnier", label: "Turnier", icon: Trophy },
  { to: "/tipps", label: "Tipps", icon: Target },
  { to: "/einstellungen", label: "Profil", icon: Settings },
] as const;
