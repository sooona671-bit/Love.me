import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, isToday, isYesterday, formatDistanceToNow } from "date-fns";
import { ChevronLeft, Send, Smile, Check, CheckCheck, X, Plus, MapPin, Trash2, Image as ImageIcon, Mic } from "lucide-react";
import { bubbleClass, type BubbleColor } from "@/lib/bubble-colors";
import { WaveformPlayer } from "@/components/WaveformPlayer";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { MediaTray, MediaPickerButtons } from "@/components/MediaTray";
import { getSignedUrl, uploadToFamilyMedia, makeSelected, type SelectedMedia } from "@/lib/media";

export const Route = createFileRoute("/_authenticated/inbox/$otherId")({
  component: DMThreadPage,
});

type Profile = {
  id: string; display_name: string; avatar_url: string | null;
  bubble_color: BubbleColor; status_emoji: string | null; status_text: string | null;
};
type DM = {
  id: string; sender_id: string; recipient_id: string;
  content: string | null; media_url: string | null; media_type: "image" | "video" | "audio" | null;
  created_at: string;
};
type DMReaction = { id: string; message_id: string; user_id: string; emoji: string };
type DMRead = { message_id: string; user_id: string; read_at: string };
type LocShare = { id: string; owner_id: string; recipient_id: string; lat: number | null; lng: number | null; place_label: string | null; expires_at: string; updated_at: string };

const REACTIONS = ["❤️", "😂", "😮", "😢", "👍", "🌸"];

function formatDay(d: Date) {
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE, MMM d");
}

