import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDistanceToNow } from "date-fns";
import { Check, Mail, Plus, Users, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/inbox/")({
  component: InboxListPage,
});


type Profile = { id: string; display_name: string; avatar_url: string | null; status_emoji: string | null };
type DM = { id: string; sender_id: string; recipient_id: string; content: string | null; media_type: string | null; created_at: string };
type Group = { id: string; name: string; member_count: number };

const groupSupabase = supabase as unknown as SupabaseClient;

function otherIdOf(m: DM, me: string) {
  return m.sender_id === me ? m.recipient_id : m.sender_id;
}

function preview(m: DM) {
  if (m.content) return m.content;
  if (m.media_type === "image") return "📸 Photo";
  if (m.media_type === "video") return "🎬 Video";
  if (m.media_type === "audio") return "🎙️ Voice note";
  return "New message";
}

function InboxListPage() {
  const { user } = Route.useRouteContext();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [signedAvatars, setSignedAvatars] = useState<Record<string, string>>({});
  const [threads, setThreads] = useState<Record<string, { last: DM; unread: number }>>({});
  const [groups, setGroups] = useState<Group[]>([]);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [profilesLoaded, setProfilesLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      const [{ data: profs }, { data: msgs }, { data: reads }] = await Promise.all([
        supabase.from("profiles").select("id, display_name, avatar_url, status_emoji").neq("id", user.id),
        supabase.from("direct_messages").select("*").or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`).order("created_at", { ascending: false }).limit(500),
        supabase.from("direct_message_reads").select("message_id").eq("user_id", user.id),
      ]);
      if (profs) setProfiles(profs as Profile[]);
      setProfilesLoaded(true);
      const readSet = new Set((reads ?? []).map((r) => r.message_id));
      const map: Record<string, { last: DM; unread: number }> = {};
      for (const m of (msgs as DM[] ?? [])) {
        const other = otherIdOf(m, user.id);
        if (!map[other]) map[other] = { last: m, unread: 0 };
        if (m.recipient_id === user.id && !readSet.has(m.id)) map[other].unread++;
      }
      setThreads(map);

      if (profs) {
        const entries = await Promise.all(
          (profs as Profile[]).filter((p) => p.avatar_url).map(async (p) => {
            if (p.avatar_url!.startsWith("http")) return [p.id, p.avatar_url!] as const;
            const { data } = await supabase.storage.from("family-media").createSignedUrl(p.avatar_url!, 60 * 60 * 6);
            return [p.id, data?.signedUrl ?? ""] as const;
          })
        );
        setSignedAvatars(Object.fromEntries(entries));
      }
    })();
  }, [user.id]);

  useEffect(() => {
    let alive = true;

    async function loadGroups() {
      const { data: memberships, error: membershipError } = await groupSupabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", user.id);
      if (membershipError) {
        toast.error(membershipError.message);
        return;
      }

      const groupIds = (memberships ?? []).map((membership) => membership.group_id as string);
      if (!groupIds.length) {
        if (alive) setGroups([]);
        return;
      }

      const [{ data: groupRows, error: groupsError }, { data: memberRows, error: membersError }] = await Promise.all([
        groupSupabase.from("groups").select("id, name").in("id", groupIds),
        groupSupabase.from("group_members").select("group_id").in("group_id", groupIds),
      ]);

      if (groupsError) {
        toast.error(groupsError.message);
        return;
      }
      if (membersError) {
        toast.error(membersError.message);
        return;
      }

      const counts = new Map<string, number>();
      for (const member of memberRows ?? []) {
        const id = member.group_id as string;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      if (alive) {
        setGroups((groupRows ?? []).map((group) => ({
          id: group.id as string,
          name: group.name as string,
          member_count: counts.get(group.id as string) ?? 0,
        })));
      }
    }

    void loadGroups();

    const ch = groupSupabase
      .channel(`inbox-groups-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "group_members" }, () => {
        void loadGroups();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, () => {
        void loadGroups();
      })
      .subscribe();

    return () => {
      alive = false;
      void groupSupabase.removeChannel(ch);
    };
  }, [user.id]);

  useEffect(() => {
    const ch = supabase
      .channel("inbox-list")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, (p) => {
        const m = p.new as DM;
        if (m.sender_id !== user.id && m.recipient_id !== user.id) return;
        const other = otherIdOf(m, user.id);
        setThreads((prev) => ({
          ...prev,
          [other]: { last: m, unread: (prev[other]?.unread ?? 0) + (m.recipient_id === user.id ? 1 : 0) },
        }));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user.id]);

  const sorted = [...profiles].sort((a, b) => {
    const ta = threads[a.id]?.last?.created_at ?? "";
    const tb = threads[b.id]?.last?.created_at ?? "";
    return tb.localeCompare(ta);
  });

  function toggleMember(memberId: string) {
    setSelectedMembers((selected) => selected.includes(memberId)
      ? selected.filter((id) => id !== memberId)
      : [...selected, memberId]);
  }

  async function createGroup() {
    const name = groupName.trim();
    if (!name || creatingGroup) return;

    setCreatingGroup(true);
    let operation = "groups INSERT";
    try {
      const { data: group, error: groupError } = await groupSupabase
        .from("groups")
        .insert({ name, created_by: user.id })
        .select("id")
        .single();
      if (groupError) throw groupError;

      if (selectedMembers.length) {
        operation = "group_members INSERT";
        const { error: membersError } = await groupSupabase.from("group_members").insert(
          selectedMembers.map((userId) => ({ group_id: group.id, user_id: userId, is_admin: false })),
        );
        if (membersError) throw membersError;
      }

      operation = "navigation";
      window.location.assign(`/inbox/group/${group.id}`);
    } catch (error) {
      console.error("Group creation failed", { operation, error });
      toast.error(error instanceof Error ? error.message : "Couldn't create the group.");
    } finally {
      setCreatingGroup(false);
    }
  }

  return (
    <div className="flex-1 px-4 py-5">
      <div className="mb-4">
        <h1 className="font-display text-3xl text-plum">Inbox</h1>
        <p className="text-sm text-muted-foreground italic">Quiet corners for whispered notes.</p>
      </div>

      <button
        type="button"
        onClick={() => setShowNewGroup(true)}
        className="mb-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-semibold text-primary-foreground shadow transition hover:scale-[1.02]"
      >
        <Plus className="h-4 w-4" /> New Group
      </button>

      {profiles.length === 0 ? (
        <div className="text-center py-20 animate-fade-scale">
          <div className="mx-auto w-32 h-32 blob bg-gradient-to-br from-lavender to-coral/50 blur-sm mb-4" />
          <p className="font-display text-xl text-plum">Just the two of you — say hi 👋</p>
          <p className="mt-2 text-sm text-muted-foreground">Family members will appear here as they join.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {sorted.map((p) => {
            const t = threads[p.id];
            const has = !!t;
            return (
              <Link key={p.id} to="/inbox/$otherId" params={{ otherId: p.id }}
                className="flex items-center gap-3 glass-card rounded-3xl p-3.5 hover:scale-[1.01] transition animate-fade-scale">
                <div className="relative shrink-0">
                  <div className="w-14 h-14 blob overflow-hidden bg-gradient-to-br from-lavender to-coral grid place-items-center text-plum-deep font-semibold text-lg">
                    {signedAvatars[p.id] ? <img src={signedAvatars[p.id]} className="w-full h-full object-cover" /> : p.display_name[0]?.toUpperCase()}
                  </div>
                  {p.status_emoji && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-white dark:bg-plum-deep grid place-items-center text-sm shadow">
                      {p.status_emoji}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display text-lg text-plum truncate">{p.display_name}</p>
                    {has && (
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        {formatDistanceToNow(new Date(t.last.created_at), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                  <p className={`text-sm truncate ${has ? "text-plum/80" : "text-muted-foreground italic"}`}>
                    {has ? (t.last.sender_id === user.id ? "You: " : "") + preview(t.last) : "Say hi 👋"}
                  </p>
                </div>
                {t?.unread ? (
                  <span className="shrink-0 min-w-[22px] h-[22px] px-2 rounded-full bg-primary text-primary-foreground text-[11px] font-bold grid place-items-center shadow">
                    {t.unread}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      )}

      <section className="mt-8 space-y-2.5">
        <h2 className="font-display text-xl text-plum">Groups</h2>
        {groups.length === 0 ? (
          <p className="rounded-3xl border border-white/60 bg-white/40 px-4 py-5 text-center text-sm text-muted-foreground dark:border-white/10 dark:bg-white/5">
            You haven't joined any groups yet.
          </p>
        ) : (
          groups.map((group) => (
            <a
              key={group.id}
              href={`/inbox/group/${group.id}`}
              className="flex items-center gap-3 rounded-3xl border border-white/60 bg-white/50 p-3.5 transition hover:scale-[1.01] dark:border-white/10 dark:bg-white/5"
            >
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground">
                <Users className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-lg text-plum">{group.name}</p>
                <p className="text-xs text-muted-foreground">{group.member_count} {group.member_count === 1 ? "member" : "members"}</p>
              </div>
            </a>
          ))
        )}
      </section>

      <p className="mt-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
        <Mail className="w-3 h-3" /> Only the two of you can read these.
      </p>

      {showNewGroup && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-plum-deep/60 p-3 backdrop-blur-sm sm:items-center"
          onClick={() => setShowNewGroup(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-group-title"
            className="glass-card max-h-[85dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-3xl p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="new-group-title" className="font-display text-2xl text-plum">Create a group</h2>
              <button
                type="button"
                onClick={() => setShowNewGroup(false)}
                className="rounded-full p-2 text-plum/70 hover:bg-white/50"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <input
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              placeholder="Group name"
              maxLength={80}
              className="w-full rounded-2xl border border-border bg-input/80 px-4 py-3 text-plum outline-none focus:border-primary"
            />

            <div>
              <h3 className="mb-2 text-sm font-semibold text-plum">Add members</h3>
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {!profilesLoaded ? (
                  <p className="px-3 py-4 text-sm text-muted-foreground">Loading family members…</p>
                ) : profiles.filter((profile) => profile.id !== user.id).length === 0 ? (
                  <p className="px-3 py-4 text-sm text-muted-foreground">No other family members yet.</p>
                ) : profiles.filter((profile) => profile.id !== user.id).map((profile) => {
                  const selected = selectedMembers.includes(profile.id);
                  return (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => toggleMember(profile.id)}
                      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition hover:bg-white/50 dark:hover:bg-white/10"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-lavender to-coral text-sm font-semibold text-plum-deep">
                        {signedAvatars[profile.id]
                          ? <img src={signedAvatars[profile.id]} alt="" className="h-full w-full object-cover" />
                          : profile.display_name[0]?.toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-plum">{profile.display_name}</span>
                      <span className={`grid h-6 w-6 place-items-center rounded-full border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                        {selected && <Check className="h-4 w-4" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowNewGroup(false)}
                className="flex-1 rounded-full bg-secondary py-3 font-semibold text-secondary-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void createGroup()}
                disabled={!groupName.trim() || creatingGroup}
                className="flex-1 rounded-full bg-primary py-3 font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creatingGroup ? "Creating…" : "Create group"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
