* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  min-width: 320px;
  background: #171d27;
  color: #eef2f7;
  font-family:
    Inter,
    Arial,
    Helvetica,
    sans-serif;
}

button,
input,
textarea,
select {
  font: inherit;
}

button {
  cursor: pointer;
}

.app {
  min-height: 100vh;
}

/* NAVIGATION */

.navbar {
  position: sticky;
  top: 0;
  z-index: 20;

  height: 72px;

  display: flex;
  align-items: center;
  justify-content: space-between;

  padding: 0 5%;

  background: #202735;
  border-bottom: 1px solid #354052;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;

  border: 0;
  background: transparent;

  color: white;
  font-size: 21px;
  font-weight: 800;
}

.brand-logo {
  width: 42px;
  height: 42px;

  object-fit: contain;

  border-radius: 10px;
}

.navbar nav {
  display: flex;
  gap: 26px;
}

.navbar nav button,
.profile-nav-button {
  border: 0;
  background: transparent;

  color: #c8d0dc;
}

.navbar nav button:hover {
  color: white;
}

.nav-auth {
  display: flex;
  gap: 10px;
}

.nav-login,
.nav-register {
  padding: 10px 16px;

  border-radius: 8px;
}

.nav-login {
  border: 1px solid #435069;
  background: transparent;
  color: white;
}

.nav-register {
  border: 0;
  background: #4f7bd9;
  color: white;
}

/* LAYOUT */

.page-layout {
  width: min(1450px, 94%);
  margin: 0 auto;

  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;

  gap: 28px;

  padding: 35px 0 80px;
}

.main-content {
  min-width: 0;
}

/* HERO */

.hero {
  min-height: 560px;

  display: flex;
  align-items: center;

  background-size: cover;
  background-position: center;

  border: 1px solid #3a4559;
  border-radius: 20px;

  overflow: hidden;
}

.hero-content {
  max-width: 780px;

  padding: 70px;
}

.eyebrow {
  color: #aeb9c9;

  font-size: 13px;
  font-weight: 800;

  letter-spacing: 2px;
}

.hero h1 {
  margin: 15px 0;

  font-size: clamp(50px, 7vw, 90px);
  line-height: .98;
}

.hero p:not(.eyebrow) {
  max-width: 620px;

  color: #d4dbe5;

  font-size: 20px;
  line-height: 1.7;
}

/* BUTTONS */

.primary-button {
  border: 0;

  padding: 13px 22px;

  border-radius: 9px;

  background: #4f7bd9;
  color: white;

  font-weight: 700;

  transition: .2s;
}

.primary-button:hover {
  transform: translateY(-2px);

  background: #628de9;
}

.secondary-button {
  border: 1px solid #45536b;

  padding: 12px 20px;

  border-radius: 9px;

  background: transparent;
  color: white;
}

.full-width {
  width: 100%;
}

/* STARTSEITE */

.welcome-grid {
  display: grid;

  grid-template-columns: repeat(3, 1fr);

  gap: 20px;

  margin-top: 28px;
}

.info-card,
.sidebar-card,
.member-card,
.post-card,
.profile-info-card,
.editor-card,
.empty-state {
  background: #222a37;

  border: 1px solid #354155;

  border-radius: 16px;
}

.info-card {
  padding: 25px;
}

.info-card h2 {
  margin-top: 0;
}

.info-card p {
  color: #b9c4d3;

  line-height: 1.6;
}

.info-card button {
  border: 0;

  background: transparent;
  color: #7fa8ff;

  font-weight: 700;
}

/* CONTENT */

.content-section {
  min-height: 700px;
}

.section-header {
  display: flex;

  justify-content: space-between;
  align-items: center;

  gap: 20px;

  margin-bottom: 28px;
}

.section-header h1 {
  margin: 0;

  font-size: 38px;
}

/* POSTS */

.editor-card {
  padding: 20px;

  margin-bottom: 25px;
}

textarea,
input,
select {
  width: 100%;

  padding: 13px;

  border: 1px solid #3d4a60;
  border-radius: 8px;

  background: #181e28;
  color: white;
}

textarea {
  min-height: 120px;

  resize: vertical;
}

.editor-actions {
  display: flex;

  justify-content: flex-end;
  gap: 12px;

  margin-top: 12px;
}

.editor-actions button:not(.primary-button) {
  border: 0;

  background: transparent;
  color: #bac5d5;
}

.posts {
  display: grid;
  gap: 18px;
}

.post-card {
  padding: 24px;
}

.post-header {
  display: flex;

  align-items: center;
  gap: 14px;
}

.avatar,
.avatar-image {
  width: 50px;
  height: 50px;

  flex-shrink: 0;

  border-radius: 50%;
}

.avatar {
  display: grid;
  place-items: center;

  background: linear-gradient(
    135deg,
    #527fdd,
    #6c55ba
  );

  font-weight: 800;
}

.avatar-image {
  object-fit: cover;
}

.member-name {
  display: flex;

  align-items: center;
  gap: 7px;
}

.member-name h3,
.member-name h2 {
  margin: 0;
}

.post-header p {
  margin: 5px 0 0;

  color: #8f9bad;
  font-size: 13px;
}

.post-text {
  margin: 24px 0;

  color: #d8dee7;

  line-height: 1.7;
  font-size: 16px;
}

.post-actions {
  display: flex;

  gap: 10px;

  padding-top: 18px;

  border-top: 1px solid #364154;
}

