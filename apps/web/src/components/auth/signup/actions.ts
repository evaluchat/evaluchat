"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/teaching/admin-client";
import { finalizeSelfSignupAdmin } from "@/lib/teaching/invitation-accept";
import { SignupWithEmailInput } from "./Signup";

export async function signup(input: SignupWithEmailInput) {
  const supabase = await createClient();

  const metadata: Record<string, string> = {};

  if (input.name) {
    metadata.name = input.name;
    metadata.full_name = input.name;
    metadata.registrationComplete = "true";
  }

  const data = {
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: `${getSiteUrl().replace(/\/$/, "")}/auth/confirm?next=${encodeURIComponent("/teacher")}`,
      data: metadata,
    },
  };

  const { data: signUpData, error } = await supabase.auth.signUp(data);

  if (error) {
    console.error(error);
    redirect("/auth/signup?error=true");
  }

  if (signUpData.user) {
    try {
      await finalizeSelfSignupAdmin({
        user: signUpData.user,
        name: input.name?.trim() || input.email,
      });
    } catch (finalizeError) {
      console.error(
        "[auth/signup] failed to create organisation:",
        finalizeError
      );
      redirect("/auth/signup?error=true");
    }
  }

  if (signUpData.session) {
    redirect("/teacher");
  }

  redirect("/auth/signup/success");
}
