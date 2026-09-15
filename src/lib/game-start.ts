import { supabase } from "@/integrations/supabase/client";

/**
 * Accept, seat, and activate in one database transaction. Keeping these steps
 * atomic prevents the old partial state: accepted invite + two seats + waiting.
 */
export async function acceptGameInvite(inviteId: string) {
  const { data, error } = await supabase.rpc("accept_game_invite", { _invite_id: inviteId });
  if (error) throw error;
  const accepted = data?.[0];
  if (!accepted) throw new Error("The game could not be opened");
  return { game_id: accepted.out_game_id, kind: accepted.out_kind, seat: accepted.out_seat };

}
