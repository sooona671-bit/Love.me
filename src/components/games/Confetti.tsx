import { useEffect, useRef } from "react";

const COLORS = [
  "oklch(0.74 0.16 25)",   // coral
  "oklch(0.86 0.05 300)",  // lavender
  "oklch(0.82 0.10 82)",   // muted gold
  "oklch(0.82 0.09 12)",   // dusty rose
  "oklch(0.55 0.12 340)",  // dusk
];

export function Confetti({ show }: { show: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!show || !ref.current) return;
    const c = ref.current;
    const ctx = c.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      c.width = c.clientWidth * dpr;
      c.height = c.clientHeight * dpr;
    };
    resize();
    window.addEventListener("resize", resize);

    type P = { x: number; y: number; vx: number; vy: number; g: number; s: number; r: number; vr: number; c: string };
    const parts: P[] = [];
    const w = c.width;
    for (let i = 0; i < 140; i++) {
      parts.push({
        x: w / 2,
        y: c.height * 0.25,
        vx: (Math.random() - 0.5) * 16 * dpr,
        vy: (Math.random() * -14 - 4) * dpr,
        g: 0.35 * dpr,
        s: (6 + Math.random() * 6) * dpr,
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        c: COLORS[Math.floor(Math.random() * COLORS.length)],
      });
    }

    let raf = 0;
    let t = 0;
    const step = () => {
      t++;
      ctx.clearRect(0, 0, c.width, c.height);
      for (const p of parts) {
        p.vy += p.g;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
      }
      if (t < 240) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [show]);

  if (!show) return null;
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-50 w-full h-full" />;
}