.post-actions button {
  border: 1px solid #3b4659;

  padding: 9px 13px;

  border-radius: 8px;

  background: #293342;
  color: #d7dfeb;
}

/* STERNE – BEWUSST KLEIN */

.role-star {
  width: 23px;
  height: 23px;

  object-fit: contain;

  flex-shrink: 0;
}

/* MITGLIEDER */

.members-grid {
  display: grid;

  grid-template-columns:
    repeat(auto-fill, minmax(240px, 1fr));

  gap: 20px;
}

.member-card {
  padding: 22px;
}

.member-avatar {
  width: 76px;
  height: 76px;

  margin-bottom: 15px;

  border-radius: 50%;

  object-fit: cover;
}

.placeholder-avatar {
  display: grid;
  place-items: center;

  background: linear-gradient(
    135deg,
    #527fdd,
    #6b55b9
  );

  font-size: 28px;
  font-weight: 800;
}

.member-location {
  color: #91a0b6;
}

.member-card > p:not(.member-location) {
  min-height: 50px;

  color: #c3ccd9;
}

.member-card button {
  width: 100%;

  border: 1px solid #43516a;

  padding: 10px;

  border-radius: 8px;

  background: #293444;
  color: white;
}

/* RECHTE SEITE */

.sidebar {
  display: flex;
  flex-direction: column;

  gap: 16px;
}

.sidebar-card {
  padding: 20px;
}

.sidebar-card h2 {
  margin-top: 0;
}

.sidebar-label {
  margin-top: 0;

  color: #8493a8;

  font-size: 11px;
  font-weight: 800;

  letter-spacing: 1.5px;
}

.sidebar-profile {
  display: flex;

  align-items: center;
  gap: 12px;

  margin-bottom: 16px;
}

.sidebar-profile img,
.sidebar-avatar {
  width: 46px;
  height: 46px;

  border-radius: 50%;
}

.sidebar-profile img {
  object-fit: cover;
}

.sidebar-avatar {
  display: grid;
  place-items: center;

  background: #4f7bd9;

  font-weight: 800;
}

.role-line {
  display: flex;

  align-items: center;
  gap: 5px;

  margin-top: 4px;

  color: #9ba8ba;
  font-size: 12px;
}

.sidebar-card > button {
  width: 100%;

  display: block;

  padding: 11px 4px;

  border: 0;

  background: transparent;

  color: #d5dde8;
  text-align: left;

  border-bottom: 1px solid #303a4b;
}

.sidebar-card > button:hover {
  color: #79a3ff;
}

.logout-button {
  color: #ff8d8d !important;
}

.admin-tools {
  border-color: #805f2c;
}

/* PROFILE */

.profile-page-header {
  display: flex;

  align-items: center;
  gap: 25px;

  margin-bottom: 30px;
}

.profile-large-avatar {
  width: 120px;
  height: 120px;

  border-radius: 50%;

  object-fit: cover;
}

.profile-info-card {
  padding: 30px;
}

.profile-info-card h2 {
  margin-top: 25px;
}

.profile-info-card p {
  color: #c4cedb;

  line-height: 1.7;
}

/* ADMIN */

.admin-panel {
  width: min(1100px, 94%);

  margin: 0 auto 80px;

  padding: 30px;

  background: #202836;

  border: 1px solid #47536a;

  border-radius: 18px;
}

.admin-members {
  display: grid;

  gap: 12px;
}

.admin-member {
  display: grid;

  grid-template-columns: 1fr 180px auto;

  gap: 12px;

  align-items: center;

  padding: 15px;

  background: #18202b;

  border-radius: 10px;
}

.admin-member button {
  border: 0;

  padding: 10px 15px;

  border-radius: 7px;

  background: #4f7bd9;
  color: white;
}

/* MODAL */

.modal-overlay {
  position: fixed;

  inset: 0;

  z-index: 100;

  display: grid;
  place-items: center;

  padding: 20px;

  background: rgba(0, 0, 0, .72);
}

.modal {
  position: relative;

  width: min(500px, 100%);

  display: grid;

  gap: 13px;

  padding: 35px;

  border: 1px solid #3c485d;
  border-radius: 18px;

  background: #222a37;
}

.modal h2 {
  margin-top: 0;
}

.modal-close {
  position: absolute;

  top: 12px;
  right: 15px;

  border: 0;

  background: transparent;

  color: white;

  font-size: 30px;
}

.modal-switch {
  border: 0;

  background: transparent;

  color: #7fa8ff;
}

.loading,
.empty-state {
  padding: 35px;

  color: #b7c1d0;

  text-align: center;
}

/* MOBILE */

@media (max-width: 1050px) {

  .page-layout {
    grid-template-columns: 1fr;
  }

  .sidebar {
    display: grid;

    grid-template-columns:
      repeat(2, minmax(0, 1fr));
  }

  .navbar nav {
    gap: 14px;
  }
}

@media (max-width: 750px) {

  .navbar {
    height: auto;

    flex-wrap: wrap;

    padding: 14px 5%;
  }

  .navbar nav {
    order: 3;

    width: 100%;

    overflow-x: auto;
  }

  .hero {
    min-height: 480px;
  }

  .hero-content {
    padding: 35px 25px;
  }

  .welcome-grid,
  .sidebar {
    grid-template-columns: 1fr;
  }

  .section-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .profile-page-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .admin-member {
    grid-template-columns: 1fr;
  }
}
