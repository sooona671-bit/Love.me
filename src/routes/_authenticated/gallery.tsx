import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInCalendarYears } from "date-fns";
import { Star, Play, Plus, FolderPlus, ChevronLeft, ShieldCheck, X, Upload, Trash2 } from "lucide-react";
import { Slideshow } from "@/components/Slideshow";
import { MediaTray, MediaPickerButtons } from "@/components/MediaTray";
import { uploadToFamilyMedia, makeSelected, type SelectedMedia } from "@/lib/media";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/gallery")({
  component: GalleryPage,
});

type MediaItem = {
  id: string;
  sender_id: string;
  media_url: string;
  media_type: "image" | "video";
  created_at: string;
};
type Album = { id: string; name: string; cover_message_id: string | null; created_by: string; created_at: string };
type AlbumItem = { album_id: string; message_id: string };

function GalleryPage() {
  const { user } = Route.useRouteContext();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [albums, setAlbums] = useState<Album[]>([]);
  const [albumItems, setAlbumItems] = useState<AlbumItem[]>([]);
  const [tab, setTab] = useState<"all" | "albums" | "starred">("all");
  const [preview, setPreview] = useState<MediaItem | null>(null);
  const [slideshow, setSlideshow] = useState<{ title?: string; items: MediaItem[] } | null>(null);
  const [openAlbum, setOpenAlbum] = useState<Album | null>(null);
  const [addToAlbumFor, setAddToAlbumFor] = useState<MediaItem | null>(null);
  const [showNewAlbum, setShowNewAlbum] = useState(false);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<SelectedMedia[]>([]);
  const [uploading, setUploading] = useState(false);

  async function sendUploads(items: SelectedMedia[]) {
    setUploading(true);
    try {
      for (const it of items) {
        const path = await uploadToFamilyMedia(user.id, it.file);
        const { data: msg, error } = await supabase.from("messages").insert({
          sender_id: user.id, media_url: path, media_type: it.kind,
        }).select().single();
        if (error) throw error;
        if (msg) {
          const { data: signed } = await supabase.storage.from("family-media").createSignedUrl(path, 60 * 60 * 6);
          const newItem: MediaItem = {
            id: msg.id, sender_id: user.id, media_url: path,
            media_type: it.kind, created_at: msg.created_at,
          };
          setItems((prev) => [newItem, ...prev]);
          if (signed?.signedUrl) setUrls((prev) => ({ ...prev, [path]: signed.signedUrl }));
        }
      }
      setPendingUpload([]);
      toast.success("Added to the gallery 🌸");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function queueFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const additions = Array.from(files).map(makeSelected);
    setPendingUpload((prev) => [...prev, ...additions].slice(0, 10));
    setShowUploadMenu(false);
  }


  useEffect(() => {
    void (async () => {
      const [{ data: msgs }, { data: favs }, { data: als }, { data: ais }] = await Promise.all([
        supabase.from("messages").select("id, sender_id, media_url, media_type, created_at")
          .not("media_url", "is", null).in("media_type", ["image", "video"])
          .order("created_at", { ascending: false }).limit(500),
        supabase.from("favorites").select("message_id").eq("user_id", user.id),
        supabase.from("albums").select("*").order("created_at", { ascending: false }),
        supabase.from("album_items").select("album_id, message_id"),
      ]);
      if (msgs) {
        const filtered = (msgs as MediaItem[]).filter((m) => m.media_url);
        setItems(filtered);
        const entries = await Promise.all(
          filtered.map(async (m) => {
            const { data } = await supabase.storage.from("family-media").createSignedUrl(m.media_url, 60 * 60 * 6);
            return [m.media_url, data?.signedUrl ?? ""] as const;
          })
        );
        setUrls(Object.fromEntries(entries));
      }
      if (favs) setFavorites(new Set(favs.map((f) => f.message_id)));
      if (als) setAlbums(als as Album[]);
      if (ais) setAlbumItems(ais as AlbumItem[]);
    })();

    // Live sync — anything a family member uploads appears here instantly
    const ch = supabase.channel("gallery-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async (p) => {
        const m = p.new as MediaItem;
        if (!m.media_url || (m.media_type !== "image" && m.media_type !== "video")) return;
        setItems((prev) => (prev.some((x) => x.id === m.id) ? prev : [m, ...prev]));
        const { data: signed } = await supabase.storage.from("family-media").createSignedUrl(m.media_url, 60 * 60 * 6);
        if (signed?.signedUrl) setUrls((prev) => ({ ...prev, [m.media_url]: signed.signedUrl }));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (p) => {
        const m = p.old as { id: string };
        setItems((prev) => prev.filter((x) => x.id !== m.id));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "albums" }, (p) => {
        setAlbums((prev) => [p.new as Album, ...prev.filter((a) => a.id !== (p.new as Album).id)]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "albums" }, (p) => {
        setAlbums((prev) => prev.map((a) => (a.id === (p.new as Album).id ? (p.new as Album) : a)));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "albums" }, (p) => {
        setAlbums((prev) => prev.filter((a) => a.id !== (p.old as { id: string }).id));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "album_items" }, (p) => {
        setAlbumItems((prev) => [...prev, p.new as AlbumItem]);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "album_items" }, (p) => {
        const old = p.old as AlbumItem;
        setAlbumItems((prev) => prev.filter((x) => !(x.album_id === old.album_id && x.message_id === old.message_id)));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user.id]);

  async function toggleFav(id: string) {
    if (favorites.has(id)) {
      await supabase.from("favorites").delete().eq("user_id", user.id).eq("message_id", id);
      setFavorites((s) => { const n = new Set(s); n.delete(id); return n; });
    } else {
      await supabase.from("favorites").insert({ user_id: user.id, message_id: id });
      setFavorites((s) => new Set(s).add(id));
    }
  }

  const now = new Date();
  const onThisDay = useMemo(() => items.filter((m) => {
    const d = new Date(m.created_at);
    return d.getMonth() === now.getMonth() && d.getDate() === now.getDate() && d.getFullYear() < now.getFullYear();
  }), [items]);

  const visibleAll = useMemo(
    () => tab === "starred" ? items.filter((i) => favorites.has(i.id)) : items,
    [tab, items, favorites]
  );

  function slidesFor(list: MediaItem[]) {
    return list.filter((m) => urls[m.media_url]).map((m) => ({ url: urls[m.media_url], type: m.media_type }));
  }

  async function createAlbum(name: string): Promise<Album | undefined> {
    const { data, error } = await supabase.from("albums")
      .insert({ name, created_by: user.id }).select().single();
    if (error || !data) { toast.error("Couldn't create album"); return undefined; }
    setAlbums((a) => [data as Album, ...a]);
    return data as Album;
  }

  async function addToAlbum(albumId: string, messageId: string) {
    const { error } = await supabase.from("album_items")
      .insert({ album_id: albumId, message_id: messageId, added_by: user.id });
    if (error && !error.message.includes("duplicate")) return toast.error(error.message);
    setAlbumItems((a) => a.some((x) => x.album_id === albumId && x.message_id === messageId) ? a : [...a, { album_id: albumId, message_id: messageId }]);
    // Set cover if album empty
    const album = albums.find((a) => a.id === albumId);
    if (album && !album.cover_message_id) {
      await supabase.from("albums").update({ cover_message_id: messageId }).eq("id", albumId);
      setAlbums((s) => s.map((a) => (a.id === albumId ? { ...a, cover_message_id: messageId } : a)));
    }
    toast.success("Added to album 🌸");
    setAddToAlbumFor(null);
  }

  if (openAlbum) {
    const albumMedia = items.filter((m) => albumItems.some((ai) => ai.album_id === openAlbum.id && ai.message_id === m.id));
    return (
      <div className="flex-1 px-4 py-4">
        <button onClick={() => setOpenAlbum(null)} className="flex items-center gap-1 text-plum/70 text-sm mb-3">
          <ChevronLeft className="w-4 h-4" /> All albums
        </button>
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-display text-3xl text-plum">{openAlbum.name}</h1>
          {albumMedia.length > 0 && (
            <button onClick={() => setSlideshow({ title: openAlbum.name, items: albumMedia })}
              className="rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold flex items-center gap-2">
              <Play className="w-4 h-4" /> Slideshow
            </button>
          )}
        </div>
        {albumMedia.length === 0 ? (
          <EmptyBlurb title="This album is waiting" line="Add photos from the gallery to start the story." />
        ) : (
          <PhotoGrid items={albumMedia} urls={urls} onPreview={setPreview} onFav={toggleFav} favs={favorites} onAdd={setAddToAlbumFor} />
        )}
        {preview && <PreviewOverlay item={preview} url={urls[preview.media_url]} onClose={() => setPreview(null)} />}
        {slideshow && <Slideshow slides={slidesFor(slideshow.items)} title={slideshow.title} onClose={() => setSlideshow(null)} />}
        {addToAlbumFor && <AddToAlbumSheet item={addToAlbumFor} albums={albums} onPick={(a) => addToAlbum(a, addToAlbumFor.id)} onNew={() => setShowNewAlbum(true)} onClose={() => setAddToAlbumFor(null)} />}
        {showNewAlbum && <NewAlbumSheet onCreate={async (n) => { const a = await createAlbum(n); if (a && addToAlbumFor) await addToAlbum(a.id, addToAlbumFor.id); setShowNewAlbum(false); }} onClose={() => setShowNewAlbum(false)} />}
      </div>
    );
  }

  return (
    <div className="flex-1 px-4 py-4">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h1 className="font-display text-3xl text-plum">Gallery</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowUploadMenu((s) => !s)}
            className="rounded-full bg-primary text-primary-foreground px-3 py-1.5 text-sm font-semibold flex items-center gap-1.5 shadow-md">
            <Upload className="w-3.5 h-3.5" /> Add
          </button>
          {items.length > 0 && (
            <button onClick={() => setSlideshow({ items })} className="rounded-full bg-secondary text-secondary-foreground px-3 py-1.5 text-sm font-semibold flex items-center gap-1.5">
              <Play className="w-3.5 h-3.5" /> Play all
            </button>
          )}
        </div>
      </div>

      {showUploadMenu && (
        <div className="glass-card rounded-3xl p-3 flex gap-2 mb-3 animate-fade-scale">
          <MediaPickerButtons onCamera={queueFiles} onGallery={queueFiles} disabled={uploading} />
        </div>
      )}

      <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-3">
        <ShieldCheck className="w-3.5 h-3.5 text-lavender-deep" />
        Safely backed up to your family cloud — nothing is lost, even if a device is.
      </p>

      <div className="glass-card rounded-full p-1 flex text-sm mb-4 w-fit">
        {(["all", "albums", "starred"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-full transition capitalize ${tab === t ? "bg-primary text-primary-foreground" : "text-plum"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab !== "albums" && onThisDay.length > 0 && (
        <section className="mb-6">
          <h2 className="font-display text-lg text-plum mb-1">On this day</h2>
          <p className="text-sm text-muted-foreground italic mb-3">
            {(() => {
              const years = differenceInCalendarYears(now, new Date(onThisDay[0].created_at));
              return years === 1 ? "A year ago today…" : `${years} years back, this happened…`;
            })()}
          </p>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {onThisDay.map((m) => (
              <button key={m.id} onClick={() => setPreview(m)} className="shrink-0 w-32 aspect-[3/4] rounded-2xl bg-white dark:bg-white/10 p-1.5 shadow-md rotate-[-2deg] hover:rotate-0 transition-transform animate-fade-scale">
                {urls[m.media_url] && (m.media_type === "video"
                  ? <video src={urls[m.media_url]} className="w-full h-full object-cover rounded-xl" />
                  : <img src={urls[m.media_url]} className="w-full h-full object-cover rounded-xl" />)}
              </button>
            ))}
          </div>
        </section>
      )}

      {tab === "albums" ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <button onClick={() => setShowNewAlbum(true)}
              className="aspect-square rounded-3xl border-2 border-dashed border-plum/30 grid place-items-center text-plum hover:bg-white/40 dark:hover:bg-white/5 transition">
              <div className="text-center">
                <FolderPlus className="w-8 h-8 mx-auto text-dusk" />
                <p className="text-sm font-semibold mt-2">New album</p>
              </div>
            </button>
            {albums.map((a) => {
              const contents = items.filter((m) => albumItems.some((ai) => ai.album_id === a.id && ai.message_id === m.id));
              const covers = contents.slice(0, 3);
              return (
                <button key={a.id} onClick={() => setOpenAlbum(a)} className="text-left group">
                  <div className="relative aspect-square">
                    {covers.length === 0 && (
                      <div className="absolute inset-2 rounded-3xl bg-gradient-to-br from-lavender to-coral/40 grid place-items-center text-plum-deep font-display text-lg">
                        {a.name[0]}
                      </div>
                    )}
                    {covers.map((c, i) => (
                      <div key={c.id}
                        className="absolute inset-0 rounded-3xl bg-white dark:bg-white/10 p-1.5 shadow-lg transition-transform group-hover:rotate-0"
                        style={{
                          transform: `rotate(${(i - 1) * 4}deg) translate(${(i - 1) * 4}px, ${(i - 1) * 3}px)`,
                          zIndex: 10 + i,
                        }}
                      >
                        {urls[c.media_url] && (c.media_type === "video"
                          ? <video src={urls[c.media_url]} className="w-full h-full object-cover rounded-2xl" />
                          : <img src={urls[c.media_url]} className="w-full h-full object-cover rounded-2xl" />)}
                      </div>
                    ))}
                  </div>
                  <p className="font-display text-lg text-plum mt-2 truncate">{a.name}</p>
                  <p className="text-xs text-muted-foreground">{contents.length} {contents.length === 1 ? "photo" : "photos"}</p>
                </button>
              );
            })}
          </div>
          {albums.length === 0 && (
            <p className="text-center text-sm text-muted-foreground mt-6">Bundle memories into little events — "Diwali 2026", "Goa Trip", "Nani's kitchen".</p>
          )}
        </>
      ) : visibleAll.length === 0 ? (
        <EmptyBlurb
          title={tab === "starred" ? "Nothing starred yet" : "The album is still empty"}
          line={tab === "starred" ? "Tap the star on a photo to keep it here." : "Share your first photo in chat and it'll land here."} />
      ) : (
        <PhotoGrid items={visibleAll} urls={urls} onPreview={setPreview} onFav={toggleFav} favs={favorites} onAdd={setAddToAlbumFor} />
      )}

      {preview && <PreviewOverlay item={preview} url={urls[preview.media_url]} onClose={() => setPreview(null)} />}
      {slideshow && <Slideshow slides={slidesFor(slideshow.items)} title={slideshow.title} onClose={() => setSlideshow(null)} />}
      {addToAlbumFor && <AddToAlbumSheet item={addToAlbumFor} albums={albums} onPick={(a) => addToAlbum(a, addToAlbumFor.id)} onNew={() => setShowNewAlbum(true)} onClose={() => setAddToAlbumFor(null)} />}
      {showNewAlbum && <NewAlbumSheet onCreate={async (n) => { const a = await createAlbum(n); if (a && addToAlbumFor) await addToAlbum(a.id, addToAlbumFor.id); setShowNewAlbum(false); }} onClose={() => setShowNewAlbum(false)} />}
      {pendingUpload.length > 0 && (
        <MediaTray
          items={pendingUpload}
          setItems={setPendingUpload}
          onCancel={() => setPendingUpload((p) => { p.forEach((x) => URL.revokeObjectURL(x.previewUrl)); return []; })}
          onSend={sendUploads}
          sending={uploading}
          title="Add to the gallery"
          sendLabel="Add"
        />
      )}
    </div>
  );
}

function PhotoGrid({ items, urls, onPreview, onFav, favs, onAdd }: {
  items: MediaItem[]; urls: Record<string, string>;
  onPreview: (m: MediaItem) => void; onFav: (id: string) => void; favs: Set<string>;
  onAdd: (m: MediaItem) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {items.map((m, idx) => (
        <div key={m.id} className={`relative group aspect-square rounded-2xl overflow-hidden bg-white dark:bg-white/10 p-1.5 shadow-md ${idx % 3 === 1 ? "rotate-1" : "-rotate-1"} hover:rotate-0 transition-transform animate-fade-scale`}>
          <button onClick={() => onPreview(m)} className="w-full h-full">
            {urls[m.media_url] ? (
              m.media_type === "video"
                ? <video src={urls[m.media_url]} className="w-full h-full object-cover rounded-xl" />
                : <img src={urls[m.media_url]} className="w-full h-full object-cover rounded-xl" />
            ) : <div className="w-full h-full bg-muted animate-pulse rounded-xl" />}
          </button>
          <button onClick={() => onFav(m.id)}
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 dark:bg-plum-deep/70 backdrop-blur grid place-items-center shadow">
            <Star className={`w-4 h-4 ${favs.has(m.id) ? "fill-coral text-coral" : "text-plum/50"}`} />
          </button>
          <button onClick={() => onAdd(m)}
            className="absolute top-2 left-2 w-8 h-8 rounded-full bg-white/90 dark:bg-plum-deep/70 backdrop-blur grid place-items-center shadow opacity-0 group-hover:opacity-100 transition">
            <FolderPlus className="w-4 h-4 text-plum" />
          </button>
          <span className="absolute bottom-2 left-2 text-[10px] font-semibold bg-white/80 dark:bg-plum-deep/70 dark:text-white px-2 py-0.5 rounded-full text-plum">
            {format(new Date(m.created_at), "MMM d")}
          </span>
        </div>
      ))}
    </div>
  );
}

function EmptyBlurb({ title, line }: { title: string; line: string }) {
  return (
    <div className="text-center py-20 animate-fade-scale">
      <div className="mx-auto w-32 h-32 blob bg-gradient-to-br from-lavender to-coral/50 blur-sm mb-4" />
      <p className="font-display text-xl text-plum">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{line}</p>
    </div>
  );
}

function PreviewOverlay({ item, url, onClose }: { item: MediaItem; url?: string; onClose: () => void }) {
  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-plum-deep/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-scale">
      {url && (item.media_type === "video"
        ? <video src={url} controls autoPlay className="max-h-full max-w-full rounded-2xl" />
        : <img src={url} className="max-h-full max-w-full rounded-2xl shadow-2xl" />)}
    </div>
  );
}

function AddToAlbumSheet({ item, albums, onPick, onNew, onClose }: {
  item: MediaItem; albums: Album[];
  onPick: (albumId: string) => void; onNew: () => void; onClose: () => void;
}) {
  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-plum-deep/70 backdrop-blur-md flex items-end sm:items-center justify-center p-4 animate-fade-scale">
      <div onClick={(e) => e.stopPropagation()} className="glass-card rounded-3xl p-5 max-w-md w-full">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl text-plum">Add to an album</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-plum/60" /></button>
        </div>
        <button onClick={onNew} className="w-full mb-2 flex items-center gap-2 rounded-2xl bg-primary text-primary-foreground py-2.5 px-4 font-semibold">
          <Plus className="w-4 h-4" /> New album
        </button>
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {albums.map((a) => (
            <button key={a.id} onClick={() => onPick(a.id)}
              className="w-full text-left px-4 py-2.5 rounded-2xl hover:bg-white/60 dark:hover:bg-white/10 text-plum">
              {a.name}
            </button>
          ))}
          {albums.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No albums yet — create your first one above.</p>}
        </div>
      </div>
    </div>
  );
}

function NewAlbumSheet({ onCreate, onClose }: { onCreate: (name: string) => void | Promise<void>; onClose: () => void }) {
  const [name, setName] = useState("");
  return (
    <div onClick={onClose} className="fixed inset-0 z-[60] bg-plum-deep/70 backdrop-blur-md flex items-center justify-center p-4 animate-fade-scale">
      <div onClick={(e) => e.stopPropagation()} className="glass-card rounded-3xl p-5 max-w-sm w-full">
        <h2 className="font-display text-xl text-plum mb-3">Name this album</h2>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Goa Trip"
          className="w-full rounded-2xl bg-input px-4 py-3 border border-border focus:border-primary outline-none" />
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 rounded-full bg-secondary text-secondary-foreground py-2.5 font-semibold">Cancel</button>
          <button disabled={!name.trim()} onClick={() => name.trim() && onCreate(name.trim())}
            className="flex-1 rounded-full bg-primary text-primary-foreground py-2.5 font-semibold disabled:opacity-60">
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
