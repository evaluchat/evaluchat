export default function App() {
  const electronVersion = window.electronAPI.versions.electron;
  const pingResult = window.electronAPI.ping();

  return (
    <main className="shell">
      <h1>Evaluchat Canvas</h1>
      <p className="subtitle">Desktop — Phase 0 shell</p>
      <p className="meta">
        Electron {electronVersion} · ping → {pingResult}
      </p>
    </main>
  );
}
