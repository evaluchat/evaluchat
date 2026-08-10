"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { finalizeSelfSignupAdmin } from "@/lib/teaching/invitation-accept";
import { postLoginPath } from "@/lib/teaching/config";

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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && !user.app_metadata?.role && !user.user_metadata?.role) {
    try {
      await finalizeSelfSignupAdmin({
        user,
        name:
          (typeof user.user_metadata?.full_name === "string"
            ? user.user_metadata.full_name
            : undefined) ||
          (typeof user.user_metadata?.name === "string"
            ? user.user_metadata.name
            : undefined) ||
          user.email ||
          "Evaluchat user",
      });
    } catch (finalizeError) {
      console.error("[auth/confirm] failed to create organisation:", finalizeError);
      return { ok: false, error: "Account confirmed but organisation setup failed." };
    }
  }

  const redirectTo =
    (next && next.startsWith("/") && !next.startsWith("//") ? next : null) ??
    postLoginPath(user);

  revalidatePath(redirectTo);
  return { ok: true, redirectTo };
}
