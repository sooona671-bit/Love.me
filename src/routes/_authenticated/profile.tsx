import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Upload,
  Images as ImagesIcon,
  Moon,
  Sun,
  MapPin,
  MapPinOff,
  MessageCircle,
  Camera,
  Check,
  Home,
  Briefcase,
  Dumbbell,
  Coffee,
  Navigation,
} from "lucide-react";
import { BUBBLE_COLORS, type BubbleColor } from "@/lib/bubble-colors";
import { applyDarkMode, readDarkModePref } from "@/lib/dark-mode";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

const LOCATION_PRESETS = [
  { label: "Home", Icon: Home },
  { label: "Work", Icon: Briefcase },
  { label: "Gym", Icon: Dumbbell },
  { label: "Outing", Icon: Coffee },
  { label: "In Transit", Icon: Navigation },
];

function ProfilePage() {
  const { user } = Route.useRouteContext();
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [signedAvatar, setSignedAvatar] = useState<string | null>(null);
  const [bubbleColor, setBubbleColor] = useState<BubbleColor>("coral");
  const [statusText, setStatusText] = useState<string>("");
  const [dark, setDark] = useState(false);
  const [locEnabled, setLocEnabled] = useState(false);
  const [locLabel, setLocLabel] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [pickGallery, setPickGallery] = useState(false);
  const [galleryItems, setGalleryItems] = useState<{ url: string; signed: string }[]>([]);
  const [family, setFamily] = useState<{ id: string; display_name: string; avatar_url: string | null; signed: string | null }[]>([]);
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
        .select("id, display_name, avatar_url").neq("id", user.id);
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
      display_name: displayName, 
      avatar_url: avatarUrl,
      bubble_color: bubbleColor,
      status_text: statusText || null,
      updated_at: new Date().toISOString(),
    }).eq("id", user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Profile updated successfully 🌸");
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

  async function updateLocationPreset(label: string) {
    setLocLabel(label);
    await supabase.from("location_shares").update({ place_label: label }).eq("user_id", user.id);
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
    <div className="flex-1 px-4 py-6 space-y-6 max-w-2xl mx-auto pb-24">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl text-plum font-serif font-bold tracking-tight">Your profile</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Signed in as <span className="font-medium text-slate-700 dark:text-slate-300">{user.email}</span></p>
      </div>

      {/* Family Section */}
      {family.length > 0 && (
        <div className="glass-card rounded-3xl p-5 space-y-3 border border-white/60 dark:border-white/10 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-plum">Family</h2>
          <div className="space-y-2">
            {family.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-2xl bg-white/70 dark:bg-white/5 p-3 shadow-xs">
                <div className="w-11 h-11 rounded-full overflow-hidden bg-gradient-to-br from-lavender to-coral grid place-items-center text-plum-deep font-semibold shrink-0 border border-white/80">
                  {p.signed ? <img src={p.signed} className="w-full h-full object-cover" /> : p.display_name[0]?.toUpperCase()}
                </div>
                <p className="flex-1 font-semibold text-plum truncate">{p.display_name}</p>
                <Link to="/inbox/$otherId" params={{ otherId: p.id }}
                  className="rounded-xl bg-primary text-primary-foreground px-3.5 py-2 text-xs font-medium flex items-center gap-1.5 shadow-sm hover:opacity-95 transition">
                  <MessageCircle className="w-3.5 h-3.5" /> Message privately
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Profile Edit Card */}
      <div className="glass-card rounded-3xl p-6 space-y-6 border border-white/80 dark:border-white/10 shadow-md">
        
        {/* Avatar Section */}
        <div className="flex flex-col sm:flex-row items-center gap-5 pb-2">
          <div className="relative group shrink-0">
            <div className="w-24 h-24 rounded-full overflow-hidden bg-gradient-to-br from-lavender to-coral grid place-items-center text-plum-deep font-display text-3xl shadow-md border-2 border-white dark:border-slate-800">
              {signedAvatar ? <img src={signedAvatar} className="w-full h-full object-cover" /> : (displayName[0] ?? "?").toUpperCase()}
            </div>
            <label className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary text-primary-foreground grid place-items-center shadow-md cursor-pointer hover:scale-105 transition">
              <Camera className="w-4 h-4" />
              <input type="file" hidden accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAvatar(f); }} />
            </label>
          </div>

          <div className="flex-1 w-full space-y-2">
            <label className="flex items-center justify-center gap-2 rounded-2xl bg-primary text-primary-foreground py-2.5 px-4 cursor-pointer text-xs font-medium hover:opacity-95 transition shadow-xs">
              <Upload className="w-4 h-4" />
              Upload new photo
              <input type="file" hidden accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAvatar(f); }} />
            </label>
            <button onClick={openGalleryPicker} className="w-full flex items-center justify-center gap-2 rounded-2xl bg-secondary text-secondary-foreground py-2.5 px-4 text-xs font-medium hover:bg-secondary/80 transition">
              <ImagesIcon className="w-4 h-4" />
              Choose from gallery
            </button>
          </div>
        </div>

        {/* Display Name Input */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-plum/70 uppercase tracking-wider">Display name</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-2xl bg-input/80 px-4 py-3 border border-border focus:border-primary outline-none text-sm transition" 
            placeholder="Your Name" />
        </div>

        {/* Bubble Color Selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-plum/70 uppercase tracking-wider">Your bubble color</label>
          <div className="grid grid-cols-4 gap-3">
            {BUBBLE_COLORS.map((c) => (
              <button key={c.key} onClick={() => setBubbleColor(c.key)}
                className={`h-12 rounded-2xl transition shadow-xs flex items-center justify-center relative ${
                  bubbleColor === c.key ? "ring-2 ring-plum ring-offset-2 scale-105" : "hover:opacity-90"
                }`}
                style={{ background: c.swatch }}
                aria-label={c.label} title={c.label}
              >
                {bubbleColor === c.key && <Check className="w-4 h-4 text-slate-800 drop-shadow-xs" />}
              </button>
            ))}
          </div>
        </div>

        {/* Status Text Input */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-plum/70 uppercase tracking-wider">Status message</label>
          <input value={statusText} onChange={(e) => setStatusText(e.target.value)}
            placeholder="at work · traveling · free to call"
            className="w-full rounded-2xl bg-input/80 px-4 py-3 border border-border focus:border-primary outline-none text-sm transition" />
        </div>

        {/* Save Button */}
        <button onClick={save} disabled={saving} className="w-full rounded-2xl bg-primary text-primary-foreground py-3.5 font-medium shadow-md transition hover:opacity-95 disabled:opacity-60">
          {saving ? "Saving changes…" : "Save Preferences"}
        </button>
      </div>

      {/* Preferences Card */}
      <div className="glass-card rounded-3xl p-6 space-y-4 border border-white/80 dark:border-white/10 shadow-md">
        <h2 className="font-display text-lg font-semibold text-plum">Little settings</h2>

        {/* Dark Mode Switch */}
        <button onClick={toggleDark} role="switch" aria-checked={dark} aria-label="Cozy Dusk night mode" className="w-full flex items-center gap-3 rounded-2xl bg-white/60 dark:bg-white/5 p-3 hover:bg-white/80 transition text-left">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-lavender to-plum/40 grid place-items-center text-plum-deep shrink-0">
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </div>
          <div className="flex-1">
            <p className="font-semibold text-plum text-sm">Cozy Dusk night</p>
            <p className="text-xs text-muted-foreground">{dark ? "Deeper plum, softer lavender." : "Switch to the nighttime dusk."}</p>
          </div>
          <span className={`w-11 h-6 rounded-full relative transition ${dark ? "bg-primary" : "bg-muted"}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition ${dark ? "translate-x-5" : ""}`} />
          </span>
        </button>

        {/* Location Switch */}
        <div className="rounded-2xl bg-white/60 dark:bg-white/5 p-3 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-coral/60 to-dusk/40 grid place-items-center text-plum-deep shrink-0">
              {locEnabled ? <MapPin className="w-4 h-4" /> : <MapPinOff className="w-4 h-4" />}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-plum text-sm">Share where I am</p>
              <p className="text-xs text-muted-foreground">Only your family sees this. Turn off any time.</p>
            </div>
            <button onClick={toggleLocation}
              className={`w-11 h-6 rounded-full relative transition ${locEnabled ? "bg-primary" : "bg-muted"}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition ${locEnabled ? "translate-x-5" : ""}`} />
            </button>
          </div>

          {locEnabled && (
            <div className="space-y-2 pt-1 border-t border-border/40">
              <p className="text-xs font-semibold text-plum/70">Quick Location Presets</p>
              <div className="flex flex-wrap gap-2">
                {LOCATION_PRESETS.map(({ label, Icon }) => (
                  <button
                    key={label}
                    onClick={() => void updateLocationPreset(label)}
                    className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border transition font-medium ${
                      locLabel === label
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-700 dark:text-slate-200 border-slate-200/50 dark:border-white/5"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 opacity-80" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              <input value={locLabel} onChange={(e) => setLocLabel(e.target.value)}
                onBlur={() => supabase.from("location_shares").update({ place_label: locLabel || null }).eq("user_id", user.id)}
                placeholder="Optional label — e.g. near home"
                className="w-full rounded-xl bg-input px-3 py-2 border border-border focus:border-primary outline-none text-sm mt-2" />
            </div>
          )}
        </div>
      </div>

      {/* Gallery Modal */}
      {pickGallery && (
        <div onClick={() => setPickGallery(false)} className="fixed inset-0 z-50 bg-plum-deep/70 backdrop-blur-md flex items-center justify-center p-4">
          <div onClick={(e) => e.stopPropagation()} className="glass-card rounded-3xl p-5 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
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