import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function findUserByEmail(email: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  for (let page = 1; page <= 5; page++) {
    const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return { error: true as const };
    const hit = list.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) return { user: hit };
    if (list.users.length < 200) break;
  }
  return { user: undefined };
}

/**
 * Tells the sign-in screen whether an account exists for this email, so it can
 * show "No account found" instead of a generic credentials error.
 */
export const lookupEmail = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ email: z.string().trim().email().max(255) }).parse(data))
  .handler(async ({ data }) => {
    const res = await findUserByEmail(data.email.toLowerCase());
    if ("error" in res) return { exists: true, unknown: true };
    return { exists: Boolean(res.user), unknown: false };
  });

/**
 * This app has no email verification. Accounts created before that change may
 * still be flagged unconfirmed, which makes Supabase reject a correct password.
 * This marks such an account confirmed so sign-in works normally.
 */
export const ensureEmailConfirmed = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ email: z.string().trim().email().max(255) }).parse(data))
  .handler(async ({ data }) => {
    const res = await findUserByEmail(data.email.toLowerCase());
    if ("error" in res || !res.user) return { changed: false };
    if (res.user.email_confirmed_at) return { changed: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(res.user.id, { email_confirm: true });
    return { changed: !error };
  });
