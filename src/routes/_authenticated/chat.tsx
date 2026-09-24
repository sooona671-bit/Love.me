import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, isToday, isYesterday } from "date-fns";
import { Send, Search, Smile, X, Check, CheckCheck, Pin, PinOff, BarChart3, Plus, Trash2 } from "lucide-react";
import { bubbleClass, type BubbleColor } from "@/lib/bubble-colors";
import { WaveformPlayer } from "@/components/WaveformPlayer";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { PollCard } from "@/components/PollCard";
import { MediaTray, MediaPickerButtons } from "@/components/MediaTray";
import { uploadToFamilyMedia, makeSelected, type SelectedMedia } from "@/lib/media";

export const Route = createFileRoute("/_authenticated/chat")({
  component: ChatPage,
});

type Profile = { id: string; display_name: string; avatar_url: string | null; bubble_color: BubbleColor; status_emoji: string | null; status_text: string | null };
type Message = {
  id: string;
  sender_id: string;
  content: string | null;
  media_url: string | null;
  media_type: "image" | "video" | "audio" | null;
  created_at: string;
};
type Reaction = { id: string; message_id: string; user_id: string; emoji: string };
type ReadReceipt = { message_id: string; user_id: string; read_at: string };
type PinRow = { id: string; message_id: string; pinned_by: string; note: string | null; created_at: string };

const REACTIONS = ["❤️", "😂", "😮", "😢", "👍", "🌸"];

function formatDay(d: Date) {
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE, MMM d");
}

async function getSignedUrl(path: string) {
  const { data } = await supabase.storage.from("family-media").createSignedUrl(path, 60 * 60 * 6);
  return data?.signedUrl ?? null;
}

