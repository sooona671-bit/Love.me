import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, Images as ImagesIcon, Loader2, Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/setup")({
  component: SetupPage,
});

const field =
  "w-full rounded-2xl bg-input/80 px-4 py-3 border border-border outline-none transition " +
  "focus:border-primary focus:ring-4 focus:ring-primary/20";

function SetupPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickGallery, setPickGallery] = useState(false);
  const [galleryItems, setGalleryItems] = useState<{ url: string; signed: string }[]>([]);
  const [loadingGallery, setLoadingGallery] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data: prof } = await supabase.from("profiles").select("display_name, avatar_url").eq("id", user.id).maybeSingle();
      const metaName = (user.user_metadata as Record<string, unknown> | undefined)?.["display_name"];
      setName(prof?.display_name || (typeof metaName === "string" ? metaName : "") || "");
      if (prof?.avatar_url) {
        setAvatarPath(prof.avatar_url);
        setPreview(await signedFor(prof.avatar_url));
      }
    })();
  }, [user.id]);

  async function signedFor(path: string) {
    if (path.startsWith("http")) return path;
    const { data } = await supabase.storage.from("family-media").createSignedUrl(path, 60 * 60 * 6);
    return data?.signedUrl ?? null;
  }

  async function handleFile(file: File) {
    setUploading(true);
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("family-media").upload(path, file);
    if (error) {
      setUploading(false);
      return toast.error(error.message);
    }
    setAvatarPath(path);
    setPreview(await signedFor(path));
    setUploading(false);
  }

  async function openGallery() {
    setPickGallery(true);
    setLoadingGallery(true);
    const { data } = await supabase
      .from("messages")
      .select("media_url")
      .eq("media_type", "image")
      .not("media_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(60);
    const items = await Promise.all(
      (data ?? []).filter((d) => d.media_url).map(async (d) => ({
        url: d.media_url!,
        signed: (await signedFor(d.media_url!)) ?? "",
      })),
    );
    setGalleryItems(items.filter((i) => i.signed));
    setLoadingGallery(false);
  }

  async function finish() {
    if (!name.trim() || saving) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: name.trim(),
        avatar_url: avatarPath,
        onboarded: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`You're all set, ${name.trim()} 🌸`);
    navigate({ to: "/chat", replace: true });
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-8">
      <div className="glass-card rounded-3xl p-8 w-full max-w-md relative animate-fade-scale">
        <div className="absolute -top-8 -left-8 w-24 h-24 blob bg-lavender/70 blur-xl -z-10" />
        <h1 className="font-display text-3xl text-plum">Let's make it yours ✨</h1>
        <p className="mt-2 text-sm text-muted-foreground">A name and a face so everyone knows it's you.</p>

        <div className="mt-6 flex flex-col items-center gap-3">
          <div className="w-24 h-24 rounded-full overflow-hidden bg-primary/15 grid place-items-center ring-4 ring-primary/10">
            {preview ? (
              <img src={preview} alt="Your profile picture" className="w-full h-full object-cover" />
            ) : (
              <span className="font-display text-3xl text-plum">{(name || "?").charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }}
            />
            <button
              type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="rounded-full border border-border bg-white/70 px-4 py-2 text-sm font-medium text-plum hover:bg-white transition flex items-center gap-2"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload photo
            </button>
            <button
              type="button" onClick={openGallery}
              className="rounded-full border border-border bg-white/70 px-4 py-2 text-sm font-medium text-plum hover:bg-white transition flex items-center gap-2"
            >
              <ImagesIcon className="w-4 h-4" /> From gallery
            </button>
          </div>
        </div>

        <label className="mt-6 block text-sm text-muted-foreground">Your name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aayam" className={`mt-1 ${field}`} />

        <button
          onClick={finish}
          disabled={!name.trim() || saving}
          className="mt-6 w-full rounded-full bg-primary text-primary-foreground py-3 font-semibold transition
                     disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground
                     flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {saving ? "Saving…" : "Into the chat"}
        </button>
      </div>

      {pickGallery && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-4"
             onClick={() => setPickGallery(false)}
             onKeyDown={(e) => { if (e.key === "Escape") setPickGallery(false); }}
             tabIndex={-1}
             ref={(el) => el?.focus()}>
          <div className="glass-card rounded-3xl p-5 w-full max-w-lg max-h-[75vh] overflow-y-auto"
               onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-2xl text-plum">Pick from the family gallery</h2>
              <button type="button" aria-label="Close gallery picker"
                onClick={() => setPickGallery(false)}
                className="rounded-full px-3 py-1 text-sm bg-white/60 dark:bg-white/10 text-plum">Close</button>
            </div>

            {loadingGallery && <p className="mt-4 text-sm text-muted-foreground">Loading photos…</p>}
            {!loadingGallery && galleryItems.length === 0 && (
              <p className="mt-4 text-sm text-muted-foreground">No shared photos yet — upload one instead.</p>
            )}
            <div className="mt-4 grid grid-cols-3 gap-2">
              {galleryItems.map((it) => (
                <button
                  key={it.url}
                  onClick={() => { setAvatarPath(it.url); setPreview(it.signed); setPickGallery(false); }}
                  className="aspect-square rounded-2xl overflow-hidden hover:ring-4 ring-primary/40 transition"
                >
                  <img src={it.signed} alt="Shared family photo" className="w-full h-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
