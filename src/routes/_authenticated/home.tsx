import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { differenceInCalendarDays, format, parseISO, formatDistanceToNow } from "date-fns";
import { Cake, Heart, Sparkles, Stethoscope, MessageCircle, Images, CalendarDays, ListChecks, MapPin, Dices } from "lucide-react";

export const Route = createFileRoute("/_authenticated/home")({
  component: HomePage,
});

type Profile = { id: string; display_name: string; avatar_url: string | null; status_emoji: string | null; status_text: string | null };
type Ev = { id: string; title: string; event_date: string; event_type: string };
type Loc = { user_id: string; enabled: boolean; place_label: string | null; updated_at: string };

function greet() {
  const h = new Date().getHours();
  if (h < 5) return "Still up?";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
}

function HomePage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [events, setEvents] = useState<Ev[]>([]);
  const [locs, setLocs] = useState<Loc[]>([]);
  const [me, setMe] = useState<Profile | null>(null);
  const { user } = Route.useRouteContext();

  useEffect(() => {
    void (async () => {
      const [{ data: ps }, { data: ev }, { data: ls }] = await Promise.all([
        supabase.from("profiles").select("id, display_name, avatar_url, status_emoji, status_text"),
        supabase.from("events").select("id, title, event_date, event_type").order("event_date").limit(20),
        supabase.from("location_shares").select("*").eq("enabled", true),
      ]);
      if (ps) {
        setProfiles(ps as Profile[]);
        setMe((ps as Profile[]).find((p) => p.id === user.id) ?? null);
      }
      if (ev) setEvents(ev as Ev[]);
      if (ls) setLocs(ls as Loc[]);
    })();
  }, [user.id]);

  const nextBirthday = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return events
      .filter((e) => e.event_type === "birthday" || e.event_type === "anniversary")
      .map((e) => ({ e, d: parseISO(e.event_date) }))
      .filter(({ d }) => d >= today)
      .sort((a, b) => a.d.getTime() - b.d.getTime())[0];
  }, [events]);

  const nextGeneral = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return events
      .map((e) => ({ e, d: parseISO(e.event_date) }))
      .filter(({ d }) => d >= today)
      .sort((a, b) => a.d.getTime() - b.d.getTime())[0];
  }, [events]);

  const tiles = [
    { to: "/chat" as const, label: "Chat", icon: MessageCircle, hint: "Say hi" },
    { to: "/gallery" as const, label: "Gallery", icon: Images, hint: "Little memories" },
    { to: "/calendar" as const, label: "Calendar", icon: CalendarDays, hint: "What's next" },
    { to: "/lists" as const, label: "Lists", icon: ListChecks, hint: "Together" },
    { to: "/games" as const, label: "Game Zone", icon: Dices, hint: "Roll the dice 🎲" },
  ];

  return (
    <div className="flex-1 px-4 py-5 space-y-5">
      <div>
        <p className="text-sm text-plum/70 font-display italic">{greet()}{me ? `, ${me.display_name}` : ""} —</p>
        <h1 className="font-display text-3xl text-plum leading-tight">the family's warm little corner</h1>
      </div>

      {nextBirthday && <CountdownCard e={nextBirthday.e} days={differenceInCalendarDays(nextBirthday.d, new Date())} highlight />}
      {(!nextBirthday && nextGeneral) && <CountdownCard e={nextGeneral.e} days={differenceInCalendarDays(nextGeneral.d, new Date())} />}

      <section>
        <h2 className="font-display text-lg text-plum mb-2">Who's around</h2>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
          {profiles.map((p) => (
            <div key={p.id} className="shrink-0 glass-card rounded-3xl p-3 w-40 flex flex-col items-center text-center animate-fade-scale">
              <div className="relative">
                <div className="w-14 h-14 blob overflow-hidden bg-gradient-to-br from-lavender to-coral grid place-items-center text-plum-deep font-display text-lg">
                  {p.avatar_url ? <img src={p.avatar_url} className="w-full h-full object-cover" /> : (p.display_name[0] ?? "?").toUpperCase()}
                </div>
                {p.status_emoji && (
                  <span className="absolute -bottom-1 -right-1 text-lg bg-white dark:bg-plum-deep rounded-full w-7 h-7 grid place-items-center shadow border border-white dark:border-white/10">
                    {p.status_emoji}
                  </span>
                )}
              </div>
              <p className="font-semibold text-plum mt-2 text-sm truncate w-full">{p.display_name}</p>
              <p className="text-[11px] text-muted-foreground italic truncate w-full">{p.status_text || "…"}</p>
              {(() => {
                const l = locs.find((x) => x.user_id === p.id);
                if (!l) return null;
                return (
                  <p className="mt-1 text-[10px] text-dusk flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {l.place_label || "sharing location"}
                    <span className="opacity-60">· {formatDistanceToNow(new Date(l.updated_at), { addSuffix: true })}</span>
                  </p>
                );
              })()}
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        {tiles.map(({ to, label, icon: Icon, hint }) => (
          <Link key={to} to={to}
            className="glass-card rounded-3xl p-4 hover:scale-[1.02] transition flex flex-col gap-2 animate-fade-scale">
            <div className="w-11 h-11 blob bg-gradient-to-br from-lavender to-coral/50 grid place-items-center text-plum-deep">
              <Icon className="w-5 h-5" />
            </div>
            <p className="font-display text-lg text-plum">{label}</p>
            <p className="text-xs text-muted-foreground italic">{hint}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}

function CountdownCard({ e, days, highlight }: { e: Ev; days: number; highlight?: boolean }) {
  const Icon = e.event_type === "birthday" ? Cake : e.event_type === "anniversary" ? Heart : e.event_type === "appointment" ? Stethoscope : Sparkles;
  const label = days === 0 ? "today 🌸" : days === 1 ? "tomorrow" : `${days} days`;
  return (
    <Link to="/calendar" className="block">
      <div className={`relative overflow-hidden rounded-[36%_64%_54%_46%/48%_52%_48%_52%] p-6 shadow-lg animate-fade-scale ${
        highlight ? "bg-gradient-to-br from-coral to-dusk text-white" : "glass-card"
      }`}>
        <div className="absolute -top-8 -right-8 w-40 h-40 blob bg-white/20 blur-2xl" />
        <div className="relative flex items-center gap-4">
          <div className={`w-14 h-14 blob grid place-items-center shrink-0 ${highlight ? "bg-white/25" : "bg-gradient-to-br from-lavender to-coral/50 text-plum-deep"}`}>
            <Icon className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className={`text-[10px] uppercase tracking-widest ${highlight ? "text-white/85" : "text-plum/60"} font-semibold`}>Coming up</p>
            <p className={`font-display text-2xl leading-tight truncate ${highlight ? "" : "text-plum"}`}>{e.title}</p>
            <p className={`text-sm ${highlight ? "text-white/90" : "text-dusk"}`}>{format(parseISO(e.event_date), "MMM d")} · {label}</p>
          </div>
        </div>
      </div>
    </Link>
  );
}