function ChatPage() {
  const { user } = Route.useRouteContext();
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [reads, setReads] = useState<ReadReceipt[]>([]);
  const [pins, setPins] = useState<PinRow[]>([]);
  const [polls, setPolls] = useState<Record<string, string>>({}); // message_id -> poll_id
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [lightbox, setLightbox] = useState<{ url: string; type: string } | null>(null);
  const [reactPickerFor, setReactPickerFor] = useState<string | null>(null);
  const [pinIdx, setPinIdx] = useState(0);
  const [pollComposer, setPollComposer] = useState(false);
  const [showMediaMenu, setShowMediaMenu] = useState(false);
  const [pending, setPending] = useState<SelectedMedia[]>([]);
  const [sendingMedia, setSendingMedia] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refresh = useRef(async () => {});
  refresh.current = async () => {
    const [{ data: msgs }, { data: profs }, { data: rxns }, { data: rds }, { data: pns }, { data: pls }] = await Promise.all([
      supabase.from("messages").select("*").order("created_at", { ascending: true }).limit(500),
      supabase.from("profiles").select("*"),
      supabase.from("message_reactions").select("*"),
      supabase.from("message_reads").select("*"),
      supabase.from("pinned_messages").select("*").order("created_at", { ascending: false }),
      supabase.from("polls").select("id, message_id").not("message_id", "is", null),
    ]);
    if (msgs) setMessages(msgs as Message[]);
    if (profs) setProfiles(Object.fromEntries((profs as Profile[]).map((p) => [p.id, p])));
    if (rxns) setReactions(rxns as Reaction[]);
    if (rds) setReads(rds as ReadReceipt[]);
    if (pns) setPins(pns as PinRow[]);
    if (pls) setPolls(Object.fromEntries((pls as { id: string; message_id: string }[]).map((p) => [p.message_id, p.id])));
  };

  // Initial load + a gentle safety-net refresh so a dropped websocket never
  // leaves someone staring at a stale thread.
  useEffect(() => {
    void refresh.current();
    const t = setInterval(() => { void refresh.current(); }, 7000);
    const onFocus = () => { void refresh.current(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);


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

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel("family-chat")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => {
        setMessages((m) => (m.some((x) => x.id === (p.new as Message).id) ? m : [...m, p.new as Message]));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (p) => {
        setMessages((m) => m.filter((x) => x.id !== (p.old as Message).id));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reactions" }, (p) => {
        setReactions((r) => [...r, p.new as Reaction]);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "message_reactions" }, (p) => {
        setReactions((r) => r.filter((x) => x.id !== (p.old as Reaction).id));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reads" }, (p) => {
        setReads((r) => [...r, p.new as ReadReceipt]);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pinned_messages" }, (p) => {
        setPins((r) => [p.new as PinRow, ...r]);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "pinned_messages" }, (p) => {
        setPins((r) => r.filter((x) => x.id !== (p.old as PinRow).id));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, (p) => {
        const np = p.new as Profile;
        setProfiles((s) => ({ ...s, [np.id]: np }));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Rotate pinned messages
  useEffect(() => {
    if (pins.length <= 1) return;
    const t = setInterval(() => setPinIdx((i) => (i + 1) % pins.length), 5000);
    return () => clearInterval(t);
  }, [pins.length]);

  // Auto scroll & mark read
  const markingRead = useRef(false);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    const unread = messages.filter(
      (m) => m.sender_id !== user.id && !reads.some((r) => r.message_id === m.id && r.user_id === user.id),
    );
    if (!unread.length || markingRead.current) return;
    markingRead.current = true;
    // The Supabase query builder is lazy — it must be awaited to actually run.
    void (async () => {
      const rows = unread.map((m) => ({ message_id: m.id, user_id: user.id }));
      const { error } = await supabase.from("message_reads").upsert(rows, { onConflict: "message_id,user_id", ignoreDuplicates: true });
      if (!error) setReads((prev) => [...prev, ...rows.map((r) => ({ ...r, read_at: new Date().toISOString() }))]);
      markingRead.current = false;
    })();
  }, [messages, reads, user.id]);



  async function sendMessage(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text.trim()) return;
    const content = text.trim();
    setText("");
    const { error } = await supabase.from("messages").insert({ sender_id: user.id, content });
    if (error) { toast.error(error.message); setText(content); }
  }

  function queueFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    const additions = Array.from(files).map(makeSelected);
    setPending((prev) => [...prev, ...additions].slice(0, 10));
    setShowMediaMenu(false);
  }


  async function sendPendingMedia(items: SelectedMedia[]) {
    setSendingMedia(true);
    try {
      for (const it of items) {
        const path = await uploadToFamilyMedia(user.id, it.file);
        const { error } = await supabase.from("messages").insert({
          sender_id: user.id, media_url: path, media_type: it.kind,
        });
        if (error) throw error;
      }
      setPending([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSendingMedia(false);
    }
  }

  async function uploadVoice(blob: Blob) {
    setUploading(true);
    try {
      const path = `${user.id}/voice-${Date.now()}.webm`;
      const { error: upErr } = await supabase.storage.from("family-media").upload(path, blob, { contentType: blob.type || "audio/webm" });
      if (upErr) throw upErr;
      const { error } = await supabase.from("messages").insert({
        sender_id: user.id, media_url: path, media_type: "audio",
      });
      if (error) throw error;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Voice note failed");
    } finally {
      setUploading(false);
    }
  }

  async function toggleReaction(messageId: string, emoji: string) {
    const existing = reactions.find((r) => r.message_id === messageId && r.user_id === user.id && r.emoji === emoji);
    if (existing) {
      await supabase.from("message_reactions").delete().eq("id", existing.id);
      setReactions((r) => r.filter((x) => x.id !== existing.id));
    } else {
      const { data } = await supabase.from("message_reactions")
        .insert({ message_id: messageId, user_id: user.id, emoji }).select().single();
      if (data) setReactions((r) => [...r, data as Reaction]);
    }
    setReactPickerFor(null);
  }

  async function togglePin(messageId: string) {
    const existing = pins.find((p) => p.message_id === messageId);
    if (existing) {
      await supabase.from("pinned_messages").delete().eq("id", existing.id);
    } else {
      await supabase.from("pinned_messages").insert({ message_id: messageId, pinned_by: user.id });
      toast.success("Pinned to the top ✨");
    }
    setReactPickerFor(null);
  }

  async function deleteMessage(id: string) {
    if (!confirm("Delete this message for everyone?")) return;
    await supabase.from("messages").delete().eq("id", id);
    setReactPickerFor(null);
  }

  const filteredMessages = useMemo(() => {
    if (!search.trim()) return messages;
    const q = search.toLowerCase();
    return messages.filter((m) =>
      (m.content?.toLowerCase().includes(q)) ||
      format(new Date(m.created_at), "MMM d yyyy").toLowerCase().includes(q)
    );
  }, [search, messages]);

  const grouped = useMemo(() => {
    const g: { day: string; items: Message[] }[] = [];
    filteredMessages.forEach((m) => {
      const day = formatDay(new Date(m.created_at));
      const last = g[g.length - 1];
      if (last && last.day === day) last.items.push(m);
      else g.push({ day, items: [m] });
    });
    return g;
  }, [filteredMessages]);

  const currentPin = pins[pinIdx % Math.max(pins.length, 1)];
  const pinnedMessage = currentPin ? messages.find((m) => m.id === currentPin.message_id) : null;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-4 pt-3 pb-2 flex items-center gap-2">
        {showSearch ? (
          <div className="flex-1 flex items-center gap-2 glass-card rounded-full px-4 py-2 animate-fade-scale">
            <Search className="w-4 h-4 text-plum/60" />
            <input
              autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search messages or a date…"
              className="flex-1 bg-transparent outline-none text-sm"
            />
            <button onClick={() => { setShowSearch(false); setSearch(""); }}>
              <X className="w-4 h-4 text-plum/60" />
            </button>
          </div>
        ) : (
          <>
            <p className="flex-1 text-sm text-plum/70 font-display italic">Together, always.</p>
            <button onClick={() => setShowSearch(true)} className="p-2 rounded-full hover:bg-white/60">
              <Search className="w-4 h-4 text-plum/80" />
            </button>
          </>
        )}
      </div>

      {pinnedMessage && (
        <div className="px-3 pb-2">
          <div className="pin-glow rounded-2xl px-4 py-2.5 flex items-center gap-3 animate-fade-scale">
            <Pin className="w-4 h-4 text-plum-deep shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-plum/70 font-semibold">
                Pinned {pins.length > 1 && <span>· {pinIdx + 1}/{pins.length}</span>}
              </p>
              <p className="text-sm text-plum-deep truncate">
                {pinnedMessage.content ?? (pinnedMessage.media_type === "audio" ? "Voice note" : "Photo")}
              </p>
            </div>
            {currentPin?.pinned_by === user.id && (
              <button onClick={() => togglePin(pinnedMessage.id)} className="p-1.5 text-plum-deep/70 hover:text-plum">
                <PinOff className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-2 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-16 animate-fade-scale">
            <div className="mx-auto w-32 h-32 blob bg-gradient-to-br from-coral/40 to-lavender/60 blur-sm mb-4" />
            <h2 className="font-display text-2xl text-plum">Your family's story starts here</h2>
            <p className="mt-2 text-sm text-muted-foreground">Say hello — a quiet "good morning" is a beautiful place to begin.</p>
          </div>
        )}

        {grouped.map((g) => (
          <div key={g.day} className="space-y-3">
            <div className="text-center">
              <span className="text-xs font-semibold text-plum/60 bg-white/50 dark:bg-white/10 px-3 py-1 rounded-full">{g.day}</span>
            </div>
            {g.items.map((m) => {
              const mine = m.sender_id === user.id;
              const author = profiles[m.sender_id];
              const msgReactions = reactions.filter((r) => r.message_id === m.id);
              const seenBy = reads.filter((r) => r.message_id === m.id && r.user_id !== m.sender_id);
              const isPinned = pins.some((p) => p.message_id === m.id);
              const pollId = polls[m.id];
              return (
                <div key={m.id} className={`flex gap-2 animate-fade-scale ${mine ? "flex-row-reverse" : ""}`}>
                  {!mine && <Avatar profile={author} />}
                  <div className={`max-w-[75%] ${mine ? "items-end" : "items-start"} flex flex-col gap-1`}>
                    {!mine && (
                      <span className="text-xs font-semibold text-dusk px-2 flex items-center gap-1">
                        {author?.display_name ?? "…"}
                        {author?.status_emoji && <span>{author.status_emoji}</span>}
                      </span>
                    )}
                    <div className="relative group">
                      {pollId ? (
                        <PollCard pollId={pollId} userId={user.id} />
                      ) : m.media_type === "audio" && m.media_url ? (
                        <div className={`${bubbleClass(author?.bubble_color, mine)}`}>
                          {mediaUrls[m.media_url] ? (
                            <WaveformPlayer src={mediaUrls[m.media_url]} />
                          ) : (
                            <div className="w-56 h-12 animate-pulse" />
                          )}
                        </div>
                      ) : m.media_url ? (
                        <MediaBubble
                          mine={mine}
                          url={mediaUrls[m.media_url]}
                          type={m.media_type ?? "image"}
                          onClick={() => mediaUrls[m.media_url!] && setLightbox({ url: mediaUrls[m.media_url!], type: m.media_type ?? "image" })}
                        />
                      ) : (
                        <div className={`px-4 py-2.5 ${bubbleClass(author?.bubble_color, mine)}`}>
                          <p className="whitespace-pre-wrap break-words text-[15px]">{m.content}</p>
                        </div>
                      )}
                      {isPinned && (
                        <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-muted-gold grid place-items-center shadow">
                          <Pin className="w-2.5 h-2.5 text-plum-deep" />
                        </span>
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
                          <span className="w-px h-5 bg-border mx-1" />
                          <button onClick={() => togglePin(m.id)} className="p-1 text-plum hover:scale-110 transition" title={isPinned ? "Unpin" : "Pin"}>
                            {isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                          </button>
                          {mine && (
                            <button onClick={() => deleteMessage(m.id)} className="p-1 text-destructive hover:scale-110 transition" title="Delete">
                              <Trash2 className="w-4 h-4" />
                            </button>
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
                            <button
                              key={emoji} onClick={() => toggleReaction(m.id, emoji)}
                              className={`text-xs rounded-full px-2 py-0.5 border transition ${has ? "bg-primary/20 border-primary/40" : "bg-white/70 dark:bg-white/10 border-border"}`}
                            >
                              {emoji} {list.length}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div className={`text-[10px] text-muted-foreground px-2 flex items-center gap-1 ${mine ? "justify-end" : ""}`}>
                      <span>{format(new Date(m.created_at), "h:mm a")}</span>
                      {mine && (
                        seenBy.length > 0
                          ? <CheckCheck className="w-3 h-3 text-primary" />
                          : <Check className="w-3 h-3" />
                      )}
                    </div>
                    {mine && seenBy.length > 0 && (
                      <div className="flex -space-x-1 pr-1">
                        {seenBy.slice(0, 3).map((r) => {
                          const p = profiles[r.user_id];
                          return <MiniAvatar key={r.user_id} profile={p} />;
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <form onSubmit={sendMessage} className="p-3 flex items-center gap-2 border-t border-white/60 dark:border-white/10 bg-white/40 dark:bg-white/5 backdrop-blur">
        <button type="button" onClick={() => setShowMediaMenu((s) => !s)} disabled={uploading}
          className="p-3 rounded-full bg-secondary text-secondary-foreground hover:scale-105 transition disabled:opacity-60" aria-label="Add media">
          <Plus className={`w-5 h-5 transition ${showMediaMenu ? "rotate-45" : ""}`} />
        </button>
        <VoiceRecorder onRecorded={uploadVoice} />
        <button type="button" onClick={() => setPollComposer(true)}
          className="p-3 rounded-full bg-secondary text-secondary-foreground hover:scale-105 transition" aria-label="Poll">
          <BarChart3 className="w-5 h-5" />
        </button>
        <input
          value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Write something warm…"
          className="flex-1 min-w-0 rounded-full bg-input/80 px-4 py-3 border border-border focus:border-primary outline-none"
        />
        <button type="submit" className="p-3 rounded-full bg-primary text-primary-foreground hover:scale-105 transition" aria-label="Send">
          <Send className="w-5 h-5" />
        </button>
      </form>

      {showMediaMenu && (
        <div className="p-3 pt-0 animate-fade-scale">
          <div className="glass-card rounded-3xl p-3 flex gap-2">
            <MediaPickerButtons onCamera={queueFiles} onGallery={queueFiles} />
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <MediaTray
          items={pending}
          setItems={setPending}
          onCancel={() => setPending((p) => { p.forEach((x) => URL.revokeObjectURL(x.previewUrl)); return []; })}
          onSend={sendPendingMedia}
          sending={sendingMedia}
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

      {pollComposer && <PollComposer userId={user.id} onClose={() => setPollComposer(false)} />}
    </div>
  );
}

function PollComposer({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const cleaned = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || cleaned.length < 2) return toast.error("A question and at least two choices, please.");
    setBusy(true);
    try {
      const { data: msg, error: mErr } = await supabase.from("messages")
        .insert({ sender_id: userId, content: `📊 ${question.trim()}` }).select().single();
      if (mErr || !msg) throw mErr;
      const { data: poll, error: pErr } = await supabase.from("polls")
        .insert({ question: question.trim(), created_by: userId, message_id: msg.id }).select().single();
      if (pErr || !poll) throw pErr;
      const { error: oErr } = await supabase.from("poll_options")
        .insert(cleaned.map((label, i) => ({ poll_id: poll.id, label, position: i })));
      if (oErr) throw oErr;
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create poll");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-plum-deep/70 backdrop-blur-md flex items-center justify-center p-4 animate-fade-scale">
      <div onClick={(e) => e.stopPropagation()} className="glass-card rounded-3xl p-6 max-w-md w-full space-y-4">
        <h2 className="font-display text-2xl text-plum">Ask the family</h2>
        <input
          value={question} onChange={(e) => setQuestion(e.target.value)}
          placeholder="Where should we eat tonight?"
          className="w-full rounded-2xl bg-input px-4 py-3 border border-border focus:border-primary outline-none"
        />
        <div className="space-y-2">
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={o} onChange={(e) => setOptions(options.map((v, j) => (j === i ? e.target.value : v)))}
                placeholder={`Option ${i + 1}`}
                className="flex-1 rounded-2xl bg-input px-4 py-2.5 border border-border focus:border-primary outline-none text-sm"
              />
              {options.length > 2 && (
                <button onClick={() => setOptions(options.filter((_, j) => j !== i))} className="p-2 text-dusk">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          {options.length < 6 && (
            <button onClick={() => setOptions([...options, ""])} className="flex items-center gap-1 text-sm text-primary font-semibold">
              <Plus className="w-4 h-4" /> Add another choice
            </button>
          )}
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 rounded-full bg-secondary text-secondary-foreground py-2.5 font-semibold">Cancel</button>
          <button onClick={submit} disabled={busy} className="flex-1 rounded-full bg-primary text-primary-foreground py-2.5 font-semibold disabled:opacity-60">
            {busy ? "…" : "Send poll"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Avatar({ profile }: { profile?: Profile }) {
  const initial = profile?.display_name?.[0]?.toUpperCase() ?? "?";
  return (
    <div className="w-8 h-8 blob overflow-hidden bg-gradient-to-br from-lavender to-coral grid place-items-center text-plum-deep font-semibold text-sm shrink-0">
      {profile?.avatar_url ? <img src={profile.avatar_url} className="w-full h-full object-cover" /> : initial}
    </div>
  );
}

function MiniAvatar({ profile }: { profile?: Profile }) {
  return (
    <div className="w-4 h-4 rounded-full overflow-hidden bg-lavender border border-white ring-1 ring-border grid place-items-center text-[8px]">
      {profile?.avatar_url ? <img src={profile.avatar_url} className="w-full h-full object-cover" /> : profile?.display_name?.[0]}
    </div>
  );
}

function MediaBubble({ mine, url, type, onClick }: { mine: boolean; url?: string; type: string; onClick: () => void }) {
  const tilt = mine ? "-rotate-1" : "rotate-1";
  return (
    <button onClick={onClick} className={`block ${tilt} hover:rotate-0 transition-transform rounded-3xl overflow-hidden bg-white dark:bg-white/10 p-1.5 shadow-lg`}>
      {url ? (
        type === "video" ? (
          <video src={url} className="max-w-[240px] max-h-[280px] rounded-2xl" />
        ) : (
          <img src={url} className="max-w-[240px] max-h-[280px] rounded-2xl object-cover" />
        )
      ) : (
        <div className="w-[200px] h-[200px] rounded-2xl bg-muted animate-pulse" />
      )}
    </button>
  );
}
