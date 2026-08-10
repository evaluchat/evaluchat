"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type ExchangeSignupCodeResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

export async function exchangeSignupCode(
  code: string,
  next?: string | null
): Promise<ExchangeSignupCodeResult> {
  const trimmed = code.trim();
  if (!trimmed) {
    return { ok: false, error: "Missing confirmation code." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(trimmed);

  if (error) {
    const friendly = /verifier|both auth code/i.test(error.message)
      ? "This link must be opened in the same browser you used to sign up (your signup code is tied to it). If your email is already confirmed, sign in with your password."
      : error.message;
    return { ok: false, error: friendly };
  }

  const redirectTo =
    (next && next.startsWith("/") && !next.startsWith("//") ? next : null) ??
    "/canvas";

  revalidatePath(redirectTo);
  return { ok: true, redirectTo };
}
