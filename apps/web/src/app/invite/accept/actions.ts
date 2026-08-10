"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/teaching/admin-client";
import {
  finalizeSelfSignupAdmin,
  redirectPathForInvitationRole,
} from "@/lib/teaching/invitation-accept";

export type SelfSignupEmailResult =
  | { ok: true; needsEmailConfirmation: false }
  | { ok: true; needsEmailConfirmation: true; message: string }
  | { ok: false; error: string };

export async function selfSignupWithEmail(input: {
  email: string;
  password: string;
  name: string;
  surname: string;
}): Promise<SelfSignupEmailResult> {
  const email = input.email.trim();
  const password = input.password;
  const fullName = [input.name.trim(), input.surname.trim()]
    .filter(Boolean)
    .join(" ");

  if (!fullName) {
    return { ok: false, error: "Enter your first name and surname." };
  }
  if (!email) {
    return { ok: false, error: "Email is required." };
  }
  if (!password || password.length < 6) {
    return {
      ok: false,
      error: "Password must be at least 6 characters.",
    };
  }

  const supabase = await createClient();
  const siteUrl = getSiteUrl();

  const { data: signUpData, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/confirm`,
      data: {
        name: fullName,
        full_name: fullName,
        registrationComplete: "true",
      },
    },
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  if (signUpData.user) {
    try {
      await finalizeSelfSignupAdmin({
        user: signUpData.user,
        name: fullName,
      });
    } catch (finalizeError) {
      console.error(
        "[invite/accept] finalizeSelfSignupAdmin after signUp failed:",
        finalizeError
      );
      return {
        ok: false,
        error:
          finalizeError instanceof Error
            ? finalizeError.message
            : "Account created but setup failed",
      };
    }
  }

  // Email confirmation disabled in GoTrue → session returned immediately.
  if (signUpData.session && signUpData.user) {
    redirect(redirectPathForInvitationRole("admin"));
  }

  if (signUpData.user) {
    return {
      ok: true,
      needsEmailConfirmation: true,
      message: `Check your email — we sent a confirmation link to ${email}. Click it to activate your account and sign in.`,
    };
  }

  return {
    ok: false,
    error: "Sign up failed. Please try again.",
  };
}

export async function resendConfirmationEmail(
  email: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = email.trim();
  if (!trimmed) {
    return { ok: false, error: "Email is required." };
  }

  const supabase = await createClient();
  const siteUrl = getSiteUrl();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: trimmed,
    options: {
      emailRedirectTo: `${siteUrl}/auth/confirm`,
    },
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function completeSelfSignupAdmin(input: {
  name: string;
  password?: string;
}): Promise<{ ok: false; error: string } | void> {
  const fullName = input.name.trim();
  if (!fullName) {
    return { ok: false, error: "Enter your first name and surname." };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      error:
        "No signed-in session. Sign in with Google or email, then try again.",
    };
  }

  if (input.password?.trim()) {
    const { error: passwordError } = await supabase.auth.updateUser({
      password: input.password.trim(),
    });
    if (passwordError) {
      return { ok: false, error: passwordError.message };
    }
  }

  try {
    const { redirectTo } = await finalizeSelfSignupAdmin({
      user,
      name: fullName,
    });
    redirect(redirectTo);
  } catch (finalizeError) {
    // redirect() throws a NEXT_REDIRECT digest — must rethrow so navigation works.
    if (
      finalizeError instanceof Error &&
      "digest" in finalizeError &&
      String((finalizeError as { digest?: unknown }).digest).startsWith(
        "NEXT_REDIRECT"
      )
    ) {
      throw finalizeError;
    }
    console.error(
      "[invite/accept] completeSelfSignupAdmin failed:",
      finalizeError
    );
    return {
      ok: false,
      error:
        finalizeError instanceof Error
          ? finalizeError.message
          : "Failed to complete signup",
    };
  }
}
