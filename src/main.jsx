/* =========================================================
   ENNSTAL CONNECT – DARK COMMUNITY DESIGN
========================================================= */

:root {
  --bg: #101514;
  --bg-secondary: #161d1b;
  --bg-card: #1b2421;
  --bg-card-hover: #222d29;
  --bg-input: #111817;

  --border: #303d38;
  --border-light: #42524c;

  --text: #eef3f0;
  --text-secondary: #aab8b1;
  --text-muted: #78857f;

  --primary: #315f52;
  --primary-hover: #3d7565;
  --primary-dark: #1f4238;

  --gold: #d5a928;
  --gold-light: #f0c94b;

  --admin: #e04747;
  --admin-dark: #9f2828;

  --online: #42c779;
  --offline: #69746f;

  --danger: #d94b4b;

  --shadow: 0 10px 35px rgba(0, 0, 0, 0.28);
  --radius: 18px;
}

/* =========================================================
   RESET
========================================================= */

* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  min-width: 320px;

  font-family:
    Arial,
    Helvetica,
    sans-serif;

  background:
    radial-gradient(
      circle at top left,
      #1c2925 0%,
      #101514 45%,
      #0b0f0e 100%
    );

  color: var(--text);
}

button,
input,
textarea,
select {
  font: inherit;
}

button {
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    transform 0.2s ease,
    opacity 0.2s ease;
}

/* =========================================================
   HEADER
========================================================= */

.site-header {
  position: sticky;
  top: 0;
  z-index: 1000;

  background:
    rgba(16, 21, 20, 0.94);

  backdrop-filter:
    blur(16px);

  border-bottom:
    1px solid var(--border);

  box-shadow:
    0 5px 25px rgba(0, 0, 0, 0.25);
}

.header-content {
  width: 100%;
  max-width: none;
  margin: 0;

  padding: 10px 22px;

  display: flex;
  align-items: center;
  justify-content: space-between;

  gap: 25px;
}

/* =========================================================
   LOGO
========================================================= */

.logo-area {
  display: flex;
  align-items: center;

  margin: 0;
  padding: 0;

  flex-shrink: 0;
}

.logo {
  display: block;

  width: auto;
  height: 92px;
  max-width: min(34vw, 420px);

  object-fit: contain;
  object-position: left center;

  filter:
    drop-shadow(
      0 4px 10px rgba(0, 0, 0, 0.3)
    );
}

/* =========================================================
   NAVIGATION
========================================================= */

.nav-links {
  display: flex;
  align-items: center;
  justify-content: center;

  gap: 6px;

  flex-wrap: wrap;
}

.nav-links button {
  border: 1px solid transparent;

  background: transparent;

  color: var(--text-secondary);

  padding: 10px 15px;

  border-radius: 10px;

  cursor: pointer;

  font-weight: 600;
}

.nav-links button:hover {
  color: white;

  background: var(--bg-card);

  border-color: var(--border);
}

.nav-links button.active {
  color: white;

  background:
    linear-gradient(
      135deg,
      var(--primary),
      var(--primary-dark)
    );

  border-color:
    var(--primary-hover);
}

/* =========================================================
   MAIN LAYOUT
========================================================= */

.site-main {
  max-width: 1600px;

  margin: 0 auto;

  padding: 30px;
}

.page-layout {
  display: grid;

  grid-template-columns:
    minmax(0, 1fr)
    360px;

  gap: 25px;

  align-items: start;
}

.content-area {
  min-width: 0;
}

/* =========================================================
   HERO
========================================================= */

.hero {
  position: relative;

  min-height: 310px;

  overflow: hidden;

  border-radius: 24px;

  margin-bottom: 28px;

  display: flex;
  align-items: center;

  border:
    1px solid var(--border);

  box-shadow:
    var(--shadow);

  background: #141b19;
}

.hero::before {
  content: "";

  position: absolute;

  inset: 0;

  background-image:
    linear-gradient(
      90deg,
      rgba(8, 12, 11, 0.92) 0%,
      rgba(10, 15, 13, 0.72) 40%,
      rgba(10, 15, 13, 0.38) 100%
    ),
    url("/hero.jpg");

  background-size: cover;

  background-position: center;

  opacity: 0.8;

  filter:
    brightness(0.7)
    saturate(0.75);

  transform:
    scale(1.02);
}

