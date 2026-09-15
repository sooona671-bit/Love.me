import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, ShoppingBasket, ListChecks, ShoppingBag, X, Pencil, Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/lists")({
  component: ListsPage,
});

type Category = "todo" | "grocery" | "shopping";

type Item = {
  id: string;
  title: string;
  category: Category;
  done: boolean;
  done_by: string | null;
  created_by: string;
  created_at: string;
};

type Profile = { id: string; display_name: string | null; avatar_url: string | null };

const TABS: { key: Category; label: string; Icon: typeof ListChecks; placeholder: string; emptyTitle: string }[] = [
  { key: "todo", label: "To-do", Icon: ListChecks, placeholder: "e.g. Water the plants…", emptyTitle: "Nothing to do — enjoy the pause" },
  { key: "grocery", label: "Grocery", Icon: ShoppingBasket, placeholder: "e.g. Milk, warm bread…", emptyTitle: "Fridge feels full" },
  { key: "shopping", label: "Shopping", Icon: ShoppingBag, placeholder: "e.g. New cushions…", emptyTitle: "Nothing on the wishlist" },
];

// Warm palette for the little author chips
const CHIP_TONES = [
  "bg-primary/15 text-primary",
  "bg-lavender/40 text-plum",
  "bg-muted-gold/30 text-plum",
  "bg-secondary/40 text-plum",
];

function toneFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CHIP_TONES[h % CHIP_TONES.length];
}

