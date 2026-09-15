import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { addMonths, format, isSameDay, isSameMonth, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, parseISO, differenceInCalendarDays } from "date-fns";
import { ChevronLeft, ChevronRight, Plus, X, Cake, Heart, Stethoscope, Sparkles, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/calendar")({
  component: CalendarPage,
});

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  event_time: string | null;
  event_type: "birthday" | "anniversary" | "appointment" | "other";
  remind_before_hours: number;
  created_by: string;
};

const TYPES: { key: EventRow["event_type"]; label: string; icon: typeof Cake }[] = [
  { key: "birthday", label: "Birthday", icon: Cake },
  { key: "anniversary", label: "Anniversary", icon: Heart },
  { key: "appointment", label: "Appointment", icon: Stethoscope },
  { key: "other", label: "Other", icon: Sparkles },
];

function typeIcon(t: EventRow["event_type"]) {
  return TYPES.find((x) => x.key === t)?.icon ?? Sparkles;
}

function CalendarPage() {
  const { user } = Route.useRouteContext();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [cursor, setCursor] = useState(new Date());
  const [selected, setSelected] = useState<Date | null>(null);
  const [composer, setComposer] = useState<EventRow | "new" | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("events").select("*").order("event_date");
      if (data) setEvents(data as EventRow[]);
    })();
    const ch = supabase.channel("events-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, async () => {
        const { data } = await supabase.from("events").select("*").order("event_date");
        if (data) setEvents(data as EventRow[]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const gridDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const upcoming = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return events
      .map((e) => ({ e, d: parseISO(e.event_date) }))
      .filter(({ d }) => d >= today)
      .sort((a, b) => a.d.getTime() - b.d.getTime())
      .slice(0, 6);
  }, [events]);

  const dayEvents = (d: Date) => events.filter((e) => isSameDay(parseISO(e.event_date), d));

  return (
    <div className="flex-1 px-4 py-4 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl text-plum">Together</h1>
        <button onClick={() => setComposer("new")}
          className="rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      <div className="glass-card rounded-3xl p-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setCursor(addMonths(cursor, -1))} className="p-2 rounded-full hover:bg-white/60 dark:hover:bg-white/10">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="font-display text-xl text-plum">{format(cursor, "MMMM yyyy")}</h2>
          <button onClick={() => setCursor(addMonths(cursor, 1))} className="p-2 rounded-full hover:bg-white/60 dark:hover:bg-white/10">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-plum/60 uppercase tracking-wider mb-1">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {gridDays.map((d) => {
            const inMonth = isSameMonth(d, cursor);
            const today = isSameDay(d, new Date());
            const evs = dayEvents(d);
            const active = selected && isSameDay(d, selected);
            return (
              <button key={d.toISOString()} onClick={() => setSelected(d)}
                className={`aspect-square rounded-2xl text-sm flex flex-col items-center justify-center relative transition ${
                  active ? "bg-primary text-primary-foreground" :
                  today ? "bg-secondary text-secondary-foreground" :
                  inMonth ? "text-plum hover:bg-white/60 dark:hover:bg-white/10" : "text-plum/30"
                }`}
              >
                <span className="font-semibold">{format(d, "d")}</span>
                {evs.length > 0 && (
                  <span className="absolute bottom-1.5 flex gap-0.5">
                    {evs.slice(0, 3).map((e) => (
                      <span key={e.id} className={`w-1 h-1 rounded-full ${active ? "bg-white" : "bg-coral"}`} />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="glass-card rounded-3xl p-4 animate-fade-scale">
          <h3 className="font-display text-lg text-plum">{format(selected, "EEEE, MMM d")}</h3>
          <div className="mt-2 space-y-2">
            {dayEvents(selected).length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Nothing planned — a soft, quiet day.</p>
            ) : dayEvents(selected).map((e) => <EventRowUI key={e.id} e={e} userId={user.id} onEdit={() => setComposer(e)} />)}
          </div>
        </div>
      )}

      <section>
        <h2 className="font-display text-xl text-plum mb-2">Coming up</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">The calendar is quiet — add a birthday or a plan to fill it up.</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map(({ e, d }) => (
              <EventRowUI key={e.id} e={e} userId={user.id} onEdit={() => setComposer(e)} showCountdown countdownFrom={d} />
            ))}
          </div>
        )}
      </section>

      {composer && (
        <EventComposer
          initial={composer === "new" ? null : composer}
          userId={user.id}
          onClose={() => setComposer(null)}
          onSaved={async () => {
            const { data } = await supabase.from("events").select("*").order("event_date");
            if (data) setEvents(data as EventRow[]);
            setComposer(null);
          }}
        />
      )}
    </div>
  );
}

