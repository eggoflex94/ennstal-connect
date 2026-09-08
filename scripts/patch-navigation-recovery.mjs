import fs from 'node:fs';

const path = new URL('../src/main.jsx', import.meta.url);
let source = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

const oldBoundary = `class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("Ennstal Connect konnte eine Ansicht nicht laden:", error);
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="app-recovery">
          <span>ENNSTAL CONNECT</span>
          <h1>Diese Ansicht konnte nicht geladen werden.</h1>
          <p>Bitte lade die Seite neu. Deine Anmeldung und Daten bleiben erhalten.</p>
          <button onClick={() => window.location.reload()}>Seite neu laden</button>
        </main>
      );
    }
    return this.props.children;
  }
}`;

const newBoundary = `class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false, errorText: "" };
    this.handleRecoveryNavigation = (event) => {
      const requested = String(event?.detail?.page || "home");
      try { sessionStorage.setItem("ec-recovery-page", requested); } catch {}
      this.setState({ failed: false, errorText: "" });
    };
  }

  static getDerivedStateFromError(error) {
    return { failed: true, errorText: String(error?.message || error || "Unbekannter Fehler") };
  }

  componentDidMount() {
    window.addEventListener("ec:navigate", this.handleRecoveryNavigation);
  }

  componentWillUnmount() {
    window.removeEventListener("ec:navigate", this.handleRecoveryNavigation);
  }

  componentDidCatch(error) {
    console.error("Ennstal Connect konnte eine Ansicht nicht laden:", error);
  }

  recover(page = "home") {
    try { sessionStorage.setItem("ec-recovery-page", page); } catch {}
    this.setState({ failed: false, errorText: "" });
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="app-recovery">
          <span>ENNSTAL CONNECT</span>
          <h1>Diese Ansicht konnte nicht geladen werden.</h1>
          <p>Die Community bleibt erreichbar. Wähle einen Bereich oder lade die Seite neu.</p>
          <div className="app-recovery-actions">
            <button onClick={() => this.recover("home")}>Startseite</button>
            <button onClick={() => this.recover("members")}>Mitglieder</button>
            <button onClick={() => this.recover("forum")}>Forum</button>
            <button onClick={() => this.recover("groups")}>Gruppen</button>
            <button onClick={() => this.recover("community")}>Events & Community</button>
            <button onClick={() => window.location.reload()}>Seite neu laden</button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}`;

if (!source.includes(oldBoundary)) throw new Error('[navigation recovery] error boundary anchor not found');
source = source.replace(oldBoundary, newBoundary);
fs.writeFileSync(path, source, 'utf8');
console.log('[navigation recovery] crash-safe boundary installed');
