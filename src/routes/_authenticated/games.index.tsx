import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Dices, Grid3x3, X, Users, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { initialLudo } from "@/lib/ludo-engine";
import { initialTTT } from "@/lib/tictactoe-engine";
import { acceptGameInvite } from "@/lib/game-start";

export const Route = createFileRoute("/_authenticated/games/")({
  component: GamesPage,
});

const SEAT_COLORS = ["coral", "lavender", "dusty-rose", "muted-gold"];

type Profile = { id: string; display_name: string; avatar_url: string | null };
type Game = { id: string; kind: "ludo" | "tictactoe"; host_id: string; status: string; created_at: string };
type Invite = { id: string; game_id: string; inviter_id: string; created_at: string; expires_at: string };

function GamesPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [myGames, setMyGames] = useState<Game[]>([]);
  const [picker, setPicker] = useState<"ludo" | "tictactoe" | null>(null);

  useEffect(() => {
    void (async () => {
      const [{ data: ps }, { data: iv }, { data: gp }] = await Promise.all([
        supabase.from("profiles").select("id, display_name, avatar_url"),
        supabase.from("game_invites").select("*").eq("invitee_id", user.id).eq("status", "pending"),
        supabase.from("game_players").select("game_id").eq("user_id", user.id),
      ]);
      setProfiles((ps ?? []) as Profile[]);
      setInvites((iv ?? []) as Invite[]);
      const ids = (gp ?? []).map((r) => r.game_id);
      if (ids.length) {
        const { data: gs } = await supabase.from("games").select("*").in("id", ids).in("status", ["waiting", "active"]).order("created_at", { ascending: false });
        setMyGames((gs ?? []) as Game[]);
      } else {
        setMyGames([]);
      }
    })();

    const ch = supabase
      .channel("games-lobby")
      .on("postgres_changes", { event: "*", schema: "public", table: "game_invites", filter: `invitee_id=eq.${user.id}` },
        async () => {
          const { data } = await supabase.from("game_invites").select("*").eq("invitee_id", user.id).eq("status", "pending");
          setInvites((data ?? []) as Invite[]);
        })
      .on("postgres_changes", { event: "*", schema: "public", table: "games" },
        async () => {
          const { data: gp } = await supabase.from("game_players").select("game_id").eq("user_id", user.id);
          const ids = (gp ?? []).map((r) => r.game_id);
          if (!ids.length) { setMyGames([]); return; }
          const { data: gs } = await supabase.from("games").select("*").in("id", ids).in("status", ["waiting", "active"]).order("created_at", { ascending: false });
          setMyGames((gs ?? []) as Game[]);
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user.id]);

  const others = profiles.filter((p) => p.id !== user.id);
  const nameOf = (id: string) => profiles.find((p) => p.id === id)?.display_name ?? "someone";

  async function acceptInvite(inv: Invite) {
    try {
      const accepted = await acceptGameInvite(inv.id);
      await navigate({ to: "/games/$gameId", params: { gameId: accepted.game_id }, replace: true });
    } catch {
      toast.error("Couldn't open the game", { description: "Please ask for a fresh invite." });
    }
  }

  async function declineInvite(inv: Invite) {
    await supabase.from("game_invites").update({ status: "declined" }).eq("id", inv.id);
  }

  return (
    <div className="flex-1 px-4 py-5 space-y-5">
      <div>
        <p className="text-sm text-plum/70 font-display italic">Game Zone</p>
        <h1 className="font-display text-3xl text-plum leading-tight">a little playtime, together 🎲</h1>
      </div>

      {invites.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-lg text-plum">Invites for you</h2>
          {invites.map((inv) => (
            <div key={inv.id} className="glass-card rounded-3xl p-4 flex items-center gap-3 animate-fade-scale">
              <div className="w-11 h-11 blob bg-gradient-to-br from-coral to-dusty-rose grid place-items-center text-white">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-plum font-semibold">
                  {nameOf(inv.inviter_id)} invited you to play 🎲
                </p>
                <p className="text-xs text-muted-foreground italic">tap to hop in</p>
              </div>
              <button onClick={() => declineInvite(inv)} className="text-xs text-plum/60 px-3 py-1.5 rounded-full">Not now</button>
              <button onClick={() => acceptInvite(inv)} className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-full font-semibold">Join</button>
            </div>
          ))}
        </section>
      )}

      {myGames.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-lg text-plum">In progress</h2>
          {myGames.map((g) => (
            <div key={g.id} className="glass-card rounded-3xl p-4 flex items-center gap-3">
              <Link to="/games/$gameId" params={{ gameId: g.id }} className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 blob bg-gradient-to-br from-lavender to-coral/60 grid place-items-center text-plum-deep shrink-0">
                  {g.kind === "ludo" ? <Dices className="w-5 h-5" /> : <Grid3x3 className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-plum font-semibold capitalize">{g.kind === "tictactoe" ? "Tic-tac-toe" : "Ludo"}</p>
                  <p className="text-xs italic text-muted-foreground">{g.status === "waiting" ? "waiting for players" : "your move maybe 👀"}</p>
                </div>
              </Link>
              <button
                onClick={async (e) => {
                  e.preventDefault();
                  if (!window.confirm("Remove this game from your list? This ends it for both players.")) return;
                  await supabase.from("games").update({ status: "cancelled" }).eq("id", g.id);
                }}
                className="p-2 rounded-full text-plum/40 hover:text-destructive hover:bg-destructive/10 transition shrink-0"
                title="Remove this game"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </section>
      )}

      <section className="grid grid-cols-2 gap-3">
        <button onClick={() => setPicker("ludo")}
          className="glass-card rounded-3xl p-5 text-left flex flex-col gap-2 hover:scale-[1.02] transition animate-fade-scale">
          <div className="w-12 h-12 blob bg-gradient-to-br from-coral to-muted-gold grid place-items-center text-white">
            <Dices className="w-6 h-6" />
          </div>
          <p className="font-display text-xl text-plum">Ludo</p>
          <p className="text-xs text-muted-foreground italic">2–4 players · roll, race, capture</p>
        </button>
        <button onClick={() => setPicker("tictactoe")}
          className="glass-card rounded-3xl p-5 text-left flex flex-col gap-2 hover:scale-[1.02] transition animate-fade-scale">
          <div className="w-12 h-12 blob bg-gradient-to-br from-lavender to-dusty-rose grid place-items-center text-plum-deep">
            <Grid3x3 className="w-6 h-6" />
          </div>
          <p className="font-display text-xl text-plum">Tic-tac-toe</p>
          <p className="text-xs text-muted-foreground italic">2 players · a quick round</p>
        </button>
      </section>

      {picker && (
        <InvitePicker
          kind={picker}
          others={others}
          onClose={() => setPicker(null)}
          onCreated={(id) => navigate({ to: "/games/$gameId", params: { gameId: id } })}
          userId={user.id}
        />
      )}
    </div>
  );
}

function InvitePicker({ kind, others, onClose, onCreated, userId }: {
  kind: "ludo" | "tictactoe";
  others: Profile[];
  onClose: () => void;
  onCreated: (id: string) => void;
  userId: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const max = kind === "tictactoe" ? 1 : 3;
  const min = 1;

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else if (next.size < max) next.add(id);
    setSelected(next);
  }

  async function start() {
    if (selected.size < min) return;
    setBusy(true);
    const state = kind === "ludo" ? initialLudo(1 + selected.size) : initialTTT();
    const { data: game, error } = await supabase.from("games").insert({
      kind, host_id: userId, status: "waiting", state: JSON.parse(JSON.stringify(state)),
    }).select().single();
    if (error || !game) { toast.error("Couldn't start the game"); setBusy(false); return; }
    await supabase.from("game_players").insert({ game_id: game.id, user_id: userId, seat: 0, color: SEAT_COLORS[0] });

    const targets = [...selected];
    const results = await Promise.all(targets.map(async (invitee_id) => {
      const { error: e } = await supabase.from("game_invites")
        .insert({ game_id: game.id, invitee_id, inviter_id: userId }).select().single();
      return { invitee_id, ok: !e };
    }));
    const failed = results.filter((r) => !r.ok);
    for (const f of failed) {
      const name = others.find((o) => o.id === f.invitee_id)?.display_name ?? "them";
      toast.error(`Couldn't reach ${name}, please try again`);
    }
    if (failed.length < targets.length) toast.success("Invite sent 💌");
    setBusy(false);
    onCreated(game.id);
  }


  return (
    <div className="fixed inset-0 z-40 bg-plum-deep/40 backdrop-blur-sm grid place-items-end sm:place-items-center p-4" onClick={onClose}>
      <div className="glass-card rounded-3xl p-5 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-plum/60 uppercase tracking-widest font-semibold">New {kind === "tictactoe" ? "tic-tac-toe" : "ludo"}</p>
            <h3 className="font-display text-xl text-plum">Invite family {kind === "tictactoe" ? "(pick 1)" : "(pick 1–3)"}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-plum/60"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto">
          {others.length === 0 && <p className="text-sm text-muted-foreground italic">No family members yet — invite them to Parajuli's first.</p>}
          {others.map((p) => {
            const on = selected.has(p.id);
            return (
              <button key={p.id} onClick={() => toggle(p.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-2xl transition ${on ? "bg-primary/15 ring-2 ring-primary" : "hover:bg-white/50"}`}>
                <div className="w-10 h-10 blob overflow-hidden bg-gradient-to-br from-lavender to-coral grid place-items-center text-plum-deep font-display">
                  {p.avatar_url ? <img src={p.avatar_url} className="w-full h-full object-cover" alt="" /> : p.display_name[0]?.toUpperCase()}
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-plum">{p.display_name}</p>
                </div>
                {on && <span className="text-primary font-bold text-lg">✓</span>}
              </button>
            );
          })}
        </div>

        <button disabled={busy || selected.size < min}
          onClick={start}
          className={`w-full py-3 rounded-full font-semibold flex items-center justify-center gap-2 transition ${
            busy || selected.size < min ? "bg-plum/15 text-plum/40 cursor-not-allowed" : "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
          }`}>
          <Users className="w-4 h-4" />
          {busy ? "sending…" : `Invite${selected.size > 1 ? " them" : ""}`}
        </button>


      </div>
    </div>
  );
}