function initialsFor(p: Profile | undefined) {
  const n = p?.display_name?.trim();
  if (!n) return "·";
  const parts = n.split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function ListsPage() {
  const { user } = Route.useRouteContext();
  const [items, setItems] = useState<Item[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [tab, setTab] = useState<Category>("todo");
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      const [{ data: rows }, { data: profs }] = await Promise.all([
        supabase.from("checklist_items").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, display_name, avatar_url"),
      ]);
      if (!alive) return;
      if (rows) setItems(rows as Item[]);
      if (profs) setProfiles(Object.fromEntries((profs as Profile[]).map((p) => [p.id, p])));
    }
    void load();
    const ch = supabase.channel("lists-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "checklist_items" }, (p) => {
        if (p.eventType === "INSERT") setItems((s) => [p.new as Item, ...s.filter((x) => x.id !== (p.new as Item).id)]);
        if (p.eventType === "UPDATE") setItems((s) => s.map((x) => (x.id === (p.new as Item).id ? (p.new as Item) : x)));
        if (p.eventType === "DELETE") setItems((s) => s.filter((x) => x.id !== (p.old as Item).id));
      })
      .subscribe();
    // Safety net so the list still keeps up if the live connection drops.
    const timer = window.setInterval(() => { void load(); }, 5000);
    const onFocus = () => { void load(); };
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      supabase.removeChannel(ch);
    };
  }, []);


  const currentTab = useMemo(() => TABS.find((t) => t.key === tab)!, [tab]);

  async function add(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text.trim()) return;
    const title = text.trim();
    setText("");
    const { error } = await supabase.from("checklist_items")
      .insert({ title, category: tab, created_by: user.id });
    if (error) toast.error(error.message);
  }

  async function toggle(it: Item) {
    const { error } = await supabase.from("checklist_items").update({
      done: !it.done, done_by: !it.done ? user.id : null, done_at: !it.done ? new Date().toISOString() : null,
    }).eq("id", it.id);
    if (error) toast.error(error.message);
  }

  async function remove(id: string) {
    const { error } = await supabase.from("checklist_items").delete().eq("id", id);
    if (error) toast.error(error.message);
  }

  function beginEdit(it: Item) {
    setEditingId(it.id);
    setEditText(it.title);
  }

  async function saveEdit(id: string) {
    const title = editText.trim();
    setEditingId(null);
    if (!title) return;
    const { error } = await supabase.from("checklist_items").update({ title }).eq("id", id);
    if (error) toast.error(error.message);
  }

  const visible = items.filter((i) => i.category === tab);
  const pending = visible.filter((i) => !i.done);
  const done = visible.filter((i) => i.done);

  return (
    <div className="flex-1 px-4 py-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl text-plum">Little list</h1>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map(({ key, label, Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm flex items-center gap-1.5 transition ${
                active ? "bg-primary text-primary-foreground shadow-sm" : "glass-card text-plum"
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          );
        })}
      </div>

      <form onSubmit={add} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={currentTab.placeholder}
          className="flex-1 rounded-full bg-input px-4 py-3 border border-border focus:border-primary outline-none"
        />
        <button type="submit" aria-label="Add item" className="p-3 rounded-full bg-primary text-primary-foreground">
          <Plus className="w-5 h-5" />
        </button>
      </form>

      {visible.length === 0 && (
        <div className="text-center py-16 animate-fade-scale">
          <div className="mx-auto w-28 h-28 blob bg-gradient-to-br from-lavender to-muted-gold/60 blur-sm mb-3" />
          <p className="font-display text-xl text-plum">{currentTab.emptyTitle}</p>
          <p className="text-sm text-muted-foreground mt-1">Add something above whenever it comes to mind.</p>
        </div>
      )}

      {pending.length > 0 && (
        <ul className="space-y-2">
          {pending.map((it) => (
            <ItemRow
              key={it.id}
              it={it}
              author={profiles[it.created_by]}
              isEditing={editingId === it.id}
              editText={editText}
              setEditText={setEditText}
              onToggle={() => toggle(it)}
              onRemove={() => remove(it.id)}
              onBeginEdit={() => beginEdit(it)}
              onSaveEdit={() => saveEdit(it.id)}
              onCancelEdit={() => setEditingId(null)}
            />
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <>
          <p className="text-xs uppercase tracking-widest text-plum/60 font-semibold pt-4">Done</p>
          <ul className="space-y-2 opacity-70">
            {done.map((it) => (
              <ItemRow
                key={it.id}
                it={it}
                author={profiles[it.created_by]}
                isEditing={false}
                editText=""
                setEditText={() => {}}
                onToggle={() => toggle(it)}
                onRemove={() => remove(it.id)}
                onBeginEdit={() => beginEdit(it)}
                onSaveEdit={() => {}}
                onCancelEdit={() => {}}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function ItemRow({
  it, author, isEditing, editText, setEditText,
  onToggle, onRemove, onBeginEdit, onSaveEdit, onCancelEdit,
}: {
  it: Item;
  author: Profile | undefined;
  isEditing: boolean;
  editText: string;
  setEditText: (v: string) => void;
  onToggle: () => void;
  onRemove: () => void;
  onBeginEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
}) {
  const firstName = author?.display_name?.split(/\s+/)[0] ?? "Someone";
  const tone = toneFor(it.created_by);

  return (
    <li className="glass-card rounded-2xl px-3 py-2.5 flex items-center gap-3 animate-fade-scale">
      <button
        onClick={onToggle}
        aria-label={it.done ? "Mark not done" : "Mark done"}
        className={`w-6 h-6 rounded-full border-2 grid place-items-center shrink-0 transition ${
          it.done ? "bg-primary border-primary text-primary-foreground" : "border-plum/40"
        }`}
      >
        {it.done && <span className="text-xs">✓</span>}
      </button>

      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            autoFocus
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSaveEdit();
              if (e.key === "Escape") onCancelEdit();
            }}
            className="w-full bg-transparent border-b border-primary/60 outline-none text-[15px] text-plum py-0.5"
          />
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[15px] ${it.done ? "line-through text-plum/50" : "text-plum"}`}>{it.title}</span>
            <span
              title={`Added by ${firstName}`}
              className={`inline-flex items-center gap-1 font-display text-[11px] px-2 py-0.5 rounded-full ${tone}`}
            >
              <span className="w-4 h-4 rounded-full bg-background/60 grid place-items-center text-[9px] font-semibold">
                {initialsFor(author)}
              </span>
              {firstName}
            </span>
          </div>
        )}
      </div>

      {isEditing ? (
        <button onClick={onSaveEdit} aria-label="Save" className="text-primary p-1">
          <Check className="w-4 h-4" />
        </button>
      ) : (
        !it.done && (
          <button onClick={onBeginEdit} aria-label="Edit" className="text-plum/40 hover:text-plum p-1">
            <Pencil className="w-4 h-4" />
          </button>
        )
      )}
      <button onClick={onRemove} aria-label="Delete" className="text-plum/40 hover:text-destructive p-1">
        <X className="w-4 h-4" />
      </button>
    </li>
  );
}
