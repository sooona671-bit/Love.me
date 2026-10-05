import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { format, isToday, isYesterday } from "date-fns";
import { Check, ChevronLeft, Copy, Image as ImageIcon, MoreHorizontal, Plus, Send, ShieldCheck, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { bubbleClass, type BubbleColor } from "@/lib/bubble-colors";
import { MediaTray, MediaPickerButtons } from "@/components/MediaTray";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { WaveformPlayer } from "@/components/WaveformPlayer";
import { getSignedUrl, makeSelected, uploadToFamilyMedia, type SelectedMedia } from "@/lib/media";

export const Route = createFileRoute("/_authenticated/inbox/group/$groupId")({
  component: GroupThreadPage,
});

const groupDb = supabase as unknown as SupabaseClient;

type Group = { id: string; name: string; avatar_url: string | null; created_by: string };
type Member = { group_id: string; user_id: string; nickname: string | null; is_admin: boolean; joined_at: string };
type Profile = { id: string; display_name: string; avatar_url: string | null; bubble_color: BubbleColor };
type GroupMessage = {
  id: string;
  group_id: string;
  sender_id: string;
  content: string | null;
  media_url: string | null;
  media_type: "image" | "video" | "audio" | null;
  created_at: string;
};
type DayGroup = { day: string; messages: GroupMessage[] };

function formatDay(date: Date) {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "EEEE, MMM d");
}

