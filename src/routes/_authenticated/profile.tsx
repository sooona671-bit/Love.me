import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, Images as ImagesIcon, Moon, Sun, MapPin, MapPinOff, MessageCircle } from "lucide-react";
import { BUBBLE_COLORS, type BubbleColor } from "@/lib/bubble-colors";
import { applyDarkMode, readDarkModePref } from "@/lib/dark-mode";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

const MOODS = ["😊", "☕️", "💼", "🌙", "🏖️", "🍳", "📚", "🚗", "🎉", "❤️"];

function ProfilePage() {
  const { user } = Route.useRouteContext();
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [signedAvatar, setSignedAvatar] = useState<string | null>(null);
  const [bubbleColor, setBubbleColor] = useState<BubbleColor>("coral");
  const [statusEmoji, setStatusEmoji] = useState<string>("");
  const [statusText, setStatusText] = useState<string>("");
  const [dark, setDark] = useState(false);
  const [locEnabled, setLocEnabled] = useState(false);
  const [locLabel, setLocLabel] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [pickGallery, setPickGallery] = useState(false);
  const [galleryItems, setGalleryItems] = useState<{ url: string; signed: string }[]>([]);
  const [family, setFamily] = useState<{ id: string; display_name: string; avatar_url: string | null; signed: string | null; status_emoji: string | null }[]>([]);
  const locTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setDark(readDarkModePref());
    void (async () => {
      const [{ data: prof }, { data: loc }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("location_shares").select("*").eq("user_id", user.id).maybeSingle(),
      ]);
      if (prof) {
        setDisplayName(prof.display_name);
        setAvatarUrl(prof.avatar_url);
        setBubbleColor((prof.bubble_color as BubbleColor) || "coral");
        setStatusEmoji(prof.status_emoji ?? "");
        setStatusText(prof.status_text ?? "");
        if (prof.avatar_url && !prof.avatar_url.startsWith("http")) {
          const { data: s } = await supabase.storage.from("family-media").createSignedUrl(prof.avatar_url, 60 * 60 * 6);
          setSignedAvatar(s?.signedUrl ?? null);
        } else {
          setSignedAvatar(prof.avatar_url);
        }
      }
      if (loc) {
        setLocEnabled(loc.enabled);
        setLocLabel(loc.place_label ?? "");
      }

      const { data: fam } = await supabase.from("profiles")
        .select("id, display_name, avatar_url, status_emoji").neq("id", user.id);
      if (fam) {
        const withSigned = await Promise.all(fam.map(async (p) => {
          let signed: string | null = null;
          if (p.avatar_url) {
            signed = p.avatar_url.startsWith("http")
              ? p.avatar_url
              : (await supabase.storage.from("family-media").createSignedUrl(p.avatar_url, 60 * 60 * 6)).data?.signedUrl ?? null;
          }
          return { ...p, signed };
        }));
        setFamily(withSigned);
      }
    })();
    return () => { if (locTimerRef.current) clearInterval(locTimerRef.current); };
  }, [user.id]);

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      display_name: displayName, avatar_url: avatarUrl,
      bubble_color: bubbleColor,
      status_emoji: statusEmoji || null, status_text: statusText || null,
      updated_at: new Date().toISOString(),
    }).eq("id", user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Saved 🌸");
  }

  async function uploadAvatar(file: File) {
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("family-media").upload(path, file);
    if (error) return toast.error(error.message);
    setAvatarUrl(path);
    const { data } = await supabase.storage.from("family-media").createSignedUrl(path, 60 * 60 * 6);
    setSignedAvatar(data?.signedUrl ?? null);
  }

  async function openGalleryPicker() {
    setPickGallery(true);
    const { data } = await supabase.from("messages").select("media_url")
      .eq("media_type", "image").not("media_url", "is", null)
      .order("created_at", { ascending: false }).limit(60);
    if (data) {
      const items = await Promise.all(
        data.filter((d) => d.media_url).map(async (d) => {
          const { data: s } = await supabase.storage.from("family-media").createSignedUrl(d.media_url!, 60 * 60 * 6);
          return { url: d.media_url!, signed: s?.signedUrl ?? "" };
        })
      );
      setGalleryItems(items);
    }
  }

  async function pickFromGallery(path: string) {
    setAvatarUrl(path);
    const { data } = await supabase.storage.from("family-media").createSignedUrl(path, 60 * 60 * 6);
    setSignedAvatar(data?.signedUrl ?? null);
    setPickGallery(false);
  }

  function toggleDark() {
    const next = !dark;
    setDark(next);
    applyDarkMode(next);
  }

  async function toggleLocation() {
    const next = !locEnabled;
    setLocEnabled(next);
    if (!next) {
      await supabase.from("location_shares").upsert({ user_id: user.id, enabled: false });
      if (locTimerRef.current) clearInterval(locTimerRef.current);
      return;
    }
    if (!("geolocation" in navigator)) return toast.error("Location isn't supported here.");
    const send = () => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          await supabase.from("location_shares").upsert({
            user_id: user.id, enabled: true,
            lat: pos.coords.latitude, lng: pos.coords.longitude,
            place_label: locLabel || null, updated_at: new Date().toISOString(),
          });
        },
        (err) => toast.error(err.message),
        { maximumAge: 60_000 }
      );
    };
    send();
    locTimerRef.current = setInterval(send, 5 * 60_000);
  }

  return (
    <div className="flex-1 px-4 py-6 space-y-5">
      <div>
        <h1 className="font-display text-3xl text-plum">Your profile</h1>
        <p className="text-sm text-muted-foreground">Signed in as {user.email}</p>
      </div>

      {family.length > 0 && (
        <div className="glass-card rounded-3xl p-5 space-y-3">
          <h2 className="font-display text-xl text-plum">Family</h2>
          <div className="space-y-2">
            {family.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-2xl bg-white/60 dark:bg-white/5 p-2.5">
                <div className="relative shrink-0">
                  <div className="w-11 h-11 blob overflow-hidden bg-gradient-to-br from-lavender to-coral grid place-items-center text-plum-deep font-semibold">
                    {p.signed ? <img src={p.signed} className="w-full h-full object-cover" /> : p.display_name[0]?.toUpperCase()}
                  </div>
                  {p.status_emoji && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-white dark:bg-plum-deep grid place-items-center text-xs shadow">{p.status_emoji}</span>
                  )}
                </div>
                <p className="flex-1 font-semibold text-plum truncate">{p.display_name}</p>
                <Link to="/inbox/$otherId" params={{ otherId: p.id }}
                  className="rounded-full bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 shadow-md">
                  <MessageCircle className="w-3.5 h-3.5" /> Message privately
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}


      <div className="glass-card rounded-3xl p-6 space-y-5">
        <div className="flex items-center gap-5">
          <div className="w-24 h-24 blob overflow-hidden bg-gradient-to-br from-lavender to-coral grid place-items-center text-plum-deep font-display text-3xl shrink-0 shadow-lg">
            {signedAvatar ? <img src={signedAvatar} className="w-full h-full object-cover" /> : (displayName[0] ?? "?").toUpperCase()}
          </div>
          <div className="flex-1 space-y-2">
            <label className="flex items-center justify-center gap-2 rounded-full bg-primary text-primary-foreground py-2 px-4 cursor-pointer text-sm font-semibold hover:scale-[1.01] transition">
              <Upload className="w-4 h-4" />
              Upload new
              <input type="file" hidden accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAvatar(f); }} />
            </label>
            <button onClick={openGalleryPicker} className="w-full flex items-center justify-center gap-2 rounded-full bg-secondary text-secondary-foreground py-2 px-4 text-sm font-semibold hover:scale-[1.01] transition">
              <ImagesIcon className="w-4 h-4" />
              Choose from gallery
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-plum/70 uppercase tracking-wide">Display name</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            className="mt-2 w-full rounded-2xl bg-input/80 px-4 py-3 border border-border focus:border-primary outline-none" />
        </div>

        <div>
          <label className="text-xs font-semibold text-plum/70 uppercase tracking-wide">Your bubble color</label>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {BUBBLE_COLORS.map((c) => (
              <button key={c.key} onClick={() => setBubbleColor(c.key)}
                className={`aspect-square rounded-2xl transition ${bubbleColor === c.key ? "ring-2 ring-plum" : ""}`}
                style={{ background: c.swatch }}
                aria-label={c.label} title={c.label}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-plum/70 uppercase tracking-wide">Mood right now</label>
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={() => setStatusEmoji("")}
              className={`px-3 py-1.5 rounded-full text-sm border ${!statusEmoji ? "bg-primary text-primary-foreground border-primary" : "bg-white/60 dark:bg-white/5 border-border text-plum"}`}>
              None
            </button>
            {MOODS.map((m) => (
              <button key={m} onClick={() => setStatusEmoji(m)}
                className={`text-xl px-3 py-1 rounded-full border ${statusEmoji === m ? "bg-primary/20 border-primary" : "bg-white/60 dark:bg-white/5 border-border"}`}>
                {m}
              </button>
            ))}
          </div>
          <input value={statusText} onChange={(e) => setStatusText(e.target.value)}
            placeholder="at work · traveling · free to call"
            className="mt-2 w-full rounded-2xl bg-input/80 px-4 py-2.5 border border-border focus:border-primary outline-none text-sm" />
        </div>

        <button onClick={save} disabled={saving} className="w-full rounded-full bg-primary text-primary-foreground py-3 font-semibold shadow-lg disabled:opacity-60">
          {saving ? "…" : "Save"}
        </button>
      </div>

      <div className="glass-card rounded-3xl p-5 space-y-4">
        <h2 className="font-display text-xl text-plum">Little settings</h2>

        <button onClick={toggleDark} role="switch" aria-checked={dark} aria-label="Cozy Dusk night mode" className="w-full flex items-center gap-3 rounded-2xl bg-white/60 dark:bg-white/5 p-3 hover:scale-[1.01] transition text-left">
          <div className="w-10 h-10 blob bg-gradient-to-br from-lavender to-plum/40 grid place-items-center text-plum-deep">
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </div>
          <div className="flex-1">
            <p className="font-semibold text-plum">Cozy Dusk night</p>
            <p className="text-xs text-muted-foreground">{dark ? "Deeper plum, softer lavender." : "Switch to the nighttime dusk."}</p>
          </div>
          <span className={`w-11 h-6 rounded-full relative transition ${dark ? "bg-primary" : "bg-muted"}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition ${dark ? "translate-x-5" : ""}`} />
          </span>
        </button>

        <div className="rounded-2xl bg-white/60 dark:bg-white/5 p-3 space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 blob bg-gradient-to-br from-coral/60 to-dusk/40 grid place-items-center text-plum-deep">
              {locEnabled ? <MapPin className="w-4 h-4" /> : <MapPinOff className="w-4 h-4" />}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-plum">Share where I am</p>
              <p className="text-xs text-muted-foreground">Only your family sees this. Turn off any time.</p>
            </div>
            <button onClick={toggleLocation}
              className={`w-11 h-6 rounded-full relative transition ${locEnabled ? "bg-primary" : "bg-muted"}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition ${locEnabled ? "translate-x-5" : ""}`} />
            </button>
          </div>
          {locEnabled && (
            <input value={locLabel} onChange={(e) => setLocLabel(e.target.value)}
              onBlur={() => supabase.from("location_shares").update({ place_label: locLabel || null }).eq("user_id", user.id)}
              placeholder="Optional label — e.g. near home"
              className="w-full rounded-xl bg-input px-3 py-2 border border-border focus:border-primary outline-none text-sm" />
          )}
        </div>
      </div>

      {pickGallery && (
        <div onClick={() => setPickGallery(false)} className="fixed inset-0 z-50 bg-plum-deep/70 backdrop-blur-md flex items-center justify-center p-4">
          <div onClick={(e) => e.stopPropagation()} className="glass-card rounded-3xl p-4 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <h2 className="font-display text-xl text-plum mb-3">Pick from family gallery</h2>
            {galleryItems.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No photos in the gallery yet.</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {galleryItems.map((it) => (
                  <button key={it.url} onClick={() => pickFromGallery(it.url)} className="aspect-square rounded-xl overflow-hidden bg-white dark:bg-white/10 p-1 hover:scale-[1.03] transition">
                    {it.signed && <img src={it.signed} className="w-full h-full object-cover rounded-lg" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
