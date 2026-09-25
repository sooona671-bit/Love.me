import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Home, MessageCircle, Mail, Images, CalendarDays, ListChecks, LogOut, User } from "lucide-react";
import { applyDarkMode, readDarkModePref } from "@/lib/dark-mode";
import { toast } from "sonner";
import { acceptGameInvite } from "@/lib/game-start";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    async function resolveUser() {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const { data, error } = await supabase.auth.getUser();
          if (data?.user) return data.user;
          if (error && !/fetch|network/i.test(error.message)) return null;
        } catch {
          /* network blip — fall through to retry */
        }
        await new Promise((r) => setTimeout(r, 350));
      }
      try {
        const { data } = await supabase.auth.getSession();
        return data.session?.user ?? null;
      } catch {
        return null;
      }
    }

    const user = await resolveUser();
    if (!user) {
      throw redirect({ to: "/auth", search: { mode: "signin" }, replace: true, reloadDocument: true });
    }

    let prof: { onboarded: boolean } | null = null;
    try {
      const { data } = await supabase
        .from("profiles")
        .select("onboarded")
        .eq("id", user.id)
        .maybeSingle();
      prof = data;
    } catch {
      prof = null;
    }

    if (prof && !prof.onboarded && location.pathname !== "/setup") {
      throw redirect({ to: "/setup" });
    }
    return { user };
  },

  component: AuthedLayout,
});

type PendingInvite = {
  id: string;
  game_id: string;
  inviter_id: string;
  inviter_name: string;
  kind: "ludo" | "tictactoe";
};

const POPUP_SECONDS = 20;

function AuthedLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [dmUnread, setDmUnread] = useState(0);
  const [pendingInvite, setPendingInvite] = useState<PendingInvite | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [inviteLeft, setInviteLeft] = useState(POPUP_SECONDS);
  const [acceptingInvite, setAcceptingInvite] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // 100% Reliable Keyboard Detection for iOS & Android
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        setKeyboardOpen(true);
      }
    };

    const handleFocusOut = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        setKeyboardOpen(false);
      }
    };

    window.addEventListener("focusin", handleFocusIn);
    window.addEventListener("focusout", handleFocusOut);

    return () => {
      window.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  const dismissedRef = useRef<Set<string>>(new Set());

  useEffect(() => { applyDarkMode(readDarkModePref()); }, []);

  // DM unread count for the coral dot
  useEffect(() => {
    let userId: string | null = null;
    let cancelled = false;

    async function recompute() {
      if (!userId) return;
      const [{ data: incoming }, { data: reads }] = await Promise.all([
        supabase.from("direct_messages").select("id").eq("recipient_id", userId),
        supabase.from("direct_message_reads").select("message_id").eq("user_id", userId),
      ]);
      if (cancelled) return;
      const readSet = new Set((reads ?? []).map((r) => r.message_id));
      const unread = (incoming ?? []).filter((m) => !readSet.has(m.id)).length;
      setDmUnread(unread);
    }

    void (async () => {
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id ?? null;
      await recompute();
    })();

    const ch = supabase
      .channel("dm-badge")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, () => recompute())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_message_reads" }, () => recompute())
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "direct_messages" }, () => recompute())
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [pathname]);

  // Load current user + pending invites
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      if (cancelled) return;
      setUserId(uid);
      if (!uid) return;
      const { data: iv } = await supabase
        .from("game_invites")
        .select("id, game_id, inviter_id")
        .eq("invitee_id", uid)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled || !iv) return;
      const [{ data: prof }, { data: g }] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("id", iv.inviter_id).maybeSingle(),
        supabase.from("games").select("kind").eq("id", iv.game_id).maybeSingle(),
      ]);
      if (cancelled) return;
      setPendingInvite({
        id: iv.id, game_id: iv.game_id, inviter_id: iv.inviter_id,
        inviter_name: prof?.display_name ?? "someone",
        kind: (g?.kind ?? "ludo") as "ludo" | "tictactoe",
      });
    })();
    return () => { cancelled = true; };
  }, []);

  // Realtime invites
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel("game-invite-popup")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "game_invites" }, async (payload) => {
        const inv = payload.new as { id: string; invitee_id: string; inviter_id: string; game_id: string; status: string };
        if (inv.invitee_id !== userId || inv.status !== "pending") return;
        const [{ data: prof }, { data: g }] = await Promise.all([
          supabase.from("profiles").select("display_name").eq("id", inv.inviter_id).maybeSingle(),
          supabase.from("games").select("kind").eq("id", inv.game_id).maybeSingle(),
        ]);
        setPendingInvite({
          id: inv.id, game_id: inv.game_id, inviter_id: inv.inviter_id,
          inviter_name: prof?.display_name ?? "someone",
          kind: (g?.kind ?? "ludo") as "ludo" | "tictactoe",
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "game_invites" }, (payload) => {
        const inv = payload.new as { id: string; status: string };
        setPendingInvite((prev) => (prev && prev.id === inv.id && inv.status !== "pending" ? null : prev));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId]);

  // Poll invites
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const t = setInterval(async () => {
      const { data: iv } = await supabase
        .from("game_invites")
        .select("id, game_id, inviter_id, status")
        .eq("invitee_id", userId)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (!iv) { setPendingInvite((p) => (p && dismissedRef.current.has(p.id) ? p : p ? null : p)); return; }
      setPendingInvite((prev) => {
        if (prev?.id === iv.id || dismissedRef.current.has(iv.id)) return prev;
        void (async () => {
          const [{ data: prof }, { data: g }] = await Promise.all([
            supabase.from("profiles").select("display_name").eq("id", iv.inviter_id).maybeSingle(),
            supabase.from("games").select("kind").eq("id", iv.game_id).maybeSingle(),
          ]);
          if (cancelled) return;
          setPendingInvite({
            id: iv.id, game_id: iv.game_id, inviter_id: iv.inviter_id,
            inviter_name: prof?.display_name ?? "someone",
            kind: (g?.kind ?? "ludo") as "ludo" | "tictactoe",
          });
        })();
        return prev;
      });
    }, 4000);
    return () => { cancelled = true; clearInterval(t); };
  }, [userId]);

  // Invite popup timer
  useEffect(() => {
    if (!pendingInvite) { setInviteLeft(POPUP_SECONDS); return; }
    setInviteLeft(POPUP_SECONDS);
    if (typeof Notification !== "undefined" && document.visibilityState === "hidden") {
      const show = () => new Notification("SANSU's 🎲", {
        body: `${pendingInvite.inviter_name} invited you to play ${pendingInvite.kind === "tictactoe" ? "Tic-tac-toe" : "Ludo"}`,
      });
      if (Notification.permission === "granted") show();
      else if (Notification.permission === "default") void Notification.requestPermission().then((p) => { if (p === "granted") show(); });
    }
    const id = pendingInvite.id;
    const t = setInterval(() => {
      setInviteLeft((s) => {
        if (s <= 1) {
          dismissedRef.current.add(id);
          setPendingInvite((p) => (p && p.id === id ? null : p));
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [pendingInvite]);

  async function acceptPendingInvite() {
    if (!pendingInvite || !userId || acceptingInvite) return;
    const inv = pendingInvite;
    setAcceptingInvite(true);
    try {
      const accepted = await acceptGameInvite(inv.id);
      dismissedRef.current.add(inv.id);
      setPendingInvite(null);
      window.location.href = `/games/${accepted.game_id}`;
    } catch {
      toast.error("Couldn't open the game", { description: "Please ask for a fresh invite." });
    } finally {
      setAcceptingInvite(false);
    }
  }

  async function declinePendingInvite() {
    if (!pendingInvite) return;
    await supabase.from("game_invites").update({ status: "declined" }).eq("id", pendingInvite.id);
    dismissedRef.current.add(pendingInvite.id);
    setPendingInvite(null);
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { mode: "signin" }, replace: true });
  }

  const tabs = [
    { to: "/home" as const, label: "Home", icon: Home },
    { to: "/chat" as const, label: "Chat", icon: MessageCircle },
    { to: "/inbox" as const, label: "Inbox", icon: Mail, badge: dmUnread },
    { to: "/gallery" as const, label: "Gallery", icon: Images },
    { to: "/calendar" as const, label: "Plans", icon: CalendarDays },
    { to: "/lists" as const, label: "Lists", icon: ListChecks },
  ];

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-20 backdrop-blur-md bg-white/40 dark:bg-plum-deep/40 border-b border-white/60 dark:border-white/10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/home" className="font-display text-2xl text-plum">SANSU's</Link>
          <div className="flex items-center gap-1">
            <Link to="/profile" className="p-2 rounded-full text-dusk hover:text-plum" aria-label="Profile">
              <User className="w-5 h-5" />
            </Link>
            <button onClick={signOut} className="text-dusk hover:text-plum p-2 rounded-full" aria-label="Sign out">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto flex flex-col">
        <Outlet />
      </main>

      {/* FIXED NAV BAR: Hides automatically on keyboard focus or inside chat/inbox screens */}
      <nav className={`sticky bottom-0 z-20 backdrop-blur-md bg-white/60 dark:bg-plum-deep/60 border-t border-white/60 dark:border-white/10 transition-all duration-200 ${keyboardOpen || pathname.startsWith("/inbox/") || pathname.startsWith("/chat") ? "hidden pointer-events-none" : "block"}`}>
        <div className="max-w-3xl mx-auto px-1 py-2 grid grid-cols-6">
          {tabs.map(({ to, label, icon: Icon, badge }) => {
            const active = pathname === to || pathname.startsWith(to + "/") || (to === "/home" && pathname === "/");
            return (
              <Link key={to} to={to} className={`relative flex flex-col items-center gap-0.5 py-1.5 rounded-2xl transition ${active ? "text-primary" : "text-plum/60"}`}>
                <div className="relative">
                  <Icon className={`w-5 h-5 ${active ? "scale-110" : ""} transition`} />
                  {badge && badge > 0 ? (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold grid place-items-center shadow-md shadow-primary/40 ring-2 ring-white/70 dark:ring-plum-deep/70">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  ) : null}
                </div>
                <span className="text-[10px] font-semibold">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {pendingInvite && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-plum-deep/50 backdrop-blur-sm animate-fade-scale">
          <div data-invite-popup className="glass-card rounded-3xl p-6 w-full max-w-sm space-y-4 text-center animate-fade-scale ring-1 ring-white/50 shadow-2xl shadow-plum-deep/30">
            <div className="text-5xl animate-pulse">🎲</div>
            <div>
              <p className="text-xs uppercase tracking-widest text-plum/60 font-semibold">Game invite</p>
              <h3 className="font-display text-2xl text-plum mt-1">
                {pendingInvite.inviter_name} invited you to play {pendingInvite.kind === "tictactoe" ? "Tic-tac-toe" : "Ludo"} 🎲
              </h3>
              <p className="text-sm text-muted-foreground italic mt-1">hop in and play together</p>
            </div>
            <div className="h-1.5 rounded-full bg-plum/10 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-coral to-lavender transition-all duration-1000 ease-linear"
                style={{ width: `${(inviteLeft / POPUP_SECONDS) * 100}%` }} />
            </div>
            <p className="text-[11px] text-plum/50">this invite stays here for {inviteLeft}s</p>
            <div className="flex gap-2">
              <button onClick={declinePendingInvite}
                className="flex-1 py-3 rounded-full bg-white/60 dark:bg-white/10 text-plum font-semibold">
                Decline
              </button>
              <button onClick={acceptPendingInvite} disabled={acceptingInvite}
                className="flex-1 py-3 rounded-full bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/30 disabled:opacity-60">
                {acceptingInvite ? "Opening…" : "Accept"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}