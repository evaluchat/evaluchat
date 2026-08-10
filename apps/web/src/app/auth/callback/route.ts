import { NextResponse } from "next/server";
// The client you created from the Server-Side Auth instructions
import { createClient } from "@/lib/supabase/server";
import { finalizeSelfSignupAdmin } from "@/lib/teaching/invitation-accept";
import { postLoginPath } from "@/lib/teaching/config";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Optional override; otherwise land on the canvas after auth.
  const nextOverride = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
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
          console.error("[auth/callback] failed to create organisation:", finalizeError);
          return NextResponse.redirect(`${origin}/auth/auth-code-error`);
        }
      }
      const next =
        nextOverride &&
        nextOverride.startsWith("/") &&
        !nextOverride.startsWith("//")
          ? nextOverride
          : postLoginPath(user);
      const forwardedHost = request.headers.get("x-forwarded-host"); // original origin before load balancer
      const isLocalEnv = process.env.NODE_ENV === "development";
      if (isLocalEnv) {
        // we can be sure that there is no load balancer in between, so no need to watch for X-Forwarded-Host
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
