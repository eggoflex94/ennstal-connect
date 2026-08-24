.ec-profile-page {
  --ec-bg: #121a24;
  --ec-card: #17212d;
  --ec-card-2: #1b2734;
  --ec-line: rgba(148, 163, 184, .18);
  --ec-text: #e8edf4;
  --ec-muted: #a8b3c0;
  --ec-orange: #ff6b16;
  --ec-green: #35c879;
  color: var(--ec-text);
  width: 100%;
  max-width: 100%;
}

.ec-profile-page * { box-sizing: border-box; }

.ec-profile-hero,
.ec-content-card,
.ec-profile-tabs,
.ec-profile-edit-card {
  background:
    radial-gradient(circle at 90% 0%, rgba(255, 107, 22, .055), transparent 32%),
    linear-gradient(145deg, rgba(29, 42, 56, .96), rgba(19, 29, 40, .98));
  border: 1px solid var(--ec-line);
  box-shadow: 0 14px 35px rgba(0,0,0,.12);
}

.ec-profile-hero {
  min-height: 216px;
  padding: 26px 24px;
  border-radius: 14px;
  display: grid;
  grid-template-columns: 176px minmax(0, 1fr);
  gap: 26px;
  margin-bottom: 12px;
}

.ec-profile-avatar-wrap {
  position: relative;
  width: 176px;
  height: 176px;
  align-self: center;
}

.ec-profile-avatar {
  width: 176px;
  height: 176px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(232,237,244,.9);
  background: #202b37;
}

.ec-online-dot {
  position: absolute;
  right: 12px;
  bottom: 13px;
  width: 19px;
  height: 19px;
  border-radius: 50%;
  background: #67717d;
  border: 2px solid #182330;
}
.ec-online-dot.online { background: var(--ec-green); }

.ec-profile-main { min-width: 0; display: flex; flex-direction: column; justify-content: center; }

.ec-profile-name-row {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-start;
  padding-bottom: 22px;
  border-bottom: 1px solid var(--ec-line);
}

.ec-profile-name-row h1 {
  margin: 0 0 7px;
  font-size: clamp(29px, 3vw, 40px);
  line-height: 1;
  font-weight: 800;
  letter-spacing: -.03em;
}