function GroupThreadPage() {
  const { user } = Route.useRouteContext();
  const { groupId } = Route.useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [pending, setPending] = useState<SelectedMedia[]>([]);
  const [sending, setSending] = useState(false);
  const [uploadingVoice, setUploadingVoice] = useState(false);
  const [messageMenu, setMessageMenu] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; type: string } | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [addingMembers, setAddingMembers] = useState(false);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nickname, setNickname] = useState("");
  const [savingNickname, setSavingNickname] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledRemoval = useRef(false);
  const membersLoaded = useRef(false);

  const myMember = members.find((member) => member.user_id === user.id);
  const isAdmin = myMember?.is_admin ?? false;
  const displayName = (member: Member) =>
    member.nickname?.trim() || profiles[member.user_id]?.display_name || "Family member";

  useEffect(() => {
    let active = true;

    async function loadMembers() {
      const { data, error } = await groupDb
        .from("group_members")
        .select("group_id, user_id, nickname, is_admin, joined_at")
        .eq("group_id", groupId);
      if (error) {
        toast.error(error.message);
        return;
      }
      const nextMembers = (data ?? []) as Member[];
      if (!active) return;
      setMembers(nextMembers);
      if (membersLoaded.current && !nextMembers.some((member) => member.user_id === user.id) && !handledRemoval.current) {
        handledRemoval.current = true;
        toast.error("You are no longer a member of this group.");
        void navigate({ to: "/inbox", replace: true });
      }
      membersLoaded.current = true;

      if (nextMembers.length) {
        const { data: profileRows, error: profileError } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, bubble_color")
          .in("id", nextMembers.map((member) => member.user_id));
        if (profileError) {
          toast.error(profileError.message);
          return;
        }
        const profileMap = Object.fromEntries(((profileRows ?? []) as Profile[]).map((profile) => [profile.id, profile]));
        if (!active) return;
        setProfiles(profileMap);

        const avatarEntries = await Promise.all(
          Object.values(profileMap).filter((profile) => profile.avatar_url).map(async (profile) => {
            const avatar = profile.avatar_url!;
            const url = avatar.startsWith("http") ? avatar : await getSignedUrl(avatar);
            return [profile.id, url ?? ""] as const;
          }),
        );
        if (active) setAvatarUrls(Object.fromEntries(avatarEntries));
      } else {
        setProfiles({});
        setAvatarUrls({});
      }
    }

    async function loadInitial() {
      const [{ data: groupRow, error: groupError }, { data: messageRows, error: messagesError }] = await Promise.all([
        groupDb.from("groups").select("id, name, avatar_url, created_by").eq("id", groupId).maybeSingle(),
        groupDb.from("group_messages").select("*").eq("group_id", groupId).order("created_at", { ascending: true }).limit(500),
      ]);
      if (!active) return;
      if (groupError) {
        toast.error(groupError.message);
        return;
      }
      if (!groupRow) {
        toast.error("This group is unavailable.");
        void navigate({ to: "/inbox", replace: true });
        return;
      }
      if (messagesError) {
        toast.error(messagesError.message);
        return;
      }
      setGroup(groupRow as Group);
      setMessages((messageRows ?? []) as GroupMessage[]);
      await loadMembers();

      const mediaMessages = (messageRows ?? []) as GroupMessage[];
      const mediaPaths = [...new Set(mediaMessages.flatMap((message) => message.media_url ? [message.media_url] : []))];
      const entries = await Promise.all(mediaPaths.map(async (path) => [path, (await getSignedUrl(path)) ?? ""] as const));
      if (active) setMediaUrls(Object.fromEntries(entries));
    }

    void loadInitial();

    const channel = groupDb
      .channel(`group-thread-${groupId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "group_messages",
        filter: `group_id=eq.${groupId}`,
      }, async (payload) => {
        const incoming = payload.new as GroupMessage;
        setMessages((previous) => previous.some((message) => message.id === incoming.id) ? previous : [...previous, incoming]);
        if (incoming.media_url) {
          const url = await getSignedUrl(incoming.media_url);
          if (url) setMediaUrls((previous) => ({ ...previous, [incoming.media_url!]: url }));
        }
      })
      .on("postgres_changes", {
        event: "DELETE",
        schema: "public",
        table: "group_messages",
        filter: `group_id=eq.${groupId}`,
      }, (payload) => {
        setMessages((previous) => previous.filter((message) => message.id !== (payload.old as GroupMessage).id));
      })
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "group_members",
        filter: `group_id=eq.${groupId}`,
      }, () => {
        void loadMembers();
      })
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "groups",
        filter: `id=eq.${groupId}`,
      }, async (payload) => {
        if (payload.eventType === "DELETE") {
          toast.error("This group was deleted.");
          void navigate({ to: "/inbox", replace: true });
          return;
        }
        const { data, error } = await groupDb
          .from("groups")
          .select("id, name, avatar_url, created_by")
          .eq("id", groupId)
          .maybeSingle();
        if (error) toast.error(error.message);
        else if (data) setGroup(data as Group);
      })
      .subscribe();

    return () => {
      active = false;
      clearTimeout(longPressTimer.current ?? undefined);
      void groupDb.removeChannel(channel);
    };
  }, [groupId, user.id, navigate]);

  useEffect(() => {
    const missing = messages.filter((message) => message.media_url && mediaUrls[message.media_url] === undefined);
    const paths = [...new Set(missing.flatMap((message) => message.media_url ? [message.media_url] : []))];
    if (!paths.length) return;
    void Promise.all(paths.map(async (path) => [path, (await getSignedUrl(path)) ?? ""] as const))
      .then((entries) => setMediaUrls((previous) => ({ ...previous, ...Object.fromEntries(entries) })));
  }, [messages, mediaUrls]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const groupedMessages = useMemo(() => {
    const grouped: DayGroup[] = [];
    for (const message of messages) {
      const day = formatDay(new Date(message.created_at));
      const last = grouped[grouped.length - 1];
      if (last?.day === day) last.messages.push(message);
      else grouped.push({ day, messages: [message] });
    }
    return grouped;
  }, [messages]);

  async function sendText(event?: React.FormEvent) {
    event?.preventDefault();
    const content = text.trim();
    if (!content) return;
    setText("");
    const { error } = await groupDb.from("group_messages").insert({
      group_id: groupId,
      sender_id: user.id,
      content,
    });
    if (error) {
      toast.error(error.message);
      setText(content);
    }
  }

  async function sendMedia(items: SelectedMedia[]) {
    setSending(true);
    try {
      for (const item of items) {
        const path = await uploadToFamilyMedia(user.id, item.file);
        const { error } = await groupDb.from("group_messages").insert({
          group_id: groupId,
          sender_id: user.id,
          media_url: path,
          media_type: item.kind,
        });
        if (error) throw error;
      }
      setPending([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't send media.");
    } finally {
      setSending(false);
    }
  }

  async function sendVoice(blob: Blob) {
    setUploadingVoice(true);
    try {
      const path = await uploadToFamilyMedia(user.id, blob, "webm");
      const { error } = await groupDb.from("group_messages").insert({
        group_id: groupId,
        sender_id: user.id,
        media_url: path,
        media_type: "audio",
      });
      if (error) throw error;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Voice note failed.");
    } finally {
      setUploadingVoice(false);
    }
  }

  function addPending(files: FileList | null) {
    if (!files?.length) return;
    setPending((previous) => [...previous, ...Array.from(files).map(makeSelected)].slice(0, 10));
    setShowMenu(false);
  }

  async function deleteMessage(message: GroupMessage) {
    if (!confirm("Delete this message for everyone?")) return;
    const { error } = await groupDb.from("group_messages").delete().eq("id", message.id);
    if (error) toast.error(error.message);
    else setMessageMenu(null);
  }

  async function addMembers() {
    if (!selectedMembers.length || addingMembers) return;
    setAddingMembers(true);
    const { error } = await groupDb.from("group_members").insert(
      selectedMembers.map((userId) => ({ group_id: groupId, user_id: userId, is_admin: false })),
    );
    if (error) toast.error(error.message);
    else {
      setSelectedMembers([]);
      setShowAddMembers(false);
      toast.success("Members added.");
    }
    setAddingMembers(false);
  }

  async function removeMember(member: Member) {
    if (!confirm(`Remove ${displayName(member)} from this group?`)) return;
    const { error } = await groupDb.from("group_members").delete()
      .eq("group_id", groupId).eq("user_id", member.user_id);
    if (error) toast.error(error.message);
    else toast.success("Member removed.");
  }

  async function promoteMember(member: Member) {
    if (!confirm(`Make ${displayName(member)} an admin?`)) return;
    const { error } = await groupDb.from("group_members").update({ is_admin: true })
      .eq("group_id", groupId).eq("user_id", member.user_id);
    if (error) toast.error(error.message);
    else toast.success(`${displayName(member)} is now an admin.`);
  }

  async function leaveGroup() {
    if (!confirm("Leave this group? You will no longer see its messages.")) return;
    const { error } = await groupDb.from("group_members").delete()
      .eq("group_id", groupId).eq("user_id", user.id);
    if (error) toast.error(error.message);
    else void navigate({ to: "/inbox", replace: true });
  }

  async function deleteGroup() {
    if (!confirm("Delete this group permanently? All members and messages will be removed. This cannot be undone.")) return;
    const { error } = await groupDb.from("groups").delete().eq("id", groupId);
    if (error) toast.error(error.message);
    else void navigate({ to: "/inbox", replace: true });
  }

  async function saveNickname() {
    if (!myMember || savingNickname) return;
    setSavingNickname(true);
    const { error } = await groupDb.from("group_members")
      .update({ nickname: nickname.trim() || null })
      .eq("group_id", groupId)
      .eq("user_id", user.id);
    if (error) toast.error(error.message);
    else {
      setEditingNickname(false);
      toast.success("Nickname updated.");
    }
    setSavingNickname(false);
  }

  if (!group) return <div className="p-6 text-plum">Loading group…</div>;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-white/50 px-3 py-3 dark:border-white/10">
        <Link to="/inbox" className="rounded-full p-1.5 text-plum hover:bg-white/50" aria-label="Back to inbox">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <button type="button" onClick={() => setShowInfo(true)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-lavender to-coral text-plum-deep">
            {group.avatar_url
              ? <img src={group.avatar_url} alt="" className="h-full w-full object-cover" />
              : <Users className="h-5 w-5" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-lg text-plum">{group.name}</span>
            <span className="block text-xs text-muted-foreground">{members.length} {members.length === 1 ? "member" : "members"}</span>
          </span>
        </button>
        <button type="button" onClick={() => setShowInfo(true)} className="rounded-full p-2 text-plum/70 hover:bg-white/50" aria-label="Group info">
          <Users className="h-5 w-5" />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <div className="animate-fade-scale py-16 text-center">
            <div className="blob mx-auto mb-4 h-28 w-28 bg-gradient-to-br from-coral/40 to-lavender/60 blur-sm" />
            <p className="font-display text-xl text-plum">Your group story starts here</p>
            <p className="mt-2 text-sm text-muted-foreground">Send the first message.</p>
          </div>
        )}
        {groupedMessages.map((day) => (
          <div key={day.day} className="space-y-3">
            <div className="text-center">
              <span className="rounded-full bg-white/50 px-3 py-1 text-xs font-semibold text-plum/60 dark:bg-white/10">{day.day}</span>
            </div>
            {day.messages.map((message) => {
              const mine = message.sender_id === user.id;
              const sender = members.find((member) => member.user_id === message.sender_id);
              const profile = profiles[message.sender_id];
              const senderName = sender
                ? displayName(sender)
                : profile?.display_name ?? "Family member";
              return (
                <div key={message.id} className={`flex gap-2 animate-fade-scale ${mine ? "flex-row-reverse" : ""}`}>
                  {!mine && (
                    <span className="mt-5 grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-lavender to-coral text-xs font-semibold text-plum-deep">
                      {avatarUrls[message.sender_id]
                        ? <img src={avatarUrls[message.sender_id]} alt="" className="h-full w-full object-cover" />
                        : senderName[0]?.toUpperCase()}
                    </span>
                  )}
                  <div className={`flex max-w-[78%] flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
                    {!mine && <span className="px-2 text-xs font-semibold text-dusk">{senderName}</span>}
                    <div
                      className="relative group"
                      onTouchStart={() => { longPressTimer.current = setTimeout(() => setMessageMenu(message.id), 420); }}
                      onTouchEnd={() => clearTimeout(longPressTimer.current ?? undefined)}
                      onTouchMove={() => clearTimeout(longPressTimer.current ?? undefined)}
                      onContextMenu={(event) => { event.preventDefault(); setMessageMenu(message.id); }}
                    >
                      {message.media_type === "audio" && message.media_url ? (
                        <div className={bubbleClass(profile?.bubble_color, mine)}>
                          {mediaUrls[message.media_url] ? <WaveformPlayer src={mediaUrls[message.media_url]} /> : <div className="h-12 w-56 animate-pulse" />}
                        </div>
                      ) : message.media_url ? (
                        <GroupMediaBubble
                          url={mediaUrls[message.media_url]}
                          type={message.media_type ?? "image"}
                          onClick={() => mediaUrls[message.media_url!] && setLightbox({ url: mediaUrls[message.media_url!], type: message.media_type ?? "image" })}
                        />
                      ) : (
                        <div className={`px-4 py-2.5 ${bubbleClass(profile?.bubble_color, mine)}`}>
                          <p className="whitespace-pre-wrap break-words text-[15px]">{message.content}</p>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setMessageMenu(messageMenu === message.id ? null : message.id)}
                        className={`absolute -bottom-2 ${mine ? "-left-2" : "-right-2"} grid h-7 w-7 place-items-center rounded-full border border-border bg-white opacity-80 shadow-md transition dark:bg-plum-deep`}
                        aria-label="Message options"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5 text-dusk" />
                      </button>
                      {messageMenu === message.id && (
                        <div className={`absolute z-20 ${mine ? "right-0" : "left-0"} -top-2 w-48 -translate-y-full rounded-2xl p-2 shadow-xl glass-card`}>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(message.content ?? (message.media_type ? "Media message" : ""));
                                toast.success("Copied");
                              } catch {
                                toast.error("Copy failed");
                              }
                              setMessageMenu(null);
                            }}
                            className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm text-plum hover:bg-white/60 dark:hover:bg-white/10"
                          >
                            <Copy className="h-4 w-4" /> Copy message
                          </button>
                          {(mine || isAdmin) && (
                            <button
                              type="button"
                              onClick={() => void deleteMessage(message)}
                              className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" /> Delete message
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <span className="px-2 text-[10px] text-muted-foreground">{format(new Date(message.created_at), "h:mm a")}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <form onSubmit={(event) => void sendText(event)} className="sticky bottom-0 z-10 flex items-center gap-2 border-t border-white/60 bg-white/95 p-3 backdrop-blur dark:border-white/10 dark:bg-plum-deep/95">
        <button type="button" onClick={() => setShowMenu((open) => !open)} className="rounded-full bg-secondary p-3 text-secondary-foreground transition hover:scale-105" aria-label="Add media">
          <Plus className={`h-5 w-5 transition ${showMenu ? "rotate-45" : ""}`} />
        </button>
        <VoiceRecorder onRecorded={sendVoice} />
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={`Message ${group.name}…`}
          className="min-w-0 flex-1 rounded-full border border-border bg-input/80 px-4 py-3 outline-none focus:border-primary"
        />
        <button type="submit" disabled={!text.trim() || uploadingVoice} className="rounded-full bg-primary p-3 text-primary-foreground transition hover:scale-105 disabled:opacity-50" aria-label="Send">
          <Send className="h-5 w-5" />
        </button>
      </form>

      {showMenu && (
        <div className="space-y-2 p-3 pt-0 animate-fade-scale">
          <div className="glass-card flex gap-2 rounded-3xl p-3">
            <MediaPickerButtons onCamera={addPending} onGallery={addPending} />
          </div>
        </div>
      )}
      {pending.length > 0 && (
        <MediaTray
          items={pending}
          setItems={setPending}
          onCancel={() => setPending((previous) => { previous.forEach((item) => URL.revokeObjectURL(item.previewUrl)); return []; })}
          onSend={sendMedia}
          sending={sending}
          title={`Send to ${group.name}`}
        />
      )}

      {lightbox && (
        <div onClick={() => setLightbox(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-plum-deep/80 p-4 backdrop-blur-md animate-fade-scale">
          {lightbox.type === "video"
            ? <video src={lightbox.url} controls autoPlay className="max-h-full max-w-full rounded-2xl" />
            : <img src={lightbox.url} alt="" className="max-h-full max-w-full rounded-2xl shadow-2xl" />}
        </div>
      )}

      {showInfo && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-plum-deep/60 p-3 backdrop-blur-sm sm:items-center" onClick={() => setShowInfo(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="group-info-title" onClick={(event) => event.stopPropagation()} className="glass-card max-h-[85dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-3xl p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id="group-info-title" className="font-display text-2xl text-plum">Group info</h2>
                <p className="text-sm text-muted-foreground">{group.name} · {members.length} {members.length === 1 ? "member" : "members"}</p>
              </div>
              <button type="button" onClick={() => setShowInfo(false)} className="rounded-full p-2 text-plum/70 hover:bg-white/50" aria-label="Close group info">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-1">
              {members.map((member) => (
                <div key={member.user_id} className="flex items-center gap-3 rounded-2xl px-2 py-2">
                  <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-lavender to-coral text-sm font-semibold text-plum-deep">
                    {avatarUrls[member.user_id]
                      ? <img src={avatarUrls[member.user_id]} alt="" className="h-full w-full object-cover" />
                      : displayName(member)[0]?.toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-plum">
                      {displayName(member)}{member.user_id === user.id ? " (you)" : ""}
                    </span>
                    {member.is_admin && (
                      <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-dusk">
                        <ShieldCheck className="h-3 w-3" /> Admin
                      </span>
                    )}
                  </span>
                  {isAdmin && member.user_id !== user.id && (
                    <div className="flex shrink-0 gap-1">
                      {!member.is_admin && (
                        <button type="button" onClick={() => void promoteMember(member)} className="rounded-full px-2 py-1 text-xs font-semibold text-plum hover:bg-white/60" aria-label={`Promote ${displayName(member)} to admin`}>
                          Make admin
                        </button>
                      )}
                      <button type="button" onClick={() => void removeMember(member)} className="rounded-full p-2 text-destructive hover:bg-destructive/10" aria-label={`Remove ${displayName(member)}`}>
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {editingNickname ? (
              <div className="flex gap-2">
                <input
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  maxLength={40}
                  placeholder="Nickname for this group"
                  className="min-w-0 flex-1 rounded-2xl border border-border bg-input/80 px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <button type="button" onClick={() => void saveNickname()} disabled={savingNickname} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                  {savingNickname ? "Saving…" : "Save"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setNickname(myMember?.nickname ?? ""); setEditingNickname(true); }}
                className="w-full rounded-full bg-secondary py-2.5 text-sm font-semibold text-secondary-foreground"
              >
                Edit my nickname
              </button>
            )}

            {isAdmin ? (
              <>
                <button type="button" onClick={() => setShowAddMembers(true)} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-secondary py-2.5 font-semibold text-secondary-foreground">
                  <Plus className="h-4 w-4" /> Add members
                </button>
                <button type="button" onClick={() => void deleteGroup()} className="w-full rounded-full bg-destructive/10 py-2.5 font-semibold text-destructive">
                  Delete group
                </button>
              </>
            ) : (
              <button type="button" onClick={() => void leaveGroup()} className="w-full rounded-full bg-destructive/10 py-2.5 font-semibold text-destructive">
                Leave group
              </button>
            )}
          </section>
        </div>
      )}

      {showAddMembers && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-plum-deep/60 p-3 backdrop-blur-sm sm:items-center" onClick={() => setShowAddMembers(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="add-group-members-title" onClick={(event) => event.stopPropagation()} className="glass-card max-h-[80dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-3xl p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 id="add-group-members-title" className="font-display text-2xl text-plum">Add members</h2>
              <button type="button" onClick={() => setShowAddMembers(false)} className="rounded-full p-2 text-plum/70 hover:bg-white/50" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <AddMembersPicker
              groupId={groupId}
              currentUserId={user.id}
              existingIds={members.map((member) => member.user_id)}
              profiles={allProfiles}
              onProfiles={setAllProfiles}
              selected={selectedMembers}
              onSelected={setSelectedMembers}
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowAddMembers(false)} className="flex-1 rounded-full bg-secondary py-3 font-semibold text-secondary-foreground">Cancel</button>
              <button type="button" onClick={() => void addMembers()} disabled={!selectedMembers.length || addingMembers} className="flex-1 rounded-full bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-50">
                {addingMembers ? "Adding…" : "Add selected"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function AddMembersPicker({
  groupId,
  currentUserId,
  existingIds,
  profiles,
  onProfiles,
  selected,
  onSelected,
}: {
  groupId: string;
  currentUserId: string;
  existingIds: string[];
  profiles: Profile[];
  onProfiles: (profiles: Profile[]) => void;
  selected: string[];
  onSelected: (ids: string[]) => void;
}) {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void groupDb.from("profiles").select("id, display_name, avatar_url, bubble_color")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) toast.error(error.message);
        else onProfiles(((data ?? []) as Profile[]));
        setLoading(false);
      });
    return () => { active = false; };
  }, [groupId, onProfiles]);

  const candidates = profiles.filter((profile) => profile.id !== currentUserId && !existingIds.includes(profile.id));
  if (loading) return <p className="py-4 text-sm text-muted-foreground">Loading family members…</p>;
  if (!candidates.length) return <p className="py-4 text-sm text-muted-foreground">Everyone is already in this group.</p>;

  return (
    <div className="max-h-64 space-y-1 overflow-y-auto">
      {candidates.map((profile) => {
        const checked = selected.includes(profile.id);
        return (
          <button
            key={profile.id}
            type="button"
            onClick={() => onSelected(checked ? selected.filter((id) => id !== profile.id) : [...selected, profile.id])}
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition hover:bg-white/50 dark:hover:bg-white/10"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-lavender to-coral text-sm font-semibold text-plum-deep">
              {profile.display_name[0]?.toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-plum">{profile.display_name}</span>
            <span className={`grid h-6 w-6 place-items-center rounded-full border ${checked ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
              {checked && <Check className="h-4 w-4" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function GroupMediaBubble({ url, type, onClick }: { url?: string; type: string; onClick: () => void }) {
  const [broken, setBroken] = useState(false);
  return (
    <button type="button" onClick={onClick} className="block rotate-1 overflow-hidden rounded-3xl bg-white p-1.5 shadow-lg transition-transform hover:rotate-0 dark:bg-white/10">
      {url && !broken ? (
        type === "video" ? (
          <video src={url} style={{ width: 200, height: 200, maxWidth: "60vw", maxHeight: "60vw" }} className="rounded-2xl object-cover" onError={() => setBroken(true)} />
        ) : (
          <img src={url} alt="" style={{ width: 200, height: 200, maxWidth: "60vw", maxHeight: "60vw" }} className="rounded-2xl object-cover" onError={() => setBroken(true)} />
        )
      ) : (
        <div style={{ width: 180, height: 180, maxWidth: "60vw", maxHeight: "60vw" }} className="grid place-items-center rounded-2xl bg-muted text-xs text-muted-foreground">
          {url ? "Couldn't load" : <ImageIcon className="h-5 w-5" />}
        </div>
      )}
    </button>
  );
}
