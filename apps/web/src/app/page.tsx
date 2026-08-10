"use client";

import { LandingPage } from "@/components/landing/landing-page";
import { UserProvider } from "@/contexts/UserContext";
import { Suspense } from "react";

export default function Home() {
  return (
    <Suspense>
      <UserProvider>
        <LandingPage />
      </UserProvider>
    </Suspense>
  );
}