function DMThreadPage() {
  const { user } = Route.useRouteContext();
  const { otherId } = Route.useParams();
  const [me, setMe] = useState<Profile | null>(null);
  const [other, setOther] = useState<Profile | null>(null);
  const [otherAvatarUrl, setOtherAvatarUrl] = useState<string | null>(null);
  const [messages, setMessages] = useState<DM[]>([]);
  const [reactions, setReactions] = useState<DMReaction[]>([]);
  const [reads, setReads] = useState<DMRead[]>([]);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [pending, setPending] = useState<SelectedMedia[]>([]);
  const [sending, setSending] = useState(false);
  const [reactPickerFor, setReactPickerFor] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; type: string } | null>(null);
  const [myShare, setMyShare] = useState<LocShare | null>(null);
  const [theirShare, setTheirShare] = useState<LocShare | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      const [{ data: profs }, { data: msgs }, { data: rxns }, { data: rds }, { data: shares }] = await Promise.all([
        supabase.from("profiles").select("*").in("id", [user.id, otherId]),
        supabase.from("direct_messages").select("*")
          .or(`and(sender_id.eq.${user.id},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${user.id})`)
          .order("created_at", { ascending: true }).limit(500),
        supabase.from("direct_message_reactions").select("*"),
        supabase.from("direct_message_reads").select("*"),
        supabase.from("direct_location_shares").select("*")
          .or(`and(owner_id.eq.${user.id},recipient_id.eq.${otherId}),and(owner_id.eq.${otherId},recipient_id.eq.${user.id})`),
      ]);

      if (profs) {
        for (const p of profs as Profile[]) {
          if (p.id === user.id) setMe(p);
          else {
            setOther(p);
            if (p.avatar_url) {
              const url = p.avatar_url.startsWith("http") ? p.avatar_url : await getSignedUrl(p.avatar_url);
              setOtherAvatarUrl(url ?? null);
            }
          }
        }
      }
      if (msgs) setMessages(msgs as DM[]);
      if (rxns) setReactions(rxns as DMReaction[]);
      if (rds) setReads(rds as DMRead[]);
      if (shares) {
        const now = Date.now();
        for (const s of shares as LocShare[]) {
          if (new Date(s.expires_at).getTime() < now) continue;
          if (s.owner_id === user.id) setMyShare(s);
          else setTheirShare(s);
        }
      }
    })();
  }, [user.id, otherId]);

  useEffect(() => {
    (async () => {
      const toSign = messages.filter((m) => m.media_url && !mediaUrls[m.media_url]);
      if (!toSign.length) return;
      const entries = await Promise.all(
        toSign.map(async (m) => [m.media_url!, (await getSignedUrl(m.media_url!)) ?? ""] as const),
      );
      setMediaUrls((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    })();
  }, [messages]);

  useEffect(() => {
    const ch = supabase
      .channel(`dm-${[user.id, otherId].sort().join("-")}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, (p) => {
        const m = p.new as DM;
        const pair = (m.sender_id === user.id && m.recipient_id === otherId) || (m.sender_id === otherId && m.recipient_id === user.id);
        if (!pair) return;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "direct_messages" }, (p) => {
        setMessages((prev) => prev.filter((x) => x.id !== (p.old as DM).id));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_message_reactions" }, (p) => {
        setReactions((r) => [...r, p.new as DMReaction]);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "direct_message_reactions" }, (p) => {
        setReactions((r) => r.filter((x) => x.id !== (p.old as DMReaction).id));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_message_reads" }, (p) => {
        setReads((r) => [...r, p.new as DMRead]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "direct_location_shares" }, (p) => {
        const s = (p.new ?? p.old) as LocShare;
        const pair = (s.owner_id === user.id && s.recipient_id === otherId) || (s.owner_id === otherId && s.recipient_id === user.id);
        if (!pair) return;
        if (p.eventType === "DELETE") {
          if (s.owner_id === user.id) setMyShare(null); else setTheirShare(null);
          return;
        }
        const alive = new Date(s.expires_at).getTime() > Date.now();
        if (s.owner_id === user.id) setMyShare(alive ? s : null);
        else setTheirShare(alive ? s : null);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user.id, otherId]);

  // Auto-scroll & mark read
  const markingRead = useRef(false);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    const unread = messages.filter(
      (m) => m.recipient_id === user.id && !reads.some((r) => r.message_id === m.id && r.user_id === user.id),
    );
    if (!unread.length || markingRead.current) return;
    markingRead.current = true;
    // The Supabase query builder is lazy — it must be awaited to actually run.
    void (async () => {
      const rows = unread.map((m) => ({ message_id: m.id, user_id: user.id }));
      const { error } = await supabase.from("direct_message_reads").upsert(rows, { onConflict: "message_id,user_id", ignoreDuplicates: true });
      if (!error) setReads((prev) => [...prev, ...rows.map((r) => ({ ...r, read_at: new Date().toISOString() }))]);
      markingRead.current = false;
    })();
  }, [messages, reads, user.id]);


  // Expire location shares client-side
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      if (myShare && new Date(myShare.expires_at).getTime() < now) setMyShare(null);
      if (theirShare && new Date(theirShare.expires_at).getTime() < now) setTheirShare(null);
    }, 30_000);
    return () => clearInterval(t);
  }, [myShare, theirShare]);

  async function sendText(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text.trim()) return;
    const content = text.trim();
    setText("");
    const { error } = await supabase.from("direct_messages")
      .insert({ sender_id: user.id, recipient_id: otherId, content });
    if (error) { toast.error(error.message); setText(content); }
  }

  async function sendMedia(items: SelectedMedia[]) {
    setSending(true);
    try {
      for (const it of items) {
        const path = await uploadToFamilyMedia(user.id, it.file);
        const { error } = await supabase.from("direct_messages").insert({
          sender_id: user.id, recipient_id: otherId,
          media_url: path, media_type: it.kind,
        });
        if (error) throw error;
      }
      setPending([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send");
    } finally {
      setSending(false);
    }
  }

  async function sendVoice(blob: Blob) {
    try {
      const path = await uploadToFamilyMedia(user.id, blob, "webm");
      await supabase.from("direct_messages").insert({
        sender_id: user.id, recipient_id: otherId,
        media_url: path, media_type: "audio",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Voice note failed");
    }
  }

  async function toggleReaction(id: string, emoji: string) {
    const existing = reactions.find((r) => r.message_id === id && r.user_id === user.id && r.emoji === emoji);
    if (existing) {
      await supabase.from("direct_message_reactions").delete().eq("id", existing.id);
      setReactions((r) => r.filter((x) => x.id !== existing.id));
    } else {
      const { data } = await supabase.from("direct_message_reactions")
        .insert({ message_id: id, user_id: user.id, emoji }).select().single();
      if (data) setReactions((r) => [...r, data as DMReaction]);
    }
    setReactPickerFor(null);
  }

  async function deleteMessage(id: string) {
    if (!confirm("Delete this message?")) return;
    await supabase.from("direct_messages").delete().eq("id", id);
    setReactPickerFor(null);
  }

  async function shareLocation() {
    if (!("geolocation" in navigator)) return toast.error("Location isn't supported here.");
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase.from("direct_location_shares").upsert({
        owner_id: user.id, recipient_id: otherId,
        lat: pos.coords.latitude, lng: pos.coords.longitude,
        expires_at: expires,
        updated_at: new Date().toISOString(),
      }, { onConflict: "owner_id,recipient_id" }).select().single();
      if (error) toast.error(error.message);
      else if (data) { setMyShare(data as LocShare); toast.success("Sharing for 1 hour ✨"); }
    }, (err) => toast.error(err.message));
    setShowMenu(false);
  }

  async function stopSharing() {
    if (!myShare) return;
    await supabase.from("direct_location_shares").delete().eq("id", myShare.id);
    setMyShare(null);
  }

  const grouped = useMemo(() => {
    const g: { day: string; items: DM[] }[] = [];
    messages.forEach((m) => {
      const day = formatDay(new Date(m.created_at));
      const last = g[g.length - 1];
      if (last && last.day === day) last.items.push(m);
      else g.push({ day, items: [m] });
    });
    return g;
  }, [messages]);

  function addPending(files: FileList | null) {
    if (!files || files.length === 0) return;
    const additions = Array.from(files).map(makeSelected);
    setPending((prev) => [...prev, ...additions].slice(0, 10));
    setShowMenu(false);
  }


  if (!other) {
    return <div className="p-6 text-plum">Loading…</div>;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 flex items-center gap-3 border-b border-white/50 dark:border-white/10">
        <Link to="/inbox" className="p-1.5 rounded-full text-plum hover:bg-white/50">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="relative">
          <div className="w-11 h-11 blob overflow-hidden bg-gradient-to-br from-lavender to-coral grid place-items-center text-plum-deep font-semibold shrink-0">
            {otherAvatarUrl ? <img src={otherAvatarUrl} className="w-full h-full object-cover" /> : other.display_name[0]}
          </div>
          {other.status_emoji && (
            <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-white dark:bg-plum-deep grid place-items-center text-xs shadow">
              {other.status_emoji}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display text-lg text-plum truncate">{other.display_name}</p>
          <p className="text-xs text-muted-foreground truncate italic">
            {other.status_text || "Just the two of you."}
          </p>
        </div>
      </div>

      {/* Live location banner */}
      {(myShare || theirShare) && (
        <div className="px-3 pt-2">
          <div className="pin-glow rounded-2xl px-4 py-2 flex items-center gap-3 text-sm animate-fade-scale">
            <MapPin className="w-4 h-4 text-plum-deep" />
            <div className="flex-1 min-w-0">
              {theirShare && (
                <p className="text-plum-deep truncate">
                  <span className="font-semibold">{other.display_name}</span> is sharing location · ends {formatDistanceToNow(new Date(theirShare.expires_at), { addSuffix: true })}
                </p>
              )}
              {myShare && (
                <p className="text-plum-deep truncate">
                  You're sharing your location · ends {formatDistanceToNow(new Date(myShare.expires_at), { addSuffix: true })}
                </p>
              )}
            </div>
            {myShare && (
              <button onClick={stopSharing} className="text-xs font-semibold text-plum-deep underline">Stop</button>
            )}
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-16 animate-fade-scale">
            <div className="mx-auto w-28 h-28 blob bg-gradient-to-br from-coral/40 to-lavender/60 blur-sm mb-4" />
            <p className="font-display text-xl text-plum">Just the two of you — say hi 👋</p>
            <p className="mt-2 text-sm text-muted-foreground">Nothing here is shared with anyone else.</p>
          </div>
        )}

        {grouped.map((g) => (
          <div key={g.day} className="space-y-3">
            <div className="text-center">
              <span className="text-xs font-semibold text-plum/60 bg-white/50 dark:bg-white/10 px-3 py-1 rounded-full">{g.day}</span>
            </div>
            {g.items.map((m) => {
              const mine = m.sender_id === user.id;
              const author = mine ? me : other;
              const msgReactions = reactions.filter((r) => r.message_id === m.id);
              const seen = !mine && false ? false : reads.some((r) => r.message_id === m.id && r.user_id !== m.sender_id);
              return (
                <div key={m.id} className={`flex gap-2 animate-fade-scale ${mine ? "flex-row-reverse" : ""}`}>
                  <div className={`max-w-[78%] flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
                    <div className="relative group">
                      {m.media_type === "audio" && m.media_url ? (
                        <div className={bubbleClass(author?.bubble_color, mine)}>
                          {mediaUrls[m.media_url] ? <WaveformPlayer src={mediaUrls[m.media_url]} /> : <div className="w-56 h-12 animate-pulse" />}
                        </div>
                      ) : m.media_url ? (
                        <button
                          onClick={() => mediaUrls[m.media_url!] && setLightbox({ url: mediaUrls[m.media_url!], type: m.media_type ?? "image" })}
                          className={`block ${mine ? "-rotate-1" : "rotate-1"} hover:rotate-0 transition-transform rounded-3xl overflow-hidden bg-white dark:bg-white/10 p-1.5 shadow-lg`}
                        >
                          {mediaUrls[m.media_url] ? (
                            m.media_type === "video"
                              ? <video src={mediaUrls[m.media_url]} className="max-w-[240px] max-h-[280px] rounded-2xl" />
                              : <img src={mediaUrls[m.media_url]} className="max-w-[240px] max-h-[280px] rounded-2xl object-cover" />
                          ) : <div className="w-[180px] h-[180px] rounded-2xl bg-muted animate-pulse" />}
                        </button>
                      ) : (
                        <div className={`px-4 py-2.5 ${bubbleClass(author?.bubble_color, mine)}`}>
                          <p className="whitespace-pre-wrap break-words text-[15px]">{m.content}</p>
                        </div>
                      )}
                      <button
                        onClick={() => setReactPickerFor(reactPickerFor === m.id ? null : m.id)}
                        className={`absolute -bottom-2 ${mine ? "-left-2" : "-right-2"} w-7 h-7 rounded-full bg-white dark:bg-plum-deep shadow-md border border-border grid place-items-center opacity-70 md:opacity-0 md:group-hover:opacity-100 transition`} aria-label="React"
                      >
                        <Smile className="w-3.5 h-3.5 text-dusk" />
                      </button>
                      {reactPickerFor === m.id && (
                        <div className={`absolute z-10 ${mine ? "left-0" : "right-0"} -top-11 glass-card rounded-full px-2 py-1 flex gap-1 items-center animate-fade-scale`}>
                          {REACTIONS.map((r) => (
                            <button key={r} onClick={() => toggleReaction(m.id, r)} className="text-xl hover:scale-125 transition">
                              {r}
                            </button>
                          ))}
                          {mine && (
                            <>
                              <span className="w-px h-5 bg-border mx-1" />
                              <button onClick={() => deleteMessage(m.id)} className="p-1 text-destructive"><Trash2 className="w-4 h-4" /></button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    {msgReactions.length > 0 && (
                      <div className={`flex gap-1 flex-wrap ${mine ? "justify-end" : ""}`}>
                        {Array.from(new Set(msgReactions.map((r) => r.emoji))).map((emoji) => {
                          const list = msgReactions.filter((r) => r.emoji === emoji);
                          const has = list.some((r) => r.user_id === user.id);
                          return (
                            <button key={emoji} onClick={() => toggleReaction(m.id, emoji)}
                              className={`text-xs rounded-full px-2 py-0.5 border ${has ? "bg-primary/20 border-primary/40" : "bg-white/70 dark:bg-white/10 border-border"}`}>
                              {emoji} {list.length}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div className={`text-[10px] text-muted-foreground px-2 flex items-center gap-1 ${mine ? "justify-end" : ""}`}>
                      <span>{format(new Date(m.created_at), "h:mm a")}</span>
                      {mine && (seen ? <CheckCheck className="w-3 h-3 text-primary" /> : <Check className="w-3 h-3" />)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <form onSubmit={sendText} className="p-3 flex items-center gap-2 border-t border-white/60 dark:border-white/10 bg-white/40 dark:bg-white/5 backdrop-blur">
        <button type="button" onClick={() => setShowMenu((s) => !s)}
          className="p-3 rounded-full bg-secondary text-secondary-foreground hover:scale-105 transition" aria-label="More">
          <Plus className={`w-5 h-5 transition ${showMenu ? "rotate-45" : ""}`} />
        </button>
        <VoiceRecorder onRecorded={sendVoice} />
        <input
          value={text} onChange={(e) => setText(e.target.value)}
          placeholder={`Write to ${other.display_name}…`}
          className="flex-1 min-w-0 rounded-full bg-input/80 px-4 py-3 border border-border focus:border-primary outline-none"
        />
        <button type="submit" className="p-3 rounded-full bg-primary text-primary-foreground hover:scale-105 transition" aria-label="Send">
          <Send className="w-5 h-5" />
        </button>
      </form>

      {showMenu && (
        <div className="p-3 pt-0 space-y-2 animate-fade-scale">
          <div className="glass-card rounded-3xl p-3 flex gap-2">
            <MediaPickerButtons onCamera={addPending} onGallery={addPending} />
          </div>
          {!myShare && (
            <button onClick={shareLocation}
              className="w-full flex items-center gap-3 rounded-2xl bg-white/60 dark:bg-white/10 p-3 text-left">
              <div className="w-10 h-10 blob bg-gradient-to-br from-coral/60 to-dusk/40 grid place-items-center text-plum-deep">
                <MapPin className="w-4 h-4" />
              </div>
              <div>
                <p className="font-semibold text-plum">Share my location for 1 hour</p>
                <p className="text-xs text-muted-foreground">Just {other.display_name} can see it. Auto-stops after an hour.</p>
              </div>
            </button>
          )}
        </div>
      )}

      {pending.length > 0 && (
        <MediaTray
          items={pending}
          setItems={setPending}
          onCancel={() => { setPending((p) => { p.forEach((x) => URL.revokeObjectURL(x.previewUrl)); return []; }); }}
          onSend={sendMedia}
          sending={sending}
          title={`Send to ${other.display_name}`}
        />
      )}

      {lightbox && (
        <div onClick={() => setLightbox(null)} className="fixed inset-0 z-50 bg-plum-deep/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-scale">
          {lightbox.type === "video" ? (
            <video src={lightbox.url} controls autoPlay className="max-h-full max-w-full rounded-2xl" />
          ) : (
            <img src={lightbox.url} className="max-h-full max-w-full rounded-2xl shadow-2xl" />
          )}
        </div>
      )}
    </div>
  );
}
