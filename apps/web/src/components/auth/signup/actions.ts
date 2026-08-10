"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { SignupWithEmailInput } from "./Signup";

export async function signup(input: SignupWithEmailInput, baseUrl: string) {
  const supabase = await createClient();

  const role = input.role || "student";
  const metadata: Record<string, string> = {
    role,
  };

  if (input.name) {
    metadata.name = input.name;
    metadata.full_name = input.name;
    metadata.registrationComplete = "true";
  }

  const data = {
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: `${baseUrl}/auth/confirm`,
      data: metadata,
    },
  };

  const { error } = await supabase.auth.signUp(data);

  if (error) {
    console.error(error);
    redirect("/auth/signup?error=true");
  }

  redirect("/auth/signup/success");
}