.hero-content {
  position: relative;

  z-index: 2;

  max-width: 680px;

  padding: 48px;
}

.hero h1 {
  margin: 0 0 15px;

  font-size:
    clamp(2.2rem, 5vw, 4.2rem);

  line-height: 1.05;

  color: white;
}

.hero p {
  margin: 0;

  font-size: 1.1rem;

  line-height: 1.7;

  color: #c4d0ca;
}

/* =========================================================
   STANDARD CARDS
========================================================= */

.card,
.news-card,
.post-card,
.profile-card,
.stats-card,
.admin-card,
.member-card {
  background:
    linear-gradient(
      145deg,
      #1c2522,
      #151c1a
    );

  border:
    1px solid var(--border);

  border-radius:
    var(--radius);

  box-shadow:
    var(--shadow);
}

.card {
  padding: 22px;
}

.card h2,
.card h3,
.news-card h2,
.post-card h2,
.profile-card h2,
.stats-card h2,
.admin-card h2 {
  margin-top: 0;

  color: white;
}

/* =========================================================
   BUTTONS
========================================================= */

.primary-button {
  border: 1px solid var(--primary-hover);

  background:
    linear-gradient(
      135deg,
      var(--primary),
      var(--primary-dark)
    );

  color: white;

  padding: 11px 18px;

  border-radius: 10px;

  cursor: pointer;

  font-weight: 700;
}

.primary-button:hover {
  background:
    linear-gradient(
      135deg,
      var(--primary-hover),
      var(--primary)
    );

  transform:
    translateY(-1px);
}

.secondary-button {
  border:
    1px solid var(--border-light);

  background:
    var(--bg-card);

  color:
    var(--text);

  padding:
    10px 16px;

  border-radius:
    10px;

  cursor: pointer;
}

.secondary-button:hover {
  background:
    var(--bg-card-hover);
}

.danger-button {
  background:
    #6f2828;

  border:
    1px solid #a13b3b;

  color:
    white;

  padding:
    10px 15px;

  border-radius:
    10px;

  cursor:
    pointer;
}

.full-button {
  width: 100%;
}

/* =========================================================
   FORMULARE
========================================================= */

input,
textarea,
select {
  width: 100%;

  color: var(--text);

  background:
    var(--bg-input);

  border:
    1px solid var(--border);

  border-radius:
    10px;

  padding:
    12px 14px;

  margin-bottom:
    12px;

  outline: none;
}

input::placeholder,
textarea::placeholder {
  color: var(--text-muted);
}

input:focus,
textarea:focus,
select:focus {
  border-color:
    var(--primary-hover);

  box-shadow:
    0 0 0 3px
    rgba(61, 117, 101, 0.18);
}

textarea {
  resize: vertical;
  min-height: 110px;
}

/* =========================================================
   MITGLIEDER
========================================================= */

.members-grid {
  display: grid;

  grid-template-columns:
    repeat(auto-fill, minmax(240px, 1fr));

  gap: 18px;
}

