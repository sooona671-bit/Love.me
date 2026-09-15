import { useRef, useState } from "react";
import { X, Pencil, Send, Plus, Play } from "lucide-react";
import type { SelectedMedia } from "@/lib/media";
import { makeSelected, releaseSelected } from "@/lib/media";
import { PhotoEditor } from "@/components/PhotoEditor";

export function MediaTray({
  items,
  setItems,
  onCancel,
  onSend,
  sending,
  title = "Ready to share?",
  sendLabel = "Send all",
}: {
  items: SelectedMedia[];
  setItems: (next: SelectedMedia[]) => void;
  onCancel: () => void;
  onSend: (items: SelectedMedia[]) => void | Promise<void>;
  sending: boolean;
  title?: string;
  sendLabel?: string;
}) {
  const [editing, setEditing] = useState<SelectedMedia | null>(null);

  function remove(id: string) {
    const target = items.find((i) => i.id === id);
    if (target) releaseSelected([target]);
    setItems(items.filter((i) => i.id !== id));
  }

  function addMore(files: FileList | null) {
    if (!files) return;
    const additions = Array.from(files).slice(0, 10 - items.length).map(makeSelected);
    setItems([...items, ...additions]);
  }

  function replace(id: string, edited: File) {
    const target = items.find((i) => i.id === id);
    if (!target) return;
    URL.revokeObjectURL(target.previewUrl);
    setItems(items.map((i) => i.id === id ? {
      ...i, file: edited, previewUrl: URL.createObjectURL(edited),
    } : i));
    setEditing(null);
  }

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }} className="fixed inset-0 z-[60] bg-plum-deep/75 backdrop-blur-md flex items-end sm:items-center justify-center p-3 animate-fade-scale">
      <div onClick={(e) => e.stopPropagation()} className="glass-card rounded-3xl p-4 max-w-lg w-full">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl text-plum">{title}</h2>
          <button onClick={onCancel} className="p-1 text-plum/60"><X className="w-5 h-5" /></button>
        </div>

        <div className="grid grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto">
          {items.map((m, idx) => (
            <div key={m.id}
              className={`relative aspect-square rounded-2xl overflow-hidden bg-white dark:bg-white/10 p-1 shadow-md group ${
                idx % 3 === 1 ? "rotate-1" : "-rotate-1"
              }`}>
              {m.kind === "video" ? (
                <div className="relative w-full h-full">
                  <video src={m.previewUrl} className="w-full h-full object-cover rounded-xl" />
                  <div className="absolute inset-0 grid place-items-center bg-black/20">
                    <Play className="w-6 h-6 text-white/80" />
                  </div>
                </div>
              ) : (
                <img src={m.previewUrl} className="w-full h-full object-cover rounded-xl" />
              )}
              <button onClick={() => remove(m.id)}
                className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-primary text-primary-foreground grid place-items-center shadow-md">
                <X className="w-3.5 h-3.5" />
              </button>
              {m.kind === "image" && (
                <button onClick={() => setEditing(m)}
                  className="absolute bottom-1.5 right-1.5 rounded-full bg-white/90 dark:bg-plum-deep/80 text-plum dark:text-white px-2 py-1 text-[10px] font-semibold flex items-center gap-1 shadow opacity-90 group-hover:opacity-100">
                  <Pencil className="w-3 h-3" /> Edit
                </button>
              )}
              {(m.file.size > 25 * 1024 * 1024) && (
                <span className="absolute top-1.5 left-1.5 text-[9px] font-semibold bg-destructive text-destructive-foreground px-1.5 py-0.5 rounded-full">
                  Large
                </span>
              )}
            </div>
          ))}

          {items.length < 10 && (
            <AddMoreTile onFiles={addMore} />
          )}
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={onCancel} className="flex-1 rounded-full bg-secondary text-secondary-foreground py-2.5 font-semibold">
            Not now
          </button>
          <button
            onClick={() => onSend(items)}
            disabled={sending || items.length === 0}
            className="flex-1 rounded-full bg-primary text-primary-foreground py-2.5 font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Send className="w-4 h-4" />
            {sending ? "Sending…" : `${sendLabel}${items.length > 1 ? ` (${items.length})` : ""}`}
          </button>
        </div>
      </div>

      {editing && (
        <PhotoEditor
          file={editing.file}
          onCancel={() => setEditing(null)}
          onSave={(f) => replace(editing.id, f)}
        />
      )}
    </div>
  );
}

function AddMoreTile({ onFiles }: { onFiles: (f: FileList | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="aspect-square rounded-2xl border-2 border-dashed border-plum/40 grid place-items-center text-plum hover:bg-white/40 dark:hover:bg-white/5 transition"
      >
        <div className="text-center">
          <Plus className="w-6 h-6 mx-auto text-dusk" />
          <p className="text-[10px] font-semibold mt-1">Add more</p>
        </div>
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*,video/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }}
      />
    </>
  );
}

export function MediaPickerButtons({
  onCamera,
  onGallery,
  disabled,
}: {
  onCamera: (files: FileList | null) => void;
  onGallery: (files: FileList | null) => void;
  disabled?: boolean;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => cameraRef.current?.click()}
        className={`flex-1 flex items-center justify-center gap-2 rounded-2xl bg-white/70 dark:bg-white/10 py-3 px-4 font-semibold text-plum ${disabled ? "opacity-60" : ""}`}
      >
        📷 Camera
      </button>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => { onCamera(e.target.files); e.target.value = ""; }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => galleryRef.current?.click()}
        className={`flex-1 flex items-center justify-center gap-2 rounded-2xl bg-primary text-primary-foreground py-3 px-4 font-semibold ${disabled ? "opacity-60" : ""}`}
      >
        🖼️ From gallery
      </button>
      <input
        ref={galleryRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => { onGallery(e.target.files); e.target.value = ""; }}
      />
    </>
  );
}
