import { redirect } from "next/navigation";

export default function ResearcherPage() {
  // Research is a public repository/site, not an in-app persona or dashboard.
  redirect("https://github.com/evaluchat/research");
}
