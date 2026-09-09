from pathlib import Path

app = Path('src/App.jsx')
text = app.read_text()

old = '''    const layout = document.createElement("section"); layout.className = "layout-rewards";
    const freeLayouts = isAdmin(profile?.role) || profile?.role === "SUPPORTER" || profile?.account_badge === "BUSINESS";
    const hours = Math.floor(Number(profile.total_online_seconds || 0) / 3600);
    layout.innerHTML = `<span class="eyebrow">LAYOUT & BELOHNUNGEN</span><h3>Dein Community-Design</h3><p>${freeLayouts ? "Deine Rolle erlaubt die freie Layoutwahl." : `Onlinezeit: ${hours} Stunden · Weitere Designs werden durch aktive Community-Zeit freigeschaltet.`}</p>`;
    const layoutSelect = document.createElement("select"); layoutSelect.name = "profile_layout";
    [["standard", "Standard – Ennstal", 0], ["alpine", "Alpen – Berggrün", 5], ["aurora", "Aurora – Violett", 20], ["ocean", "Ozean – Tiefblau", 35], ["slate", "Schiefer – Anthrazit", 50], ["ember", "Ember – Warmes Orange", 70], ["redwood", "Bergrot – Alpinrot", 90], ["lavender", "Lavendel – Sanftes Violett", 110], ["midnight", "Mitternacht – Nachtblau", 130], ["sunrise", "Sonnenaufgang – Goldrosa", 150], ["neon", "Neon Connect – Leuchtfarben", 180]].forEach(([value, label, requiredHours]) => { const option = document.createElement("option"); option.value = value; option.textContent = `${label}${freeLayouts || hours >= requiredHours ? "" : ` · ab ${requiredHours} Stunden`}`; option.disabled = !freeLayouts && hours < requiredHours; layoutSelect.appendChild(option); });
    layoutSelect.value = profile.profile_layout || "standard"; layout.appendChild(layoutSelect); form.querySelector(".primary-button")?.before(layout);'''
new = '''    const layout = document.createElement("section"); layout.className = "layout-rewards";
    layout.innerHTML = `<span class="eyebrow">COMMUNITY-DESIGN</span><h3>Dein Layout</h3><p>Der Aufbau bleibt immer gleich. Du wählst nur zwischen dem Standarddesign und zwei einheitlichen Farbvarianten.</p>`;
    const layoutSelect = document.createElement("select"); layoutSelect.name = "profile_layout";
    [["standard", "Standard – Ennstal Connect"], ["theme-red", "Connect Rot – Hellrot"], ["theme-blue", "Connect Blau – Kräftig"]].forEach(([value, label]) => { const option = document.createElement("option"); option.value = value; option.textContent = label; layoutSelect.appendChild(option); });
    layoutSelect.value = ["standard", "theme-red", "theme-blue"].includes(profile.profile_layout) ? profile.profile_layout : "standard"; layout.appendChild(layoutSelect); form.querySelector(".primary-button")?.before(layout);'''
if old in text:
    text = text.replace(old, new, 1)
elif 'Connect Rot – Hellrot' not in text:
    raise SystemExit('Layout selector source block not found')

old_hours = '    const layoutHours = { standard: 0, alpine: 5, aurora: 20, ocean: 35, slate: 50, ember: 70, redwood: 90, lavender: 110, midnight: 130, sunrise: 150, neon: 180 };'
new_hours = '    const layoutHours = { standard: 0, "theme-red": 0, "theme-blue": 0 };'
if old_hours in text:
    text = text.replace(old_hours, new_hours, 1)
elif new_hours not in text:
    raise SystemExit('Layout unlock map not found')

old_root = '  return <div className={`app layout-${profile?.profile_layout || "standard"}`}>\n'
new_root = '  return <div className={`app layout-${["theme-red", "theme-blue"].includes(profile?.profile_layout) ? profile.profile_layout : "standard"}`}>\n'
if old_root in text:
    text = text.replace(old_root, new_root, 1)
elif new_root not in text:
    raise SystemExit('App layout root not found')

app.write_text(text)

main = Path('src/main.jsx')
m = main.read_text()
anchor = 'import "./desktop-on-phone.css";'
replacement = 'import "./desktop-on-phone.css";\n\n/* Final theme layer: same structure, only Standard / Rot / Blau. */\nimport "./standard-theme-variants.css";\nimport "./standard-theme-runtime.js";'
if 'standard-theme-variants.css' not in m:
    if anchor not in m:
        raise SystemExit('main.jsx theme import anchor missing')
    m = m.replace(anchor, replacement, 1)
main.write_text(m)
