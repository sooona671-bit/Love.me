import { useEffect, useRef, useState } from "react";
import { Mic, Square, X } from "lucide-react";

type Props = {
  onRecorded: (blob: Blob, durationSec: number) => void | Promise<void>;
};

export function VoiceRecorder({ onRecorded }: Props) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRef.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  async function start() {
    try {
      if (!window.isSecureContext) {
        alert("Voice notes need a secure (https) connection. Try opening the published site.");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        alert("Your browser doesn't support voice recording.");
        return;
      }
      // Permissions Policy inside preview iframes can block mic access.
      const fp = (document as unknown as { featurePolicy?: { allowsFeature?: (n: string) => boolean } }).featurePolicy;
      if (fp?.allowsFeature && !fp.allowsFeature("microphone")) {
        alert("Microphone is blocked in this preview. Open the published site to record voice notes.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      mediaRef.current = rec;
      chunksRef.current = [];
      cancelledRef.current = false;
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (cancelledRef.current) return;
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        const dur = Math.max(1, Math.round((Date.now() - startRef.current) / 1000));
        void onRecorded(blob, dur);
      };
      rec.start();
      startRef.current = Date.now();
      setSeconds(0);
      setRecording(true);
      timerRef.current = setInterval(() => {
        setSeconds(Math.floor((Date.now() - startRef.current) / 1000));
      }, 250);
    } catch (err) {
      console.error("Voice recorder error:", err);
      const name = (err as { name?: string })?.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        alert("Microphone access was blocked. Enable it in your browser settings and try again.");
      } else if (name === "NotFoundError") {
        alert("No microphone found on this device.");
      } else {
        alert("Couldn't start recording. Please try again.");
      }
    }
  }

  function stop(cancel = false) {
    cancelledRef.current = cancel;
    mediaRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
  }

  if (!recording) {
    return (
      <button
        type="button"
        onClick={start}
        className="p-3 rounded-full bg-secondary text-secondary-foreground hover:scale-105 transition"
        aria-label="Record voice note"
      >
        <Mic className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-full bg-primary/10 border border-primary/30 pl-3 pr-1 py-1">
      <span className="w-2.5 h-2.5 rounded-full bg-coral animate-pulse" />
      <span className="text-xs font-semibold text-plum">Recording · {seconds}s</span>
      <button type="button" onClick={() => stop(true)} className="p-2 rounded-full text-dusk" aria-label="Cancel">
        <X className="w-4 h-4" />
      </button>
      <button type="button" onClick={() => stop(false)} className="p-2 rounded-full bg-primary text-primary-foreground" aria-label="Send voice note">
        <Square className="w-3.5 h-3.5 fill-current" />
      </button>
    </div>
  );
}
