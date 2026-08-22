function App() {
  const posts = [
    {
      id: 1,
      name: "Anna aus Schladming",
      time: "vor 10 Minuten",
      avatar: "A",
      text: "Wunderschönes Wetter heute in der Region! ☀️ Wer ist unterwegs?",
      likes: 12,
      comments: 3,
    },
    {
      id: 2,
      name: "Max Mustermann",
      time: "vor 35 Minuten",
      avatar: "M",
      text: "Suche Empfehlungen für eine gute Wanderung am Wochenende. 🏔️",
      likes: 8,
      comments: 5,
    },
    {
      id: 3,
      name: "Lisa aus Ennstal",
      time: "vor 1 Stunde",
      avatar: "L",
      text: "Heute findet ein kleiner Markt im Ort statt. Kommt gerne vorbei! 🎉",
      likes: 24,
      comments: 7,
    },
  ];

  return (
    <div className="app">
      <header className="navbar">
        <div className="logo">
          EnnStal Connect
        </div>

        <nav>
          <a href="#start">Start</a>
          <a href="#news">News</a>
          <a href="#marktplatz">Marktplatz</a>
          <a href="#nachrichten">Nachrichten</a>
          <a href="#profil">Profil</a>
        </nav>
      </header>

      <main>
        <section className="hero" id="start">
          <div className="hero-content">
            <p className="eyebrow">
              DEINE REGION. DEINE COMMUNITY.
            </p>

            <h1>
              Willkommen bei
              <br />
              EnnStal Connect
            </h1>

            <p className="hero-text">
              Verbinde dich mit Menschen aus deiner Region.
              Entdecke Neuigkeiten, tausche dich aus und finde
              spannende Angebote.
            </p>

            <button className="primary-button">
              Community entdecken
            </button>

            <div className="hero-info">
              <span className="mountain">🏔️</span>

              <div>
                <h2>Das EnnStal verbindet.</h2>
                <p>
                  Menschen, Neuigkeiten, Veranstaltungen und lokale
                  Angebote an einem Ort.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="community" id="news">
          <div className="section-header">
            <div>
              <p className="eyebrow">COMMUNITY</p>
              <h2>Aktuelle Beiträge</h2>
            </div>

            <button className="create-post">
              + Beitrag erstellen
            </button>
          </div>

          <div className="posts">
            {posts.map((post) => (
              <article className="post-card" key={post.id}>
                <div className="post-header">
                  <div className="avatar">
                    {post.avatar}
                  </div>

                  <div>
                    <h3>{post.name}</h3>
                    <p>{post.time}</p>
                  </div>
                </div>

                <p className="post-text">
                  {post.text}
                </p>

                <div className="post-actions">
                  <button>
                    ❤️ {post.likes}
                  </button>

                  <button>
                    💬 {post.comments}
                  </button>

                  <button>
                    ↗ Teilen
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