function EventRowUI({ e, userId, onEdit, showCountdown, countdownFrom }: {
  e: EventRow; userId: string; onEdit: () => void;
  showCountdown?: boolean; countdownFrom?: Date;
}) {
  const Icon = typeIcon(e.event_type);
  const days = countdownFrom ? differenceInCalendarDays(countdownFrom, new Date()) : 0;
  return (
    <button onClick={onEdit} className="w-full text-left flex items-center gap-3 rounded-2xl bg-white/60 dark:bg-white/5 border border-white/70 dark:border-white/10 p-3 hover:scale-[1.005] transition">
      <div className="w-10 h-10 blob bg-gradient-to-br from-coral/40 to-lavender/60 grid place-items-center text-plum-deep shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-plum truncate">{e.title}</p>
        <p className="text-xs text-muted-foreground">
          {format(parseISO(e.event_date), "MMM d, yyyy")}{e.event_time && ` · ${e.event_time.slice(0,5)}`}
          {e.created_by !== userId && " · shared"}
        </p>
      </div>
      {showCountdown && (
        <span className="text-xs font-semibold text-dusk px-2 py-1 rounded-full bg-white/80 dark:bg-white/10">
          {days === 0 ? "today" : days === 1 ? "tomorrow" : `${days}d`}
        </span>
      )}
    </button>
  );
}

function EventComposer({ initial, userId, onClose, onSaved }: {
  initial: EventRow | null; userId: string; onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [date, setDate] = useState(initial?.event_date ?? format(new Date(), "yyyy-MM-dd"));
  const [time, setTime] = useState(initial?.event_time?.slice(0, 5) ?? "");
  const [type, setType] = useState<EventRow["event_type"]>(initial?.event_type ?? "other");
  const [remind, setRemind] = useState(initial?.remind_before_hours ?? 24);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!title.trim()) return toast.error("Give it a name first.");
    setBusy(true);
    const payload = {
      title: title.trim(), description: description.trim() || null,
      event_date: date, event_time: time || null, event_type: type,
      remind_before_hours: remind,
    };
    const { error } = initial
      ? await supabase.from("events").update(payload).eq("id", initial.id)
      : await supabase.from("events").insert({ ...payload, created_by: userId });
    setBusy(false);
    if (error) toast.error(error.message);
    else onSaved();
  }

  async function remove() {
    if (!initial) return;
    if (!confirm(`Remove "${initial.title}"?`)) return;
    await supabase.from("events").delete().eq("id", initial.id);
    onSaved();
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-plum-deep/70 backdrop-blur-md flex items-end sm:items-center justify-center p-4 animate-fade-scale">
      <div onClick={(e) => e.stopPropagation()} className="glass-card rounded-3xl p-5 max-w-md w-full space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl text-plum">{initial ? "Edit" : "New moment"}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-plum/60" /></button>
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What's happening?"
          className="w-full rounded-2xl bg-input px-4 py-3 border border-border focus:border-primary outline-none" />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A note (optional)"
          rows={2} className="w-full rounded-2xl bg-input px-4 py-2.5 border border-border focus:border-primary outline-none text-sm" />
        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="rounded-2xl bg-input px-4 py-2.5 border border-border focus:border-primary outline-none" />
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
            className="rounded-2xl bg-input px-4 py-2.5 border border-border focus:border-primary outline-none" />
        </div>
        <div className="flex flex-wrap gap-2">
          {TYPES.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setType(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition ${
                type === key ? "bg-primary text-primary-foreground border-primary" : "bg-white/60 dark:bg-white/5 border-border text-plum"
              }`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
        <div>
          <label className="text-xs font-semibold text-plum/70 uppercase tracking-wide">Remind us</label>
          <select value={remind} onChange={(e) => setRemind(Number(e.target.value))}
            className="mt-1 w-full rounded-2xl bg-input px-4 py-2.5 border border-border focus:border-primary outline-none">
            <option value={0}>No reminder</option>
            <option value={1}>1 hour before</option>
            <option value={24}>1 day before</option>
            <option value={168}>1 week before</option>
          </select>
        </div>
        <div className="flex gap-2 pt-2">
          {initial && initial.created_by === userId && (
            <button onClick={remove} className="rounded-full bg-destructive/10 text-destructive p-3">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button onClick={onClose} className="flex-1 rounded-full bg-secondary text-secondary-foreground py-2.5 font-semibold">Cancel</button>
          <button onClick={save} disabled={busy} className="flex-1 rounded-full bg-primary text-primary-foreground py-2.5 font-semibold disabled:opacity-60">
            {busy ? "…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
