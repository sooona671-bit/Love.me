import { useEffect, useState } from "react";

const PIP_LAYOUT: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
};

export function Dice({ value, rolling, onRoll, disabled }: {
  value: number | null;
  rolling: boolean;
  onRoll: () => void;
  disabled: boolean;
}) {
  const [flash, setFlash] = useState<number | null>(null);
  useEffect(() => {
    if (!rolling) { setFlash(null); return; }
    const id = setInterval(() => setFlash(1 + Math.floor(Math.random() * 6)), 80);
    return () => clearInterval(id);
  }, [rolling]);
  const shown = rolling ? (flash ?? 1) : (value ?? 1);
  const pips = PIP_LAYOUT[shown] ?? [];

  return (
    <button
      onClick={onRoll}
      disabled={disabled}
      className={`relative w-16 h-16 rounded-2xl grid grid-cols-3 grid-rows-3 gap-0.5 p-2 transition
        ${disabled ? "opacity-50 cursor-not-allowed" : "hover:scale-105 active:scale-95"}
        ${rolling ? "animate-[gentle-tilt_0.25s_ease-in-out_infinite]" : ""}`}
      style={{
        background: "linear-gradient(135deg, #ffb0c9, #e86b88)",
        boxShadow: "0 8px 22px -8px rgba(232,107,136,0.55), inset 0 -3px 0 rgba(164,55,84,0.35)",
      }}
      aria-label="Roll dice"
    >
      {[...Array(9)].map((_, i) => {
        const r = Math.floor(i / 3);
        const c = i % 3;
        const on = pips.some(([pr, pc]) => pr === r && pc === c);
        return (
          <span key={i} className={`w-full h-full rounded-full ${on ? "bg-white" : ""}`} />
        );
      })}
    </button>
  );
}