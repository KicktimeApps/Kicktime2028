import { useRef } from "react";

/**
 * Tor-Moment: Die neue Ziffer rutscht von unten herein (CSS, `score-flip` in
 * styles.css). Beim ersten Anzeigen nichts – nur echte Änderungen.
 */
export function ScoreDigit({ value }: { value: number }) {
  const initial = useRef(value);
  return (
    <span className="relative inline-flex overflow-hidden align-bottom">
      <span
        key={value}
        className={value !== initial.current ? "score-flip inline-block" : "inline-block"}
      >
        {value}
      </span>
    </span>
  );
}
