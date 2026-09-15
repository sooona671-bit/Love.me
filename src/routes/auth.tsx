import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lookupEmail, ensureEmailConfirmed } from "@/lib/auth.functions";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup", "forgot"]).optional().default("signin"),
});

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — SANSU's family chat" },
      { name: "description", content: "Sign in or create your SANSU's account to join your family's private chat, gallery and plans." },
      { property: "og:title", content: "Sign in — SANSU's family chat" },
      { property: "og:description", content: "Sign in or create your SANSU's account to join your family's private chat, gallery and plans." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const field =
  "w-full rounded-2xl bg-input/80 px-4 py-3 border border-border outline-none transition " +
  "focus:border-primary focus:ring-4 focus:ring-primary/20 placeholder:text-muted-foreground/70";

const MIN_PASSWORD = 8;

function AuthPage() {
  const { mode } = Route.useSearch();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  // Already signed in? Slip straight through.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!cancelled && data.user) navigate({ to: "/home", replace: true });
    })();
    return () => { cancelled = true; };
  }, [navigate]);


  const emailOk = z.string().email().safeParse(email.trim()).success;
  const passwordOk = password.length >= MIN_PASSWORD;
  const confirmOk = confirm === password;

  const formValid =
    mode === "forgot"
      ? emailOk
      : mode === "signup"
        ? Boolean(name.trim()) && emailOk && passwordOk && confirmOk
        : emailOk && password.length > 0;

  const title = mode === "signup" ? "Come on in ✨" : mode === "forgot" ? "Let's get you back in 🔑" : "Welcome back 🌙";
  const subtitle =
    mode === "signup"
      ? "Create your account and join the family's cozy corner."
      : mode === "forgot"
        ? "Pop in your email and we'll send a link to set a new password."
        : "Sign in to pick up right where you left off.";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!formValid || loading) return;
    setLoading(true);
    const cleanEmail = email.trim().toLowerCase();

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { data: { display_name: name.trim() } },
        });
        if (error) throw error;
        // No verification step: sign straight in and head to profile setup.
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (signInError) throw signInError;
        navigate({ to: "/setup", replace: true });
        return;
      } else if (mode === "forgot") {
        const info = await lookupEmail({ data: { email: cleanEmail } });
        if (!info.exists) {
          toast.error("No account found with this email");
          return;
        }
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setResetSent(cleanEmail);
      } else {
        let { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) {
          // Legacy accounts may be flagged unconfirmed; clear that and retry once.
          const healed = await ensureEmailConfirmed({ data: { email: cleanEmail } });
          if (healed.changed) {
            ({ error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password }));
          }
        }
        if (error) {
          const info = await lookupEmail({ data: { email: cleanEmail } });
          if (!info.unknown && !info.exists) toast.error("No account found with this email");
          else toast.error("Incorrect password, please try again");
          return;
        }
        navigate({ to: "/home" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="glass-card rounded-3xl p-8 md:p-10 w-full max-w-md relative animate-fade-scale">
        <div className="absolute -top-8 -right-8 w-24 h-24 blob bg-coral/60 blur-xl -z-10" />
        <div className="absolute -bottom-8 -left-8 w-28 h-28 blob bg-lavender/70 blur-xl -z-10" />
        {children}
      </div>
    </div>
  );

  if (resetSent) {
    return shell(
      <div className="text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-primary/15 grid place-items-center">
          <Mail className="w-7 h-7 text-primary" />
        </div>
        <h1 className="mt-4 font-display text-3xl text-plum">Reset link sent 💌</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Check <span className="font-semibold text-foreground">{resetSent}</span> for a link to set a new password.
        </p>
        <button
          onClick={() => { setResetSent(null); navigate({ to: "/auth", search: { mode: "signin" } }); }}
          className="mt-6 w-full rounded-full bg-primary text-primary-foreground py-3 font-semibold"
        >
          Back to sign in
        </button>
      </div>,
    );
  }

  return shell(
    <>
      <Link to="/auth" search={{ mode: "signin" }} className="text-sm text-dusk hover:text-plum">
        SANSU's
      </Link>
      <h1 className="mt-3 font-display text-4xl text-plum">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-3" noValidate>
        {mode === "signup" && (
          <input
            type="text" placeholder="Your full name" value={name}
            onChange={(e) => setName(e.target.value)} className={field}
          />
        )}
        <div>
          <input
            type="email" placeholder="Email" value={email} autoComplete="email"
            onChange={(e) => setEmail(e.target.value)} className={field}
          />
          {touched && !emailOk && email.length > 0 && (
            <p className="mt-1 px-1 text-xs text-destructive">That doesn't look like a valid email address.</p>
          )}
        </div>
        {mode !== "forgot" && (
          <div>
            <input
              type="password" placeholder="Password" value={password}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              onChange={(e) => setPassword(e.target.value)} className={field}
            />
            {mode === "signup" && password.length > 0 && !passwordOk && (
              <p className="mt-1 px-1 text-xs text-destructive">Passwords need at least {MIN_PASSWORD} characters.</p>
            )}
          </div>
        )}
        {mode === "signup" && (
          <div>
            <input
              type="password" placeholder="Confirm password" value={confirm}
              autoComplete="new-password"
              onChange={(e) => setConfirm(e.target.value)} className={field}
            />
            {confirm.length > 0 && !confirmOk && (
              <p className="mt-1 px-1 text-xs text-destructive">Those two passwords don't match yet.</p>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !formValid}
          className="w-full rounded-full bg-primary text-primary-foreground py-3 font-semibold shadow-lg transition
                     hover:scale-[1.01] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground
                     disabled:shadow-none disabled:hover:scale-100 flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {loading
            ? mode === "signup" ? "Creating your account…" : mode === "forgot" ? "Sending link…" : "Signing you in…"
            : mode === "signup" ? "Create my account" : mode === "forgot" ? "Send reset link" : "Sign in"}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-muted-foreground space-y-1">
        {mode === "signin" && (
          <>
            <div>
              New here? <Link to="/auth" search={{ mode: "signup" }} className="text-primary font-semibold">Create an account</Link>
            </div>
            <div>
              <Link to="/auth" search={{ mode: "forgot" }} className="text-dusk">Forgot password?</Link>
            </div>
          </>
        )}
        {mode === "signup" && (
          <div>
            Already family? <Link to="/auth" search={{ mode: "signin" }} className="text-primary font-semibold">Sign in</Link>
          </div>
        )}
        {mode === "forgot" && (
          <div>
            <Link to="/auth" search={{ mode: "signin" }} className="text-primary font-semibold">Back to sign in</Link>
          </div>
        )}
      </div>
    </>,
  );
}