.member-card {
  position: relative;

  padding: 18px;

  min-height: 135px;

  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.member-card:hover {
  transform:
    translateY(-4px);

  border-color:
    var(--primary-hover);

  box-shadow:
    0 15px 40px rgba(0, 0, 0, 0.38);
}

.member-top {
  display: flex;

  align-items: center;

  gap: 13px;
}

.member-avatar {
  width: 62px;
  height: 62px;

  flex-shrink: 0;

  border-radius: 50%;

  object-fit: cover;

  background: #2a3531;

  border:
    3px solid var(--border-light);
}

.member-info {
  min-width: 0;

  display: flex;
  flex-direction: column;

  gap: 4px;
}

/* =========================================================
   NICKNAME
========================================================= */

.nickname {
  border: none;
  padding: 0;

  background: transparent;

  text-align: left;

  font-size: 1.08rem;
  font-weight: 800;

  cursor: pointer;

  transition:
    opacity 0.2s ease;
}

.nickname:hover {
  opacity: 0.75;
}

.nickname-standard {
  color: #9ba39f;
}

.nickname-premium {
  color: #ffffff;
}

.nickname-admin {
  color: var(--admin);
}

/* =========================================================
   ONLINE / OFFLINE
========================================================= */

.status-line {
  display: flex;

  align-items: center;

  gap: 7px;

  font-size: 0.82rem;
}

.status-dot {
  width: 9px;
  height: 9px;

  border-radius: 50%;

  flex-shrink: 0;
}

.status-dot.online {
  background: var(--online);

  box-shadow:
    0 0 10px
    rgba(66, 199, 121, 0.7);
}

.status-dot.offline {
  background: var(--offline);
}

.status-online {
  color: var(--online);
}

.status-offline {
  color: var(--text-muted);
}

/* =========================================================
   MITGLIEDER BADGES
========================================================= */

.member-badges {
  display: flex;

  align-items: center;

  gap: 7px;

  margin-top: 8px;
}

.admin-star,
.supporter-star {
  font-size: 1rem;
}

.admin-star {
  color: var(--admin);
}

.supporter-star {
  color: var(--gold);
}

/* =========================================================
   FREUNDESYMBOL
========================================================= */

.friend-icon {
  width: 28px;
  height: 28px;

  object-fit: contain;

  position: absolute;

  top: 13px;
  right: 13px;

  filter:
    drop-shadow(
      0 2px 7px rgba(255, 0, 0, 0.35)
    );
}

/* =========================================================
   MITGLIEDER SUCHE
========================================================= */

.member-search {
  margin-bottom: 20px;

  position: relative;
}

.member-search input {
  margin: 0;

  padding-left: 42px;

  background:
    #121917;
}

.member-search::before {
  content: "⌕";

  position: absolute;

  left: 15px;
  top: 8px;

  z-index: 2;

  font-size: 1.5rem;

  color: var(--text-muted);
}

/* =========================================================
   RECHTE PROFILSEITE
========================================================= */

.profile-sidebar {
  position: sticky;

  top: 105px;

  height: fit-content;

  display: flex;

  flex-direction: column;

  gap: 16px;
}

.profile-sidebar .card {
  padding: 20px;

  background:
    linear-gradient(
      145deg,
      #1c2522,
      #141a18
    );
}

/* =========================================================
   EIGENES PROFIL
========================================================= */

.profile-header {
  display: flex;

  align-items: center;

  gap: 15px;

  margin-bottom: 18px;
}

.profile-avatar {
  width: 76px;
  height: 76px;

  flex-shrink: 0;

  border-radius: 50%;

  object-fit: cover;

  background: #27312e;

  border:
    3px solid var(--primary-hover);
}

.profile-name {
  margin: 0;

  color: white;

  font-size: 1.25rem;
}

.profile-role {
  margin-top: 4px;

  color: var(--text-muted);

  font-size: 0.85rem;
}

/* =========================================================
   PUNKTE
========================================================= */

.points-box {
  background:
    linear-gradient(
      135deg,
      #25322d,
      #19211f
    );

  border:
    1px solid #40584e;

  border-radius:
    14px;

  padding:
    18px;

  margin-top:
    14px;
}

.points-label {
  color: var(--text-secondary);

  font-size: 0.85rem;
}

.points-value {
  display: block;

  margin-top: 5px;

  font-size: 2rem;

  font-weight: 900;

  color: var(--gold-light);
}

.purchase-points {
  color: var(--gold);
}

/* =========================================================
   BLINKENDE BELOHNUNG
========================================================= */

.reward-ready {
  animation:
    rewardBlink 1.2s infinite;
}

@keyframes rewardBlink {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.35;
  }

}

/* =========================================================
   NACHRICHTEN
========================================================= */

.message-alert {
  color: var(--gold-light);

  font-weight: 800;

  animation:
    messageBlink 1s infinite;
}

@keyframes messageBlink {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.25;
  }

}

/* =========================================================
   FREUNDE ONLINE
========================================================= */

.friends-online-list {
  display: flex;

  flex-direction: column;

  gap: 10px;
}

