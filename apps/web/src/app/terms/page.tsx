import type { Metadata } from "next";
import { LEGAL_LAST_UPDATED } from "@/components/auth/login/login-branding";
import { LegalDocumentLayout } from "@/components/legal/legal-document-layout";
import { TermsOfServiceContent } from "@/components/legal/terms-of-service-content";

export const metadata: Metadata = {
  title: "Terms of Service · Evaluchat",
  description:
    "Terms for using Evaluchat, including credits, Creem payments, and AI assistance.",
};

export default function TermsPage() {
  return (
    <LegalDocumentLayout
      title="Terms of Service"
      lastUpdated={LEGAL_LAST_UPDATED}
    >
      <TermsOfServiceContent />
    </LegalDocumentLayout>
  );
}
