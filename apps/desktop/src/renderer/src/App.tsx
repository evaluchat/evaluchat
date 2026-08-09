import { useEffect, useState } from "react";

export default function App() {
  const [pingResult, setPingResult] = useState<string | null>(null);
  useEffect(() => {
    void window.electronAPI.ping().then(setPingResult);
  }, []);

  return (
    <main className="shell">
      <h1>Evaluchat Canvas</h1>
      <p className="subtitle">Desktop — Phase 0 shell</p>
      <p className="meta">
        Electron {window.electronAPI.versions.electron} · ping →{" "}
        {pingResult ?? "…"}
      </p>
    </main>
  );
}
