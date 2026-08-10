"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Icons } from "@/components/ui/icons";
import { Toaster } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { createSupabaseClient } from "@/lib/supabase/client";
import { completeSelfSignupAdmin, selfSignupWithEmail } from "./actions";

interface InvitationDetails {
  email: string;
  role: "admin" | "teacher" | "student";
  classId: string | null;
  className: string | null;
  status: string;
  expires_at: string;
}

function splitFullName(fullName: string): { first: string; surname: string } {
  const trimmed = fullName.trim();
  if (!trimmed) {
    return { first: "", surname: "" };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { first: parts[0], surname: "" };
  }
  return {
    first: parts[0],
    surname: parts.slice(1).join(" "),
  };
}

/**
 * Supabase invite redirects land with #access_token=…&refresh_token=….
 * Persist that into a cookie session before the accept API can authorize.
 */
async function recoverInviteSession(): Promise<User | null> {
  const supabase = createSupabaseClient();

  if (typeof window !== "undefined" && window.location.hash.length > 1) {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (access_token && refresh_token) {
      const { data, error } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });
      // Strip tokens from the address bar once stored.
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`
      );
      if (!error && data.user) {
        return data.user;
      }
    }
  }

  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

function AcceptInvitationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const isSelfSignup = !token;
  const { toast } = useToast();

  const [loading, setLoading] = useState(!isSelfSignup);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [emailConfirmationMessage, setEmailConfirmationMessage] = useState<
    string | null
  >(null);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const user = await recoverInviteSession();
        if (!cancelled) {
          setSessionUser(user);
        }
      } catch (e) {
        console.error("[invite/accept] session recovery failed:", e);
      } finally {
        if (!cancelled) {
          setSessionLoading(false);
        }
      }
    };

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sessionUser || sessionLoading) return;

    const metadataName =
      (typeof sessionUser.user_metadata?.full_name === "string"
        ? sessionUser.user_metadata.full_name
        : undefined) ||
      (typeof sessionUser.user_metadata?.name === "string"
        ? sessionUser.user_metadata.name
        : "");

    if (metadataName) {
      const { first, surname: last } = splitFullName(metadataName);
      if (first && !name) setName(first);
      if (last && !surname) setSurname(last);
    }

    if (isSelfSignup && sessionUser.email && !email) {
      setEmail(sessionUser.email);
    }
  }, [sessionUser, sessionLoading, isSelfSignup, name, surname, email]);

  useEffect(() => {
    if (isSelfSignup) {
      setLoading(false);
      return;
    }

    const loadInvitation = async () => {
      try {
        const res = await fetch(
          `/api/invitations/${encodeURIComponent(token)}`,
          { credentials: "include" }
        );
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          setError("Could not load invitation details.");
          return;
        }
        const data = await res.json();

        if (!res.ok || !data.invitation) {
          setError(data.error ?? "Invitation not found or has expired.");
          return;
        }

        if (data.invitation.status === "expired") {
          setError("This invitation has expired.");
          return;
        }

        if (data.invitation.status !== "pending") {
          setError("This invitation is no longer valid.");
          return;
        }

        setInvitation(data.invitation);
      } catch {
        setError("Could not load invitation details.");
      } finally {
        setLoading(false);
      }
    };

    loadInvitation();
  }, [token, isSelfSignup]);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError(null);

    try {
      const client = createSupabaseClient();
      const currentOrigin =
        typeof window !== "undefined" ? window.location.origin : "";
      const nextPath = isSelfSignup
        ? "/invite/accept"
        : `/invite/accept?token=${encodeURIComponent(token)}`;
      await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${currentOrigin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      });
    } catch {
      setError("Google sign-in failed");
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const fullName = [name.trim(), surname.trim()].filter(Boolean).join(" ");
    if (!fullName) {
      toast({
        title: "Name required",
        description: "Enter your first name and surname.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    setError(null);
    setEmailConfirmationMessage(null);

    try {
      if (isSelfSignup) {
        if (sessionUser) {
          const result = await completeSelfSignupAdmin({
            name: fullName,
            password: password.trim() || undefined,
          });
          if (result?.ok === false) {
            // Belt-and-braces: redirect() sentinels must not surface as failures.
            if (
              result.error === "NEXT_REDIRECT" ||
              result.error.includes("NEXT_REDIRECT")
            ) {
              return;
            }
            setError(result.error);
            toast({
              title: "Sign up failed",
              description: result.error,
              variant: "destructive",
            });
          }
          return;
        }

        if (!email.trim()) {
          setError("Email is required.");
          return;
        }
        if (!password.trim()) {
          setError("Password is required.");
          return;
        }

        const result = await selfSignupWithEmail({
          email: email.trim(),
          password: password.trim(),
          name: name.trim(),
          surname: surname.trim(),
        });

        if (!result.ok) {
          setError(result.error);
          toast({
            title: "Sign up failed",
            description: result.error,
            variant: "destructive",
          });
          return;
        }

        if (result.needsEmailConfirmation) {
          setConfirmationSent(true);
          setEmailConfirmationMessage(result.message);
          return;
        }

        return;
      }

      if (!sessionUser) {
        setError(
          "No signed-in session. Re-open the invitation link from your email, then try again."
        );
        return;
      }

      if (
        (invitation?.role === "teacher" || invitation?.role === "student") &&
        sessionUser.app_metadata?.role === "admin"
      ) {
        const confirmed = window.confirm(
          "This account is currently an organisation admin. Accepting this invitation will convert it to the invited role and is only allowed for an empty personal organisation. Continue?"
        );
        if (!confirmed) return;
      }

      const supabase = createSupabaseClient();

      if (password.trim()) {
        const { error: passwordError } = await supabase.auth.updateUser({
          password: password.trim(),
        });
        if (passwordError) {
          setError(passwordError.message);
          toast({
            title: "Could not set password",
            description: passwordError.message,
            variant: "destructive",
          });
          return;
        }
      }

      const res = await fetch(
        `/api/invitations/${encodeURIComponent(token)}/accept`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name: fullName }),
        }
      );
      const data = await res.json();

      if (!res.ok) {
        const message = data.error ?? "Failed to accept invitation";
        setError(message);
        toast({
          title: "Acceptance failed",
          description: message,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Invitation accepted",
        description: "Your account is ready.",
      });
      router.replace(data.redirectTo ?? "/student");
    } catch {
      const message = isSelfSignup
        ? "Failed to complete sign up"
        : "Failed to accept invitation";
      setError(message);
      toast({
        title: isSelfSignup ? "Sign up failed" : "Acceptance failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || sessionLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        {isSelfSignup ? "Loading…" : "Loading invitation…"}
      </div>
    );
  }

  if (error && !invitation && !isSelfSignup) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invitation unavailable</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
            <Link href="/auth/login" className={cn(buttonVariants())}>
              Go to login
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (confirmationSent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <h1 className="text-2xl font-semibold leading-none tracking-tight">
              Confirm your email
            </h1>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground" role="status">
              {emailConfirmationMessage}
            </p>
            <p className="text-sm text-muted-foreground">
              Didn&apos;t get it? Check your spam folder.
            </p>
            <Link
              href="/auth/login"
              className={cn(buttonVariants({ variant: "outline" }), "w-full")}
            >
              Back to sign in
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const canAcceptInvite = Boolean(sessionUser);
  const formDisabled = submitting || googleLoading;
  const inviteFieldsDisabled =
    formDisabled || (!isSelfSignup && !canAcceptInvite);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {isSelfSignup ? "Create your account" : "Accept invitation"}
          </CardTitle>
          {!isSelfSignup && invitation?.className && (
            <p className="text-sm text-muted-foreground">
              Join class: {invitation.className}
            </p>
          )}
          {isSelfSignup && (
            <p className="text-sm text-muted-foreground">
              Sign up as an organisation admin to invite teachers and students.
            </p>
          )}
        </CardHeader>
        <CardContent>
          {!isSelfSignup && !sessionUser && (
            <p className="mb-4 text-sm text-destructive" role="alert">
              Your invite session is missing. Open the link from your invitation
              email again (it signs you in), then complete this form.
            </p>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={isSelfSignup ? email : (invitation?.email ?? "")}
                onChange={
                  isSelfSignup ? (e) => setEmail(e.target.value) : undefined
                }
                readOnly={!isSelfSignup}
                disabled={!isSelfSignup || inviteFieldsDisabled}
                required={isSelfSignup}
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">First name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="given-name"
                disabled={inviteFieldsDisabled}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="surname">Surname</Label>
              <Input
                id="surname"
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
                required
                autoComplete="family-name"
                disabled={inviteFieldsDisabled}
              />
            </div>
            {(isSelfSignup || canAcceptInvite) && (
              <div className="space-y-2">
                <Label htmlFor="password">
                  {isSelfSignup
                    ? sessionUser
                      ? "Password (optional)"
                      : "Password"
                    : "Password (optional)"}
                </Label>
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    isSelfSignup && sessionUser
                      ? "Set a password for future logins"
                      : isSelfSignup
                        ? "Create a password"
                        : "Set a password for future logins"
                  }
                  autoComplete="new-password"
                  required={isSelfSignup && !sessionUser}
                  disabled={inviteFieldsDisabled}
                />
              </div>
            )}
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            {isSelfSignup && !sessionUser && (
              <p className="text-sm text-muted-foreground">
                We&apos;ll email you a confirmation link. Your account activates
                when you click it.
              </p>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={formDisabled || (!isSelfSignup && !canAcceptInvite)}
            >
              {submitting && (
                <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
              )}
              {submitting
                ? isSelfSignup
                  ? "Signing up…"
                  : "Accepting…"
                : isSelfSignup
                  ? "Sign up"
                  : "Accept invitation"}
            </Button>
            {!isSelfSignup && !canAcceptInvite && (
              <Link
                href="/auth/login"
                className={cn(buttonVariants({ variant: "outline" }), "w-full")}
              >
                Go to login
              </Link>
            )}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Or continue with
                </span>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleGoogleSignIn}
              disabled={formDisabled}
            >
              {googleLoading ? (
                <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Icons.google className="mr-2 h-4 w-4" />
              )}
              Google
            </Button>
            {isSelfSignup && (
              <Link
                href="/auth/login"
                className={cn(buttonVariants({ variant: "ghost" }), "w-full")}
              >
                Already have an account? Sign in
              </Link>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AcceptInvitationPage({
  searchParams,
}: {
  searchParams?: { token?: string | string[] };
}) {
  // Direct registration has its own route. `/invite/accept` is reserved for
  // invitations, so old no-token links cannot recreate the former unclaimed
  // user flow.
  const token = searchParams?.token;
  if (!token || (Array.isArray(token) && !token[0])) {
    redirect("/auth/signup");
  }

  return (
    <>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        }
      >
        <AcceptInvitationForm />
      </Suspense>
      <Toaster />
    </>
  );
}
