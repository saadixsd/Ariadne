/*
  The Door (sign-in art). Presentational only. A red thread enters from the page edge,
  turns through a few labyrinth corners and runs along the threshold to a knot at the
  centre of the door; on narrow screens it rises from below instead. It draws once
  (stroke-dashoffset/opacity only, under 3s) and shows finished under reduced motion.
  The knot is gold only on verify: the one moment that waits on the human.
*/
export function DoorThread({ knot }: { knot: "thread" | "gate" }) {
  const fill = knot === "gate" ? "var(--color-gate)" : "var(--color-thread)";
  return (
    <>
      <svg className="door-thread" viewBox="0 0 760 300" preserveAspectRatio="xMaxYMax meet" aria-hidden>
        <path
          className="door-draw"
          style={{ "--len": 1400, "--dur": "2.6s" } as React.CSSProperties}
          fill="none"
          stroke="var(--color-thread)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M-40 200 H80 V110 H220 V250 H320 V150 H420 V297 H760"
        />
        <circle className="door-fade" style={{ "--delay": "2.4s" } as React.CSSProperties} cx="760" cy="297" r="4.5" fill={fill} />
      </svg>
      <svg className="door-thread-m" viewBox="0 0 120 140" aria-hidden>
        <path
          className="door-draw"
          style={{ "--len": 330, "--dur": "1.8s" } as React.CSSProperties}
          fill="none"
          stroke="var(--color-thread)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20 160 V110 H90 V60 H40 V30 H60 V0"
        />
        <circle className="door-fade" style={{ "--delay": "1.7s" } as React.CSSProperties} cx="60" cy="0" r="4.5" fill={fill} />
      </svg>
    </>
  );
}
