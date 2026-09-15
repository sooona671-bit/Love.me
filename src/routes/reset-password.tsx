import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set a new password — SANSU's" },
      { name: "description", content: "Choose a new password for your SANSU's family account." },
      { property: "og:title", content: "Set a new password — SANSU's" },
      { property: "og:description", content: "Choose a new password for your SANSU's family account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResetPassword,
});

const field =
  "w-full rounded-2xl bg-input/80 px-4 py-3 border border-border outline-none transition " +
  "focus:border-primary focus:ring-4 focus:ring-primary/20";

const MIN_PASSWORD = 8;

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      setReady(Boolean(data.session));
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setReady(Boolean(session)));
    return () => sub.subscription.unsubscribe();
  }, []);

  const passwordOk = password.length >= MIN_PASSWORD;
  const confirmOk = confirm === password;
  const valid = passwordOk && confirmOk;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || loading) return;
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    await supabase.auth.signOut();
    toast.success("Password updated 🌸 Sign in with your new password.");
    navigate({ to: "/auth", search: { mode: "signin" }, replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="glass-card rounded-3xl p-8 w-full max-w-md relative animate-fade-scale" noValidate>
        <div className="absolute -top-8 -right-8 w-24 h-24 blob bg-coral/60 blur-xl -z-10" />
        <h1 className="font-display text-3xl text-plum">Set a new password 🔑</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {ready ? "Pick something you'll remember — at least 8 characters." : "Opening your reset link…"}
        </p>

        <input
          type="password" placeholder="New password" value={password}
          autoComplete="new-password"
          onChange={(e) => setPassword(e.target.value)} className={`mt-6 ${field}`}
        />
        {password.length > 0 && !passwordOk && (
          <p className="mt-1 px-1 text-xs text-destructive">Passwords need at least {MIN_PASSWORD} characters.</p>
        )}

        <input
          type="password" placeholder="Confirm new password" value={confirm}
          autoComplete="new-password"
          onChange={(e) => setConfirm(e.target.value)} className={`mt-3 ${field}`}
        />
        {confirm.length > 0 && !confirmOk && (
          <p className="mt-1 px-1 text-xs text-destructive">Those two passwords don't match yet.</p>
        )}

        <button
          disabled={loading || !valid}
          className="mt-5 w-full rounded-full bg-primary text-primary-foreground py-3 font-semibold transition
                     disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground
                     flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {loading ? "Updating…" : "Update password"}
        </button>
      </form>
    </div>
  );
}
