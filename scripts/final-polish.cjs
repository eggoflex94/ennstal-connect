const fs=require('fs');
const path=require('path');
const file=path.join(process.cwd(),'src','App.jsx');
let s=fs.readFileSync(file,'utf8');

// Fix profile save for PostgreSQL text[] interests.
s=s.replace('interests: String(f.get("interests") || "").trim()', 'interests: String(f.get("interests") || "").split(",").map(x => x.trim()).filter(Boolean)');

// Make the Austrian contact address visible in the legal page.
s=s.replace('Eine veröffentlichte Kontakt-E-Mail sollte an dieser Stelle ergänzt werden.', 'Kontakt: ennsstal.connect@gmx.at');
s=s.replace('Kontakt</h2><p>Eine veröffentlichte Kontakt-E-Mail sollte an dieser Stelle ergänzt werden.</p>', 'Kontakt</h2><p><strong>E-Mail:</strong> ennsstal.connect@gmx.at</p>');

fs.writeFileSync(file,s);