.friend-online-item {
  display: flex;

  align-items: center;

  justify-content: space-between;

  gap: 10px;

  padding: 10px;

  border-radius: 10px;

  background:
    #151d1a;

  border:
    1px solid var(--border);
}

.friend-online-name {
  font-weight: 700;
}

/* =========================================================
   NEWS
========================================================= */

.news-list,
.posts-list {
  display: flex;

  flex-direction: column;

  gap: 18px;
}

.news-card,
.post-card {
  padding: 22px;
}

.news-meta,
.post-meta {
  margin-top: 10px;

  color: var(--text-muted);

  font-size: 0.84rem;
}

/* =========================================================
   BEITRÄGE
========================================================= */

.post-author {
  display: flex;

  align-items: center;

  gap: 10px;

  margin-bottom: 14px;
}

.post-avatar {
  width: 44px;
  height: 44px;

  border-radius: 50%;

  object-fit: cover;

  background: #28332f;
}

.post-content {
  line-height: 1.65;

  color: #d8e0dc;
}

/* =========================================================
   STATISTIK
========================================================= */

.stats-grid {
  display: grid;

  grid-template-columns:
    repeat(auto-fit, minmax(180px, 1fr));

  gap: 16px;
}

.stat-box {
  padding: 20px;

  border-radius: 15px;

  background:
    linear-gradient(
      145deg,
      #1d2824,
      #141a18
    );

  border:
    1px solid var(--border);
}

.stat-label {
  color: var(--text-muted);

  font-size: 0.88rem;
}

.stat-value {
  display: block;

  margin-top: 8px;

  font-size: 1.8rem;

  font-weight: 900;

  color: var(--text);
}

/* =========================================================
   ADMIN BEREICH
========================================================= */

.admin-section {
  margin-top: 25px;

  padding: 24px;

  border-radius: var(--radius);

  background:
    linear-gradient(
      145deg,
      #211b1b,
      #171515
    );

  border:
    1px solid #4c3030;
}

.admin-section h2 {
  margin-top: 0;

  color: #f3b1b1;
}

.admin-tools {
  display: grid;

  grid-template-columns:
    repeat(auto-fit, minmax(200px, 1fr));

  gap: 14px;
}

.admin-tool {
  padding: 17px;

  border-radius: 13px;

  background:
    #1a1f1d;

  border:
    1px solid var(--border);
}

.admin-tool h3 {
  margin-top: 0;
}

/* =========================================================
   ADMIN DASHBOARD
========================================================= */

.admin-stats {
  display: grid;

  grid-template-columns:
    repeat(3, 1fr);

  gap: 18px;

  margin-bottom: 25px;
}

.admin-stat-card {
  padding: 24px;

  background:
    linear-gradient(
      145deg,
      #202925,
      #161d1a
    );

  border:
    1px solid var(--border);

  border-radius: 18px;
}

.admin-stat-number {
  display: block;

  margin-top: 12px;

  font-size: 2.5rem;

  font-weight: 900;

  color: var(--text);
}

/* =========================================================
   ADMIN MITGLIEDER
========================================================= */

.admin-members {
  display: flex;

  flex-direction: column;

  gap: 12px;
}

.admin-member-row {
  display: flex;

  align-items: center;

  justify-content: space-between;

  gap: 20px;

  padding: 16px;

  background:
    #171e1b;

  border:
    1px solid var(--border);

  border-radius: 13px;
}

.admin-member-info {
  display: flex;

  align-items: center;

  gap: 13px;
}

.admin-email {
  margin-top: 4px;

  color: var(--text-muted);

  font-size: 0.85rem;
}

/* =========================================================
   MODAL
========================================================= */

.modal-overlay {
  position: fixed;

  inset: 0;

  z-index: 5000;

  display: flex;

  align-items: center;
  justify-content: center;

  padding: 20px;

  background:
    rgba(0, 0, 0, 0.72);

  backdrop-filter:
    blur(7px);
}

