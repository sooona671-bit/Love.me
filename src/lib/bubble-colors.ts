export type BubbleColor = "coral" | "lavender" | "dusty-rose" | "muted-gold";

export const BUBBLE_COLORS: { key: BubbleColor; label: string; swatch: string }[] = [
  { key: "coral", label: "Warm coral", swatch: "linear-gradient(135deg, oklch(0.78 0.15 25), oklch(0.72 0.17 15))" },
  { key: "lavender", label: "Soft lavender", swatch: "linear-gradient(135deg, oklch(0.9 0.05 300), oklch(0.84 0.08 320))" },
  { key: "dusty-rose", label: "Dusty rose", swatch: "linear-gradient(135deg, oklch(0.82 0.09 12), oklch(0.76 0.11 5))" },
  { key: "muted-gold", label: "Muted gold", swatch: "linear-gradient(135deg, oklch(0.86 0.09 82), oklch(0.80 0.11 76))" },
];

export function bubbleClass(color: BubbleColor | null | undefined, mine: boolean): string {
  const c = (color ?? (mine ? "coral" : "lavender")) as BubbleColor;
  const shape = mine ? "bubble-shape-mine" : "bubble-shape-theirs";
  return `bubble-${c} ${shape}`;
}
