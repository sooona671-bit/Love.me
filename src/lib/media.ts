import { supabase } from "@/integrations/supabase/client";

export type SelectedMedia = {
  id: string;
  file: File;
  kind: "image" | "video";
  previewUrl: string;
};

export function makeSelected(file: File): SelectedMedia {
  const isVideo = file.type.startsWith("video/");
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    kind: isVideo ? "video" : "image",
    previewUrl: URL.createObjectURL(file),
  };
}

export function releaseSelected(items: SelectedMedia[]) {
  for (const it of items) URL.revokeObjectURL(it.previewUrl);
}

export async function uploadToFamilyMedia(
  userId: string,
  file: File | Blob,
  ext?: string,
): Promise<string> {
  const extension = ext ?? (file instanceof File ? file.name.split(".").pop() || "jpg" : "jpg");
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  const { error } = await supabase.storage.from("family-media").upload(path, file, {
    contentType: (file as File).type || "application/octet-stream",
  });
  if (error) throw error;
  return path;
}

export async function getSignedUrl(path: string, seconds = 60 * 60 * 6): Promise<string | null> {
  const { data } = await supabase.storage.from("family-media").createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}

// ---------- Photo editor filters ----------

export type FilterKey = "original" | "warm" | "soft" | "vintage" | "dusk";

export const FILTERS: { key: FilterKey; label: string; css: string }[] = [
  { key: "original", label: "Original", css: "none" },
  { key: "warm", label: "Warm", css: "sepia(0.25) saturate(1.15) hue-rotate(-8deg) contrast(1.05)" },
  { key: "soft", label: "Soft", css: "brightness(1.05) contrast(0.9) saturate(0.9) blur(0.2px)" },
  { key: "vintage", label: "Vintage", css: "sepia(0.5) saturate(0.85) contrast(0.95) brightness(1.02)" },
  { key: "dusk", label: "Dusk", css: "sepia(0.15) hue-rotate(-15deg) saturate(1.2) contrast(1.1)" },
];

export type EditorOverlay =
  | { id: string; kind: "text"; text: string; x: number; y: number; scale: number; color: string; font: "serif" | "sans" }
  | { id: string; kind: "emoji"; emoji: string; x: number; y: number; scale: number };

export type EditorState = {
  filter: FilterKey;
  brightness: number; // -100..100
  contrast: number;   // -100..100
  rotation: number;   // degrees
  crop: { x: number; y: number; w: number; h: number } | null; // in image px
  overlays: EditorOverlay[];
};

export function defaultEditorState(): EditorState {
  return { filter: "original", brightness: 0, contrast: 0, rotation: 0, crop: null, overlays: [] };
}

export function filterCss(state: Pick<EditorState, "filter" | "brightness" | "contrast">) {
  const base = FILTERS.find((f) => f.key === state.filter)?.css ?? "none";
  const b = 1 + state.brightness / 100;
  const c = 1 + state.contrast / 100;
  return `${base === "none" ? "" : base} brightness(${b}) contrast(${c})`.trim();
}

export async function renderEditedImage(source: File, state: EditorState): Promise<File> {
  const img = await loadImage(URL.createObjectURL(source));
  const rotation = ((state.rotation % 360) + 360) % 360;
  const rad = (rotation * Math.PI) / 180;

  // Determine intermediate canvas (rotated)
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const rotW = Math.round(iw * cos + ih * sin);
  const rotH = Math.round(iw * sin + ih * cos);

  const rotated = document.createElement("canvas");
  rotated.width = rotW;
  rotated.height = rotH;
  const rctx = rotated.getContext("2d")!;
  rctx.translate(rotW / 2, rotH / 2);
  rctx.rotate(rad);
  rctx.filter = filterCss(state);
  rctx.drawImage(img, -iw / 2, -ih / 2);

  // Apply crop (in rotated space); default to full
  const crop = state.crop ?? { x: 0, y: 0, w: rotW, h: rotH };
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(crop.w));
  out.height = Math.max(1, Math.round(crop.h));
  const octx = out.getContext("2d")!;
  octx.drawImage(rotated, crop.x, crop.y, crop.w, crop.h, 0, 0, out.width, out.height);

  // Draw overlays (positions are 0..1 normalized to output canvas)
  for (const ov of state.overlays) {
    const cx = ov.x * out.width;
    const cy = ov.y * out.height;
    octx.save();
    if (ov.kind === "text") {
      const size = 42 * ov.scale;
      octx.font = `600 ${size}px ${ov.font === "serif" ? "Fraunces, Georgia, serif" : "Nunito, Inter, sans-serif"}`;
      octx.fillStyle = ov.color;
      octx.textAlign = "center";
      octx.textBaseline = "middle";
      octx.shadowColor = "rgba(0,0,0,0.35)";
      octx.shadowBlur = 6;
      octx.fillText(ov.text, cx, cy);
    } else {
      const size = 72 * ov.scale;
      octx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji",sans-serif`;
      octx.textAlign = "center";
      octx.textBaseline = "middle";
      octx.fillText(ov.emoji, cx, cy);
    }
    octx.restore();
  }

  URL.revokeObjectURL(img.src);
  const blob = await new Promise<Blob>((resolve) =>
    out.toBlob((b) => resolve(b!), "image/jpeg", 0.9),
  );
  return new File([blob], source.name.replace(/\.[^.]+$/, "") + "-edited.jpg", {
    type: "image/jpeg",
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
