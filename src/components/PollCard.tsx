import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Poll = { id: string; question: string; closes_at: string | null };
type Option = { id: string; poll_id: string; label: string; position: number };
type Vote = { poll_id: string; option_id: string; user_id: string };

export function PollCard({ pollId, userId }: { pollId: string; userId: string }) {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);

  useEffect(() => {
    void (async () => {
      const [{ data: p }, { data: o }, { data: v }] = await Promise.all([
        supabase.from("polls").select("id, question, closes_at").eq("id", pollId).single(),
        supabase.from("poll_options").select("*").eq("poll_id", pollId).order("position"),
        supabase.from("poll_votes").select("*").eq("poll_id", pollId),
      ]);
      if (p) setPoll(p as Poll);
      if (o) setOptions(o as Option[]);
      if (v) setVotes(v as Vote[]);
    })();

    const ch = supabase
      .channel(`poll-${pollId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "poll_votes", filter: `poll_id=eq.${pollId}` }, () => {
        void supabase.from("poll_votes").select("*").eq("poll_id", pollId).then(({ data }) => {
          if (data) setVotes(data as Vote[]);
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [pollId]);

  const myVote = votes.find((v) => v.user_id === userId);
  const total = votes.length;

  async function vote(optionId: string) {
    if (myVote) {
      await supabase.from("poll_votes").update({ option_id: optionId }).eq("poll_id", pollId).eq("user_id", userId);
    } else {
      await supabase.from("poll_votes").insert({ poll_id: pollId, option_id: optionId, user_id: userId });
    }
  }

  if (!poll) return <div className="w-64 h-24 rounded-2xl bg-muted animate-pulse" />;

  return (
    <div className="min-w-[260px] max-w-sm rounded-3xl p-4 bg-white/70 dark:bg-white/10 backdrop-blur border border-white/60 dark:border-white/10 shadow-md">
      <p className="text-[10px] uppercase tracking-widest text-dusk font-semibold">Family poll</p>
      <p className="font-display text-lg text-plum leading-tight mt-1">{poll.question}</p>
      <div className="mt-3 space-y-2">
        {options.map((o) => {
          const count = votes.filter((v) => v.option_id === o.id).length;
          const pct = total ? Math.round((count / total) * 100) : 0;
          const mine = myVote?.option_id === o.id;
          return (
            <button
              key={o.id}
              onClick={() => vote(o.id)}
              className={`relative w-full text-left rounded-2xl overflow-hidden border transition ${mine ? "border-primary" : "border-border"}`}
            >
              <div
                className="absolute inset-y-0 left-0 transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  background: mine
                    ? "linear-gradient(90deg, oklch(0.82 0.14 25 / 0.55), oklch(0.78 0.15 15 / 0.35))"
                    : "linear-gradient(90deg, oklch(0.88 0.05 300 / 0.65), oklch(0.84 0.07 320 / 0.4))",
                }}
              />
              <div className="relative flex items-center justify-between px-3 py-2 text-sm">
                <span className={mine ? "font-semibold text-plum" : "text-plum/80"}>{o.label}</span>
                <span className="text-xs tabular-nums opacity-70">{pct}%</span>
              </div>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">{total} vote{total === 1 ? "" : "s"}</p>
    </div>
  );
}
