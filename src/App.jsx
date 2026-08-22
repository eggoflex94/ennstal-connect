import { useState } from "react";

function App() {
  const [activePage, setActivePage] = useState("Start");

  const posts = [
    {
      id: 1,
      name: "Anna aus Schladming",
      time: "vor 10 Minuten",
      text: "Wunderschönes Wetter heute in der Region! ☀️ Wer ist unterwegs?",
      likes: 12,
      comments: 3,
    },
    {
      id: 2,
      name: "Max Mustermann",
      time: "vor 35 Minuten",
      text: "Suche Empfehlungen für eine gute Wanderung am Wochenende. 🏔️",
      likes: 8,
      comments: 5,
    },
  ];

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">
          EnnStal <span>Connect</span>
        </div>

        <nav>
          {["Start", "News", "Marktplatz", "Nachrichten", "Profil"].map(
            (item) => (
              <button
                key={item}
                className={activePage === item ? "active" : ""}
                onClick={() => setActivePage(item)}
              >
                {item}
              </button>
            )
          )}
        </nav>
      </header>

      <main className="container">
        <section className="hero">
          <div>
            <p className="eyebrow">DEINE REGION. DEINE COMMUNITY.</p>

            <h1>
              Willkommen bei <span>EnnStal Connect</span>
            </h1>

            <p className="hero-text">
              Verbinde dich mit Menschen aus deiner Region. Entdecke Neuigkeiten,
              tausche dich aus und finde spannende Angebote.
            </p>

            <button className="primary-button">
              Community entdecken
            </button>
          </div>

          <div className="hero-card">
            <div className="hero-icon">🏔️</div>
            <h2>Das EnnStal verbindet.</h2>
            <p>
              Menschen, Neuigkeiten, Veranstaltungen und lokale Angebote an
              einem Ort.
            </p>
          </div>
        </section>

        <section className="content-grid">
          <div className="feed">
            <div className="section-header">
              <div>
                <p className="eyebrow">COMMUNITY</p>
                <h2>Aktuelle Beiträge</h2>
              </div>

              <button className="secondary-button">
                + Beitrag erstellen
              </button>
            </div>

            {posts.map((post) => (
              <article className="post-card" key={post.id}>
                <div className="post-header">
                  <div className="avatar">
                    {post.name.charAt(0)}
                  </div>

                  <div>
                    <h3>{post.name}</h3>
                    <p>{post.time}</p>
                  </div>
                </div>

                <p className="post-text">{post.text}</p>

                <div className="post-actions">
                  <button>❤️ {post.likes}</button>
                  <button>💬 {post.comments}</button>
                  <button>↗ Teilen</button>
                </div>
              </article>
            ))}
          </div>

          <aside className="sidebar">
            <div className="info-card">
              <p className="eyebrow">ENTDECKEN</p>
              <h2>Was gibt es Neues?</h2>

              <div className="info-item">
                <span>📰</span>
                <div>
                  <strong>News</strong>
                  <p>Neuigkeiten aus der Region</p>
                </div>
              </div>

              <div className="info-item">
                <span>🛒</span>
                <div>
                  <strong>Marktplatz</strong>
                  <p>Kaufen, verkaufen und entdecken</p>
                </div>
              </div>

              <div className="info-item">
                <span>👥</span>
                <div>
                  <strong>Community</strong>
                  <p>Verbinde dich mit anderen</p>
                </div>
              </div>
            </div>

            <div className="stats-card">
              <p className="eyebrow">ENNSTAL CONNECT</p>

              <div className="stats">
                <div>
                  <strong>0</strong>
                  <span>Mitglieder</span>
                </div>

                <div>
                  <strong>0</strong>
                  <span>Beiträge</span>
                </div>

                <div>
                  <strong>0</strong>
                  <span>Angebote</span>
                </div>
              </div>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}

export default App;