.modal {
  position: relative;

  width:
    min(520px, 100%);

  max-height: 90vh;

  overflow-y: auto;

  padding: 28px;

  border-radius: 20px;

  background:
    linear-gradient(
      145deg,
      #202925,
      #151b19
    );

  border:
    1px solid var(--border-light);

  box-shadow:
    0 30px 80px rgba(0, 0, 0, 0.65);
}

.modal h2 {
  margin-top: 0;

  color: white;
}

.close-button {
  position: absolute;

  top: 10px;
  right: 15px;

  border: none;

  background: transparent;

  color: var(--text-secondary);

  font-size: 2rem;

  cursor: pointer;
}

.close-button:hover {
  color: white;
}

/* =========================================================
   POPUP MELDUNGEN
========================================================= */

.message-popup {
  position: fixed;

  right: 25px;
  bottom: 25px;

  z-index: 6000;

  max-width: 360px;

  padding: 16px 20px;

  border-radius: 13px;

  background:
    #1d2925;

  color: white;

  border:
    1px solid var(--primary-hover);

  box-shadow:
    0 15px 45px rgba(0, 0, 0, 0.4);

  animation:
    popupIn 0.3s ease;
}

@keyframes popupIn {

  from {
    opacity: 0;

    transform:
      translateY(15px);
  }

  to {
    opacity: 1;

    transform:
      translateY(0);
  }

}

/* =========================================================
   FOOTER
========================================================= */

.site-footer {
  margin-top: 60px;

  background:
    #0b0f0e;

  border-top:
    1px solid var(--border);
}

.footer-content {
  max-width: 1600px;

  margin: 0 auto;

  padding: 35px 30px;

  display: flex;

  align-items: flex-start;

  justify-content: space-between;

  gap: 30px;
}

.footer-logo {
  width: 165px;
  height: auto;

  margin-bottom: 10px;
}

.footer-content p {
  color: var(--text-muted);
}

.footer-links {
  display: flex;

  flex-wrap: wrap;

  gap: 10px;
}

.footer-links button {
  border: none;

  background: transparent;

  color: var(--text-secondary);

  cursor: pointer;

  padding: 8px;
}

.footer-links button:hover {
  color: white;
}

.footer-bottom {
  padding: 18px;

  text-align: center;

  color: var(--text-muted);

  border-top:
    1px solid var(--border);
}

/* =========================================================
   SCROLLBAR
========================================================= */

::-webkit-scrollbar {
  width: 11px;
}

::-webkit-scrollbar-track {
  background: #0d1210;
}

::-webkit-scrollbar-thumb {
  background: #303d38;

  border-radius: 20px;
}

::-webkit-scrollbar-thumb:hover {
  background: #46554f;
}

/* =========================================================
   RESPONSIVE – TABLET
========================================================= */

@media (max-width: 1150px) {

  .page-layout {
    grid-template-columns: 1fr;
  }

  .profile-sidebar {
    position: static;

    display: grid;

    grid-template-columns:
      repeat(auto-fit, minmax(280px, 1fr));
  }

  .admin-stats {
    grid-template-columns: 1fr;
  }

}

/* =========================================================
   RESPONSIVE – MOBILE
========================================================= */

@media (max-width: 750px) {

  .header-content {
    padding: 10px 15px;

    flex-wrap: wrap;
  }

  .logo {
    height: 64px;
    max-width: 62vw;
  }

  .nav-links {
    width: 100%;

    justify-content: flex-start;

    flex-wrap: nowrap;

    overflow-x: auto;

    padding-bottom: 3px;
  }

  .nav-links button {
    white-space: nowrap;
  }

  .site-main {
    padding: 15px;
  }

  .hero {
    min-height: 280px;
  }

  .hero-content {
    padding: 32px 24px;
  }

  .hero h1 {
    font-size: 2.3rem;
  }

  .members-grid {
    grid-template-columns: 1fr;
  }

  .profile-sidebar {
    grid-template-columns: 1fr;
  }

  .admin-member-row {
    align-items: flex-start;

    flex-direction: column;
  }

  .footer-content {
    padding: 30px 20px;

    flex-direction: column;
  }

  .message-popup {
    left: 15px;
    right: 15px;
    bottom: 15px;

    max-width: none;
  }

}
