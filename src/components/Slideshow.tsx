import { useEffect, useState } from "react";
import { X, Play, Pause, ChevronLeft, ChevronRight } from "lucide-react";

type Slide = { url: string; type: "image" | "video" | string; caption?: string };

export function Slideshow({
  slides, onClose, title,
}: { slides: Slide[]; onClose: () => void; title?: string }) {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing || slides.length <= 1) return;
    const t = setTimeout(() => setIdx((i) => (i + 1) % slides.length), 4200);
    return () => clearTimeout(t);
  }, [idx, playing, slides.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIdx((i) => (i + 1) % slides.length);
      if (e.key === "ArrowLeft") setIdx((i) => (i - 1 + slides.length) % slides.length);
      if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length, onClose]);

  if (!slides.length) return null;

  return (
    <div className="fixed inset-0 z-50 bg-plum-deep/90 backdrop-blur-xl flex items-center justify-center">
      <button onClick={onClose} className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/10 backdrop-blur grid place-items-center text-white hover:bg-white/20">
        <X className="w-5 h-5" />
      </button>
      {title && <p className="absolute top-6 left-6 text-white/90 font-display text-lg">{title}</p>}

      <div className="relative w-full h-full flex items-center justify-center px-4">
        {slides.map((s, i) => (
          <div
            key={i}
            className="absolute inset-0 flex items-center justify-center transition-opacity duration-[800ms]"
            style={{ opacity: i === idx ? 1 : 0, pointerEvents: i === idx ? "auto" : "none" }}
          >
            {s.type === "video" ? (
              <video src={s.url} autoPlay muted loop className="max-h-[85%] max-w-[92%] rounded-3xl shadow-2xl" />
            ) : (
              <img src={s.url} className="max-h-[85%] max-w-[92%] rounded-3xl shadow-2xl object-contain" />
            )}
          </div>
        ))}
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/10 backdrop-blur rounded-full px-2 py-1.5 text-white">
        <button onClick={() => setIdx((i) => (i - 1 + slides.length) % slides.length)} className="p-2 rounded-full hover:bg-white/10">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button onClick={() => setPlaying((p) => !p)} className="p-2 rounded-full bg-white/20">
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <button onClick={() => setIdx((i) => (i + 1) % slides.length)} className="p-2 rounded-full hover:bg-white/10">
          <ChevronRight className="w-4 h-4" />
        </button>
        <span className="text-xs tabular-nums px-2 opacity-80">{idx + 1} / {slides.length}</span>
      </div>
    </div>
  );
}
