import { useEffect, useMemo, useRef, useState } from "react";
import { Crop, Sparkles, Sliders, Type, Smile, RotateCcw, RotateCw, X, Check, Trash2 } from "lucide-react";
import {
  FILTERS,
  type EditorState,
  type EditorOverlay,
  type FilterKey,
  defaultEditorState,
  filterCss,
  renderEditedImage,
} from "@/lib/media";

const ASPECTS: { label: string; value: number | null }[] = [
  { label: "Free", value: null },
  { label: "1:1", value: 1 },
  { label: "4:5", value: 4 / 5 },
  { label: "16:9", value: 16 / 9 },
];

const TEXT_COLORS = ["#F8ECE0", "#FF8A6B", "#C79EFF", "#F5C97A"];
const WARM_EMOJI = ["🌙", "✨", "🧡", "🌸", "🕯️", "🍂", "❤️", "🌷", "☕️", "🥐"];

type Tab = "crop" | "filter" | "adjust" | "text";

export function PhotoEditor({
  file,
  onCancel,
  onSave,
}: {
  file: File;
  onCancel: () => void;
  onSave: (edited: File) => void;
}) {
  const [state, setState] = useState<EditorState>(defaultEditorState());
  const [tab, setTab] = useState<Tab>("filter");
  const [aspect, setAspect] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedOverlay, setSelectedOverlay] = useState<string | null>(null);

  const previewUrl = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);

  async function commit() {
    setSaving(true);
    try {
      const edited = await renderEditedImage(file, state);
      onSave(edited);
    } finally {
      setSaving(false);
    }
  }

  function addText() {
    const id = `t-${Date.now()}`;
    const ov: EditorOverlay = {
      id, kind: "text", text: "Say something warm",
      x: 0.5, y: 0.5, scale: 1, color: TEXT_COLORS[0], font: "serif",
    };
    setState((s) => ({ ...s, overlays: [...s.overlays, ov] }));
    setSelectedOverlay(id);
  }

  function addEmoji(emoji: string) {
    const id = `e-${Date.now()}`;
    const ov: EditorOverlay = { id, kind: "emoji", emoji, x: 0.5, y: 0.5, scale: 1 };
    setState((s) => ({ ...s, overlays: [...s.overlays, ov] }));
    setSelectedOverlay(id);
  }

  function updateOverlay(id: string, patch: Partial<EditorOverlay>) {
    setState((s) => ({
      ...s,
      overlays: s.overlays.map((o) => (o.id === id ? ({ ...o, ...patch } as EditorOverlay) : o)),
    }));
  }

  function deleteOverlay(id: string) {
    setState((s) => ({ ...s, overlays: s.overlays.filter((o) => o.id !== id) }));
    setSelectedOverlay(null);
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col"
      onClick={(e) => e.stopPropagation()}

      style={{
        background:
          "radial-gradient(ellipse at 20% 20%, oklch(0.35 0.10 320 / 0.9), transparent 60%), radial-gradient(ellipse at 80% 90%, oklch(0.45 0.14 25 / 0.6), transparent 60%), oklch(0.14 0.06 320)",
      }}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={onCancel} className="text-white/80 hover:text-white text-sm px-4 py-2 rounded-full">
          Cancel
        </button>
        <p className="font-display text-white/90 text-lg">Make it feel warm</p>
        <button
          onClick={commit}
          disabled={saving}
          className="rounded-full bg-primary text-primary-foreground px-5 py-2 text-sm font-semibold flex items-center gap-1.5 disabled:opacity-60"
        >
          <Check className="w-4 h-4" /> {saving ? "…" : "Save"}
        </button>
      </div>

      <div className="flex-1 grid place-items-center px-4 py-2 min-h-0">
        <EditorCanvas
          src={previewUrl}
          state={state}
          selected={selectedOverlay}
          onSelect={setSelectedOverlay}
          onMove={(id, x, y) => updateOverlay(id, { x, y })}
          aspect={aspect}
        />
      </div>

      <div className="p-3 space-y-3">
        {tab === "crop" && (
          <div className="glass-card rounded-3xl p-4 space-y-3">
            <div className="flex gap-2 overflow-x-auto">
              {ASPECTS.map((a) => (
                <button key={a.label} onClick={() => setAspect(a.value)}
                  className={`px-4 py-1.5 rounded-full text-sm font-semibold shrink-0 transition ${
                    aspect === a.value ? "bg-primary text-primary-foreground" : "bg-white/15 text-white/90"
                  }`}>
                  {a.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setState((s) => ({ ...s, rotation: s.rotation - 90 }))}
                className="p-2 rounded-full bg-white/15 text-white"
              ><RotateCcw className="w-4 h-4" /></button>
              <input
                type="range" min={-45} max={45} value={state.rotation % 90}
                onChange={(e) => setState((s) => ({ ...s, rotation: Number(e.target.value) }))}
                className="cozy-slider flex-1"
              />
              <button
                onClick={() => setState((s) => ({ ...s, rotation: s.rotation + 90 }))}
                className="p-2 rounded-full bg-white/15 text-white"
              ><RotateCw className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {tab === "filter" && (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {FILTERS.map((f) => (
              <button key={f.key} onClick={() => setState((s) => ({ ...s, filter: f.key as FilterKey }))}
                className={`shrink-0 rounded-2xl overflow-hidden border-2 transition ${
                  state.filter === f.key ? "border-primary" : "border-transparent"
                }`}>
                <div className="w-20 h-20 bg-cover bg-center"
                  style={{ backgroundImage: `url(${previewUrl})`, filter: filterCss({ filter: f.key as FilterKey, brightness: 0, contrast: 0 }) }} />
                <p className="text-xs font-semibold text-white/90 py-1.5 px-2 bg-white/10">{f.label}</p>
              </button>
            ))}
          </div>
        )}

        {tab === "adjust" && (
          <div className="glass-card rounded-3xl p-4 space-y-4">
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-white/70 font-semibold">Brightness</span>
              <input type="range" min={-100} max={100} value={state.brightness}
                onChange={(e) => setState((s) => ({ ...s, brightness: Number(e.target.value) }))}
                className="cozy-slider w-full mt-1" />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-white/70 font-semibold">Contrast</span>
              <input type="range" min={-100} max={100} value={state.contrast}
                onChange={(e) => setState((s) => ({ ...s, contrast: Number(e.target.value) }))}
                className="cozy-slider w-full mt-1" />
            </label>
          </div>
        )}

        {tab === "text" && (
          <div className="glass-card rounded-3xl p-4 space-y-3">
            <div className="flex gap-2">
              <button onClick={addText} className="flex-1 rounded-full bg-primary text-primary-foreground py-2 font-semibold text-sm flex items-center justify-center gap-2">
                <Type className="w-4 h-4" /> Add text
              </button>
              {selectedOverlay && (
                <button onClick={() => deleteOverlay(selectedOverlay)} className="p-2 rounded-full bg-destructive text-destructive-foreground">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            {selectedOverlay && (() => {
              const ov = state.overlays.find((o) => o.id === selectedOverlay);
              if (!ov) return null;
              if (ov.kind === "text") {
                return (
                  <div className="space-y-2">
                    <input
                      value={ov.text}
                      onChange={(e) => updateOverlay(ov.id, { text: e.target.value })}
                      className="w-full rounded-2xl bg-white/15 px-3 py-2 text-white placeholder:text-white/50 outline-none"
                      placeholder="Type…"
                    />
                    <div className="flex gap-2 items-center">
                      {TEXT_COLORS.map((c) => (
                        <button key={c} onClick={() => updateOverlay(ov.id, { color: c })}
                          className={`w-7 h-7 rounded-full border-2 ${ov.color === c ? "border-white" : "border-white/20"}`}
                          style={{ background: c }} />
                      ))}
                      <button onClick={() => updateOverlay(ov.id, { font: ov.font === "serif" ? "sans" : "serif" })}
                        className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-full bg-white/15 text-white">
                        {ov.font === "serif" ? "Serif" : "Sans"}
                      </button>
                    </div>
                    <input type="range" min={0.4} max={2.5} step={0.05} value={ov.scale}
                      onChange={(e) => updateOverlay(ov.id, { scale: Number(e.target.value) })}
                      className="cozy-slider w-full" />
                  </div>
                );
              }
              return (
                <input type="range" min={0.4} max={3} step={0.05} value={ov.scale}
                  onChange={(e) => updateOverlay(ov.id, { scale: Number(e.target.value) })}
                  className="cozy-slider w-full" />
              );
            })()}
            <div className="flex gap-2 overflow-x-auto pt-1">
              {WARM_EMOJI.map((e) => (
                <button key={e} onClick={() => addEmoji(e)} className="text-2xl shrink-0 hover:scale-125 transition">{e}</button>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-around bg-white/10 rounded-full p-1.5 backdrop-blur">
          <TabBtn active={tab === "crop"} onClick={() => setTab("crop")} icon={<Crop className="w-4 h-4" />} label="Crop" />
          <TabBtn active={tab === "filter"} onClick={() => setTab("filter")} icon={<Sparkles className="w-4 h-4" />} label="Filter" />
          <TabBtn active={tab === "adjust"} onClick={() => setTab("adjust")} icon={<Sliders className="w-4 h-4" />} label="Adjust" />
          <TabBtn active={tab === "text"} onClick={() => setTab("text")} icon={<Smile className="w-4 h-4" />} label="Text" />
        </div>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition ${
        active ? "bg-primary text-primary-foreground" : "text-white/80"
      }`}>
      {icon}<span>{label}</span>
    </button>
  );
}

function EditorCanvas({
  src, state, aspect, selected, onSelect, onMove,
}: {
  src: string;
  state: EditorState;
  aspect: number | null;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);

  function startDrag(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    onSelect(id);
    const el = boxRef.current;
    if (!el) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    const handler = (ev: PointerEvent) => {
      const x = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));
      onMove(id, x, y);
    };
    const up = () => {
      window.removeEventListener("pointermove", handler);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", handler);
    window.addEventListener("pointerup", up);
  }

  return (
    <div ref={boxRef}
      onPointerDown={() => onSelect(null)}
      className="relative bg-black/40 rounded-3xl overflow-hidden max-h-full max-w-full shadow-2xl"
      style={aspect ? { aspectRatio: String(aspect), width: "min(90vw, 60vh * " + aspect + ")" } : {}}
    >
      <img
        src={src}
        style={{
          filter: filterCss(state),
          transform: `rotate(${state.rotation}deg)`,
          transition: "filter 0.15s ease",
        }}
        className="block max-h-[60vh] max-w-full object-contain"
      />
      {state.overlays.map((ov) => (
        <div key={ov.id}
          onPointerDown={(e) => startDrag(e, ov.id)}
          className={`absolute select-none cursor-move ${selected === ov.id ? "outline-2 outline-dashed outline-white/70 rounded-lg" : ""}`}
          style={{
            left: `${ov.x * 100}%`, top: `${ov.y * 100}%`,
            transform: "translate(-50%, -50%)",
            padding: 6,
          }}
        >
          {ov.kind === "text" ? (
            <span
              style={{
                color: ov.color,
                fontFamily: ov.font === "serif" ? "Fraunces, Georgia, serif" : "Nunito, Inter, sans-serif",
                fontWeight: 600,
                fontSize: `${18 * ov.scale}px`,
                textShadow: "0 2px 6px rgba(0,0,0,0.4)",
              }}
            >{ov.text}</span>
          ) : (
            <span style={{ fontSize: `${28 * ov.scale}px` }}>{ov.emoji}</span>
          )}
        </div>
      ))}
    </div>
  );
}
