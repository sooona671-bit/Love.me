import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";

export function WaveformPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => { setProgress(a.currentTime); };
    const onLoaded = () => { if (Number.isFinite(a.duration)) setDuration(a.duration); };
    const onEnd = () => { setPlaying(false); setProgress(0); };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("ended", onEnd);
    };
  }, [src]);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { void a.play(); setPlaying(true); }
  }

  const bars = 22;
  const pct = duration ? progress / duration : 0;

  const fmt = (s: number) => {
    if (!Number.isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 min-w-[220px]">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        onClick={toggle}
        className="w-10 h-10 rounded-full grid place-items-center bg-white/70 dark:bg-white/15 text-plum-deep shrink-0 hover:scale-105 transition"
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <div className="flex-1 flex items-end gap-[3px] h-8">
        {Array.from({ length: bars }).map((_, i) => {
          const seed = 0.35 + ((i * 13) % 7) / 10;
          const played = pct * bars > i;
          return (
            <span
              key={i}
              className={`flex-1 rounded-full ${playing ? "animate-wave-bar" : ""}`}
              style={{
                height: `${seed * 100}%`,
                animationDelay: `${(i % 6) * 0.08}s`,
                background: played
                  ? "linear-gradient(180deg, var(--coral), var(--dusk))"
                  : "linear-gradient(180deg, var(--lavender), var(--lavender-deep))",
                opacity: played ? 1 : 0.6,
              }}
            />
          );
        })}
      </div>
      <span className="text-[11px] tabular-nums opacity-70 shrink-0">
        {fmt(playing || progress > 0 ? progress : duration)}
      </span>
    </div>
  );
}
