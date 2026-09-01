const legalStyle = `
.ec-legal-overlay{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:20px;background:rgba(18,35,54,.48);backdrop-filter:blur(7px)}
.ec-legal-box{width:min(900px,96vw);max-height:88vh;overflow:auto;background:#fff;border:1px solid #d7e0e8;border-radius:22px;padding:28px;box-shadow:0 24px 70px rgba(18,35,54,.25);color:#263c53;line-height:1.65}
.ec-legal-box h1{margin:0 0 18px;color:#17304d}.ec-legal-box h2{margin:24px 0 8px;color:#284c6b}.ec-legal-box p,.ec-legal-box li{color:#4c6277}.ec-legal-box .notice{padding:12px 14px;background:#fff8df;border:1px solid #ead078;border-radius:12px;color:#6b5714}.ec-legal-close{float:right;border:0;background:#edf3f7;border-radius:10px;padding:7px 11px;font-size:18px;cursor:pointer}
`;
document.head.appendChild(Object.assign(document.createElement("style"),{textContent:legalStyle}));

function showLegal(type){
  document.querySelector(".ec-legal-overlay")?.remove();
  const privacy = type === "privacy";
  const box = document.createElement("div");
  box.className="ec-legal-overlay";
  box.innerHTML = `<article class="ec-legal-box" role="dialog" aria-modal="true"><button class="ec-legal-close" aria-label="Schließen">×</button>
    <h1>${privacy ? "Datenschutzhinweise" : "Impressum"}</h1>
    ${privacy ? `
      <p>Diese Datenschutzhinweise beschreiben die grundlegende Verarbeitung personenbezogener Daten bei Ennstal Connect.</p>
      <h2>1. Verantwortlicher</h2><p><strong>Ennstal Connect</strong><br>Waidbachstraße 2<br>8700 Leoben, Österreich<br>E-Mail: ennsstal.connect@gmx.at</p>
      <h2>2. Welche Daten verarbeitet werden</h2><p>Je nach Nutzung können insbesondere E-Mail-Adresse, Nickname, Vor- und Nachname, Geburtsdatum, Geschlecht, Profilbild, Profilbeschreibung, Freundschaften, Nachrichten, Meldungen, Sperrungen, technische Sitzungsdaten und Angaben zur Nutzung der Community verarbeitet werden.</p>
      <h2>3. Zwecke und Rechtsgrundlagen</h2><p>Die Verarbeitung dient dem Betrieb der Community, der Benutzerverwaltung, Kommunikation, Sicherheit, Moderation und der Bereitstellung der gewünschten Funktionen. Die jeweilige Rechtsgrundlage ist insbesondere Vertragserfüllung bzw. vorvertragliche Maßnahmen, rechtliche Verpflichtungen oder – soweit erforderlich – Einwilligung bzw. berechtigte Interessen.</p>
      <h2>4. Hosting und Dienstleister</h2><p>Für Authentifizierung, Datenbank- und Speicherdienste wird Supabase eingesetzt. Personenbezogene Daten dürfen nur im erforderlichen Umfang an eingesetzte Dienstleister übermittelt werden. Die konkrete Auftragsverarbeitung und allfällige Drittlandübermittlungen sind anhand der tatsächlich verwendeten Konfiguration zu prüfen.</p>
      <h2>5. Speicherdauer</h2><p>Daten werden nur so lange gespeichert, wie sie für den jeweiligen Zweck erforderlich sind oder gesetzliche Aufbewahrungspflichten bestehen. Konkrete Löschfristen sind vom Betreiber festzulegen und entsprechend der tatsächlichen Datenhaltung zu dokumentieren.</p>
      <h2>6. Rechte betroffener Personen</h2><p>Betroffene Personen haben – soweit die gesetzlichen Voraussetzungen erfüllt sind – insbesondere Rechte auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch sowie das Recht, eine erteilte Einwilligung zu widerrufen.</p>
      <h2>7. Beschwerderecht</h2><p>Es besteht das Recht, sich bei der zuständigen Datenschutzbehörde zu beschweren.</p>
      <h2>8. Cookies und lokale Speicherung</h2><p>Technisch notwendige Speichermechanismen dürfen für Anmeldung und Sicherheit eingesetzt werden. Nicht notwendige Analyse- oder Marketingdienste dürfen erst nach Prüfung der rechtlichen Voraussetzungen aktiviert werden.</p>` : `
      <p><strong>Ennstal Connect</strong></p>
      <h2>Betreiber / Medieninhaber</h2><p><strong>Ennstal Connect</strong><br>Waidbachstraße 2<br>8700 Leoben, Österreich<br>E-Mail: ennsstal.connect@gmx.at</p>
      <h2>Verantwortlich für die Community</h2><p>Der eingetragene Global Admin ist für die Community-Organisation und Moderation verantwortlich. Die Betreiberangaben entsprechen den vom Betreiber bereitgestellten Angaben.</p>
      <h2>Unternehmensgegenstand / Zweck</h2><p>Bereitstellung und Betrieb einer regionalen Online-Community zur Vernetzung, Kommunikation und zum Austausch von Informationen und Veranstaltungen im Ennstal und Umgebung.</p>
      <h2>Haftung für Inhalte</h2><p>Für von Mitgliedern erstellte Inhalte ist grundsätzlich der veröffentlichende Nutzer verantwortlich. Rechtswidrige Inhalte können über die Meldefunktion an die Moderation gemeldet werden.</p>
      <h2>Kontakt</h2><p><strong>E-Mail:</strong> ennsstal.connect@gmx.at</p>`}
  </article>`;
  document.body.appendChild(box);
  box.querySelector(".ec-legal-close").onclick=()=>box.remove();
  box.onclick=(e)=>{if(e.target===box)box.remove()};
}

document.addEventListener("click", (event)=>{
  const button=event.target.closest(".footer-links button");
  if(!button) return;
  const label=(button.textContent||"").toLowerCase();
  if(label.includes("impressum")){event.preventDefault();event.stopImmediatePropagation();showLegal("impressum");}
  if(label.includes("datenschutz")){event.preventDefault();event.stopImmediatePropagation();showLegal("privacy");}
}, true);
