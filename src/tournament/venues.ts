import type { Venue } from "./types";

/**
 * Die neun Spielstätten der EM 2028 (Stand: UEFA-Spielplan vom 12.11.2025).
 * Kapazitäten laut UEFA-Bewerbung; Villa Park nach Umbau.
 */
export const VENUES: Venue[] = [
  {
    id: "wembley",
    name: "Wembley Stadium",
    uefaName: "Wembley Stadium",
    city: "London",
    country: "ENG",
    capacity: 90000,
    timeZone: "Europe/London",
    airport: "Heathrow (LHR), Gatwick (LGW), Stansted (STN)",
    transit: "U-Bahn Wembley Park (Jubilee & Metropolitan Line), Bahnhof Wembley Stadium",
    climate: "Juni/Juli meist 18–24 °C, Schauer möglich",
  },
  {
    id: "tottenham",
    name: "Tottenham Hotspur Stadium",
    uefaName: "Tottenham Hotspur Stadium",
    city: "London",
    country: "ENG",
    capacity: 62850,
    timeZone: "Europe/London",
    airport: "Heathrow (LHR), Stansted (STN), Gatwick (LGW)",
    transit: "Overground White Hart Lane, Bahnhof Northumberland Park",
    climate: "Juni/Juli meist 18–24 °C, Schauer möglich",
  },
  {
    id: "manchester",
    name: "Etihad Stadium",
    uefaName: "Manchester City Stadium",
    city: "Manchester",
    country: "ENG",
    capacity: 61470,
    timeZone: "Europe/London",
    airport: "Manchester (MAN)",
    transit: "Metrolink-Haltestelle Etihad Campus",
    climate: "Juni/Juli meist 16–21 °C, oft wechselhaft",
  },
  {
    id: "liverpool",
    name: "Hill Dickinson Stadium",
    uefaName: "Everton Stadium",
    city: "Liverpool",
    country: "ENG",
    capacity: 52769,
    timeZone: "Europe/London",
    airport: "Liverpool John Lennon (LPL), Manchester (MAN)",
    transit: "Merseyrail Sandhills, Fußweg ab Stadtzentrum (Bramley-Moore Dock)",
    climate: "Juni/Juli meist 16–20 °C, Wind vom Mersey",
  },
  {
    id: "newcastle",
    name: "St James' Park",
    uefaName: "St James' Park",
    city: "Newcastle",
    country: "ENG",
    capacity: 52264,
    timeZone: "Europe/London",
    airport: "Newcastle (NCL)",
    transit: "Metro St James, wenige Minuten ab Bahnhof Newcastle Central",
    climate: "Juni/Juli meist 15–19 °C, kühle Abende",
  },
  {
    id: "birmingham",
    name: "Villa Park",
    uefaName: "Villa Park",
    city: "Birmingham",
    country: "ENG",
    capacity: 50000,
    timeZone: "Europe/London",
    airport: "Birmingham (BHX)",
    transit: "Bahnhöfe Witton und Aston",
    climate: "Juni/Juli meist 17–22 °C, Schauer möglich",
  },
  {
    id: "glasgow",
    name: "Hampden Park",
    uefaName: "Hampden Park",
    city: "Glasgow",
    country: "SCO",
    capacity: 51866,
    timeZone: "Europe/London",
    airport: "Glasgow (GLA), Edinburgh (EDI)",
    transit: "Bahnhöfe Mount Florida und King's Park",
    climate: "Juni/Juli meist 15–19 °C, Regenjacke einpacken",
  },
  {
    id: "cardiff",
    name: "Principality Stadium",
    uefaName: "National Stadium of Wales",
    city: "Cardiff",
    country: "WAL",
    capacity: 73931,
    timeZone: "Europe/London",
    airport: "Cardiff (CWL), Bristol (BRS)",
    transit: "Direkt in der Innenstadt, 5 Gehminuten ab Cardiff Central",
    climate: "Juni/Juli meist 16–21 °C, Schauer möglich",
  },
  {
    id: "dublin",
    name: "Aviva Stadium",
    uefaName: "Dublin Arena",
    city: "Dublin",
    country: "IRL",
    capacity: 51711,
    timeZone: "Europe/Dublin",
    airport: "Dublin (DUB)",
    transit: "DART-Station Lansdowne Road",
    climate: "Juni/Juli meist 15–19 °C, wechselhaft",
  },
];

const BY_ID = new Map(VENUES.map((v) => [v.id, v]));

export function getVenue(id: string): Venue {
  const v = BY_ID.get(id);
  if (!v) throw new Error(`Unbekannte Spielstätte: ${id}`);
  return v;
}

export const COUNTRY_LABEL: Record<Venue["country"], string> = {
  ENG: "England",
  SCO: "Schottland",
  WAL: "Wales",
  IRL: "Irland",
};
