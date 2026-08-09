import { useEffect, useState } from "react";

import { DocumentEditor } from "./editor";

/**
 * W2 placeholder shell: editor with local markdown state only.
 * W3 replaces this with DocumentStore + file IPC / raw / print.
 */
export default function App() {
  const [pingResult, setPingResult] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState(
    "# Untitled\n\nStart writing…\n\nInline math $E=mc^2$.\n"
  );

  useEffect(() => {
    void window.electronAPI.ping().then(setPingResult);
  }, []);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="no-print flex shrink-0 items-center justify-between border-b border-border px-4 py-2 text-sm text-muted-foreground">
        <span>Evaluchat Canvas — editor preview (W2)</span>
        <span className="font-variant-numeric tabular-nums">
          ping → {pingResult ?? "…"}
        </span>
      </header>
      <main className="min-h-0 flex-1">
        <DocumentEditor markdown={markdown} onChange={setMarkdown} />
      </main>
    </div>
  );
}
