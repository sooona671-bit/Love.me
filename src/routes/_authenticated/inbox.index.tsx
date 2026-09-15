import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { Mail } from "lucide-react";

export const Route = createFileRoute("/_authenticated/inbox/")({
  component: InboxListPage,
});


type Profile = { id: string; display_name: string; avatar_url: string | null; status_emoji: string | null };
type DM = { id: string; sender_id: string; recipient_id: string; content: string | null; media_type: string | null; created_at: string };

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

  useEffect(() => {
    void (async () => {
      const [{ data: profs }, { data: msgs }, { data: reads }] = await Promise.all([
        supabase.from("profiles").select("id, display_name, avatar_url, status_emoji").neq("id", user.id),
        supabase.from("direct_messages").select("*").or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`).order("created_at", { ascending: false }).limit(500),
        supabase.from("direct_message_reads").select("message_id").eq("user_id", user.id),
      ]);
      if (profs) setProfiles(profs as Profile[]);
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

  return (
    <div className="flex-1 px-4 py-5">
      <div className="mb-4">
        <h1 className="font-display text-3xl text-plum">Inbox</h1>
        <p className="text-sm text-muted-foreground italic">Quiet corners for whispered notes.</p>
      </div>

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

      <p className="mt-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
        <Mail className="w-3 h-3" /> Only the two of you can read these.
      </p>
    </div>
  );
}