.ec-role-line {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #d5dbe3;
  font-size: 16px;
}
.ec-role-star {
  width: 27px;
  height: 27px;
  display: inline-grid;
  place-items: center;
  font-size: 27px;
  line-height: 1;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
}
.ec-role-star.admin { color: #ff3b30; }
.ec-role-star.supporter { color: #34c778; }
.ec-role-star.member { color: #f4b740; }

.ec-online-line {
  margin-top: 8px;
  color: var(--ec-muted);
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 7px;
}
.ec-online-line span {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #68717d;
}
.ec-online-line span.online { background: var(--ec-green); }

.ec-profile-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }

.ec-outline-button,
.ec-primary-button,
.ec-icon-button,
.ec-card-heading button {
  border-radius: 9px;
  border: 1px solid rgba(183, 196, 211, .35);
  color: var(--ec-text);
  background: rgba(18, 27, 38, .55);
  min-height: 40px;
  padding: 0 16px;
  font: inherit;
  cursor: pointer;
  transition: .18s ease;
}
.ec-outline-button:hover,
.ec-icon-button:hover,
.ec-card-heading button:hover {
  border-color: var(--ec-orange);
  color: #fff;
  transform: translateY(-1px);
}
.ec-primary-button {
  border-color: var(--ec-orange);
  background: linear-gradient(135deg, #ff7a1a, #ef5800);
  color: white;
  font-weight: 700;
  box-shadow: 0 8px 20px rgba(255,107,22,.18);
}
.ec-primary-button:hover { filter: brightness(1.08); transform: translateY(-1px); }
.ec-primary-button:disabled { opacity: .65; cursor: wait; transform: none; }
.ec-icon-button { width: 42px; padding: 0; font-size: 21px; }

.ec-profile-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0,1fr));
  gap: 10px;
  padding-top: 18px;
}
.ec-profile-stats > div {
  min-width: 0;
  display: grid;
  grid-template-columns: 28px 1fr;
  grid-template-areas: "icon label" "icon value";
  column-gap: 9px;
  align-items: center;
}
.ec-profile-stats span { grid-area: icon; color: #cdd5de; font-size: 22px; }
.ec-profile-stats small { grid-area: label; color: var(--ec-muted); font-size: 12px; }
.ec-profile-stats strong { grid-area: value; color: #f3f6fa; font-size: 15px; margin-top: 3px; }

.ec-profile-tabs {
  border-radius: 12px;
  min-height: 58px;
  display: flex;
  align-items: stretch;
  gap: 2px;
  padding: 0 10px;
  margin-bottom: 13px;
  overflow-x: auto;
}
.ec-profile-tabs button {
  position: relative;
  border: 0;
  color: #b7c0ca;
  background: transparent;
  padding: 0 18px;
  min-width: max-content;
  font: inherit;
  cursor: pointer;
}
.ec-profile-tabs button:hover { color: white; }
.ec-profile-tabs button.active { color: var(--ec-orange); font-weight: 700; }
.ec-profile-tabs button.active::after {
  content: "";
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 0;
  height: 2px;
  border-radius: 3px;
  background: var(--ec-orange);
}
.ec-profile-tabs em {
  margin-left: 7px;
  display: inline-grid;
  place-items: center;
  min-width: 25px;
  height: 25px;
  border-radius: 13px;
  background: rgba(255,255,255,.07);
  color: #c5ced7;
  font-style: normal;
  font-size: 12px;
}

.ec-profile-content {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(320px, .95fr);
  gap: 12px;
  align-items: start;
}
.ec-profile-left,
.ec-profile-right { display: grid; gap: 12px; }

.ec-content-card {
  border-radius: 13px;
  padding: 21px;
}
.ec-content-card h2 {
  margin: 0 0 14px;
  font-size: 18px;
  letter-spacing: -.01em;
}
.ec-bio {
  margin: 0;
  color: #d5dce4;
  line-height: 1.75;
  white-space: pre-line;
}
.ec-extra-info {
  margin-top: 17px;
  padding-top: 15px;
  border-top: 1px solid var(--ec-line);
  display: grid;
  gap: 9px;
}
.ec-extra-info p { margin: 0; color: #b9c3ce; display: flex; gap: 10px; align-items: center; }
.ec-extra-info span { color: var(--ec-orange); }
.ec-extra-info a { color: #ff8a47; text-decoration: none; }

.ec-card-heading { display: flex; justify-content: space-between; gap: 15px; align-items: center; }
.ec-card-heading h2 { margin: 0; }
.ec-card-heading button {
  min-height: 34px;
  padding: 0 10px;
  color: #cdd5df;
  font-size: 13px;
}

.ec-empty-state {
  min-height: 145px;
  border: 1px dashed rgba(148,163,184,.24);
  border-radius: 10px;
  display: grid;
  place-content: center;
  text-align: center;
  padding: 22px;
}
.ec-empty-state strong { color: #e8edf4; }
.ec-empty-state span { margin-top: 6px; color: #8e9aa8; font-size: 13px; }

.ec-personal-card dl { margin: 0; display: grid; gap: 0; }
.ec-personal-card dl > div {
  display: grid;
  grid-template-columns: 115px minmax(0,1fr);
  gap: 12px;
  padding: 13px 0;
  border-bottom: 1px solid var(--ec-line);
}
.ec-personal-card dl > div:last-child { border-bottom: 0; }
.ec-personal-card dt { color: #9ca8b5; font-size: 13px; }
.ec-personal-card dd { margin: 0; color: #e3e8ee; font-size: 13px; line-height: 1.55; }
.ec-info-bio { white-space: pre-line; }

.ec-security-card { padding-bottom: 10px; }
.ec-setting-row {
  width: 100%;
  min-height: 49px;
  border: 0;
  border-top: 1px solid var(--ec-line);
  background: transparent;
  color: #cfd7df;
  text-align: left;
  display: grid;
  grid-template-columns: 25px 1fr auto auto;
  align-items: center;
  gap: 7px;
  cursor: pointer;
  font: inherit;
}
.ec-setting-row span { color: #b8c3ce; }
.ec-setting-row em { color: #7bd480; font-style: normal; font-size: 12px; }
.ec-setting-row b { font-size: 21px; font-weight: 400; color: #aab4bf; }

.ec-profile-edit-card {
  border-radius: 13px;
  padding: 24px;
}
.ec-edit-heading { margin-bottom: 21px; }
.ec-edit-heading span { color: var(--ec-orange); font-size: 10px; font-weight: 800; letter-spacing: .13em; }
.ec-edit-heading h2 { margin: 6px 0; font-size: 25px; }
.ec-edit-heading p { margin: 0; color: var(--ec-muted); }

.ec-avatar-editor {
  display: flex;
  gap: 16px;
  align-items: center;
  padding: 16px;
  margin-bottom: 20px;
  border: 1px solid var(--ec-line);
  border-radius: 11px;
  background: rgba(5, 10, 16, .16);
}
.ec-avatar-editor img {
  width: 78px;
  height: 78px;
  border-radius: 50%;
  object-fit: cover;
}
.ec-avatar-editor strong,
.ec-avatar-editor small { display: block; }
.ec-avatar-editor small { color: var(--ec-muted); margin: 4px 0 10px; }
.ec-upload-button {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid rgba(255,107,22,.6);
  color: #ff9b66;
  cursor: pointer;
  font-size: 13px;
}
.ec-upload-button input { display: none; }

.ec-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0,1fr));
  gap: 15px;
}
.ec-form-grid label {
  display: grid;
  gap: 7px;
  color: #b8c2cd;
  font-size: 13px;
}
.ec-form-grid label.full { grid-column: 1 / -1; }
.ec-form-grid input,
.ec-form-grid select,
.ec-form-grid textarea {
  width: 100%;
  border: 1px solid rgba(148,163,184,.26);
  border-radius: 9px;
  background: rgba(8,14,21,.38);
  color: #edf2f7;
  outline: none;
  padding: 11px 12px;
  font: inherit;
}
.ec-form-grid textarea { resize: vertical; min-height: 110px; }
.ec-form-grid input:focus,
.ec-form-grid select:focus,
.ec-form-grid textarea:focus {
  border-color: rgba(255,107,22,.85);
  box-shadow: 0 0 0 3px rgba(255,107,22,.09);
}
.ec-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.ec-tab-placeholder { min-height: 330px; }
.ec-tab-placeholder p { color: var(--ec-muted); line-height: 1.7; }

.ec-profile-notice {
  position: fixed;
  z-index: 9999;
  top: 88px;
  left: 50%;
  transform: translateX(-50%);
  width: min(520px, calc(100vw - 30px));
  padding: 13px 16px;
  border-radius: 10px;
  border: 1px solid rgba(255,107,22,.45);
  background: #1a2430;
  color: #f6f8fb;
  box-shadow: 0 16px 40px rgba(0,0,0,.35);
}

@media (max-width: 1100px) {
  .ec-profile-content { grid-template-columns: 1fr; }
  .ec-profile-right { grid-template-columns: repeat(2, minmax(0,1fr)); }
}
@media (max-width: 820px) {
  .ec-profile-hero { grid-template-columns: 1fr; text-align: center; }
  .ec-profile-avatar-wrap { margin: 0 auto; }
  .ec-profile-name-row { align-items: center; flex-direction: column; }
  .ec-profile-actions { justify-content: center; }
  .ec-role-line, .ec-online-line { justify-content: center; }
  .ec-profile-stats { grid-template-columns: repeat(2, minmax(0,1fr)); text-align: left; }
  .ec-profile-right { grid-template-columns: 1fr; }
}
@media (max-width: 620px) {
  .ec-profile-hero { padding: 20px 15px; }
  .ec-profile-avatar-wrap, .ec-profile-avatar { width: 130px; height: 130px; }
  .ec-profile-avatar-wrap { margin: 0 auto; }
  .ec-online-dot { right: 5px; bottom: 7px; }
  .ec-profile-stats { grid-template-columns: 1fr 1fr; }
  .ec-profile-tabs { padding: 0 2px; }
  .ec-profile-tabs button { padding: 0 12px; }
  .ec-content-card, .ec-profile-edit-card { padding: 17px; }
  .ec-form-grid { grid-template-columns: 1fr; }
  .ec-form-grid label.full { grid-column: auto; }
  .ec-personal-card dl > div { grid-template-columns: 1fr; gap: 4px; }
  .ec-avatar-editor { align-items: flex-start; }
}
