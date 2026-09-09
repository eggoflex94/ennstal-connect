from pathlib import Path
import subprocess
import re
import sys

root = Path('.')

# The original transformer already performs the large App.jsx replacement.
# Its only known failure is the brittle legacy test anchor. Accept only that
# exact failure, then finish the upgrade deterministically below.
run = subprocess.run(
    [sys.executable, 'scripts/native_community_upgrade.py'],
    text=True,
    capture_output=True,
)
combined = (run.stdout or '') + '\n' + (run.stderr or '')
print(combined)
if run.returncode != 0 and 'community core audit anchor missing' not in combined:
    raise SystemExit(run.returncode)

# Update the audit for the new homepage rule: regional tables stay strictly
# region-filtered, while homepage_sections intentionally includes GLOBAL rows.
test_path = root / 'test/community-core-audit.test.mjs'
test = test_path.read_text(encoding='utf-8')
old_tables = 'for (const table of ["homepage_sections", "news", "community_events", "community_ads", "forum_posts", "community_requests"]) {'
new_tables = 'for (const table of ["news", "community_events", "community_ads", "forum_posts", "community_requests"]) {'
if old_tables in test:
    test = test.replace(old_tables, new_tables, 1)
homepage_assert = '  assert.match(app, /from\\("homepage_sections"\\)[\\s\\S]{0,300}publication_scope\\.eq\\.GLOBAL/);\n'
marker = '}\n});\n\ntest("React-owned home DOM is not rewritten by the removed regional event runtime"'
regional_test_start = test.find('test("regional content sources use the active region"')
if regional_test_start < 0:
    raise SystemExit('regional content audit not found')
marker_pos = test.find(marker, regional_test_start)
if marker_pos < 0:
    raise SystemExit('regional content audit end not found')
if 'publication_scope\\.eq\\.GLOBAL' not in test[regional_test_start:marker_pos]:
    test = test[:marker_pos] + homepage_assert + test[marker_pos:]
test_path.write_text(test, encoding='utf-8')

# Remove old DOM-authority runtimes now that React owns these surfaces.
main_path = root / 'src/main.jsx'
main = main_path.read_text(encoding='utf-8')
for stale in [
    'import "./community-direct-fix.css";\n',
    'import "./community-direct-fix.js";\n',
    "import './community-direct-fix.css';\n",
    "import './community-direct-fix.js';\n",
    'import "./community-core-authority.css";\n',
    'import "./community-core-authority.js";\n',
]:
    main = main.replace(stale, '')
anchor = 'import "./community-native-final.css";'
if 'community-native-editor.css' not in main:
    if anchor not in main:
        raise SystemExit('native stylesheet import anchor missing')
    main = main.replace(anchor, anchor + '\nimport "./community-native-editor.css";', 1)
main_path.write_text(main, encoding='utf-8')

# Regional shell may still decorate member cards, but it must no longer decide
# which region is visible. React's new directory filters are authoritative.
shell_path = root / 'src/regional-shell.js'
shell = shell_path.read_text(encoding='utf-8')
old_hide = 'card.hidden=!searching&&p.home_region_id!==activeRegion.id;'
if old_hide in shell:
    shell = shell.replace(old_hide, 'card.hidden=false;', 1)
shell_path.write_text(shell, encoding='utf-8')

css_path = root / 'src/community-native-editor.css'
css_path.write_text(r'''/* Native React member directory and homepage design editor. */
.member-directory-native{min-width:0}.member-directory-heading{margin-bottom:18px}
.member-directory-controls{display:grid;grid-template-columns:minmax(320px,1.6fr) minmax(240px,.8fr);gap:16px 20px;align-items:end;margin-bottom:22px;padding:20px}
.member-directory-controls label{display:grid;gap:7px;font-weight:800;color:#183149}.member-directory-controls input,.member-directory-controls select{width:100%;min-height:48px;border:1px solid #cbd8e5;border-radius:13px;background:#fff;padding:0 14px;font:inherit}
.member-directory-controls .member-online-filter{display:flex;align-items:center;gap:10px;min-height:48px}.member-directory-controls .member-online-filter input{width:20px;min-height:20px;height:20px}
.member-directory-quick{grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:center;gap:10px}.member-directory-quick strong{margin-left:auto;padding:9px 12px;border-radius:999px;background:#e8f0f6;color:#173149}
.member-directory-native .member-card[hidden]{display:flex!important}.member-directory-native .ec-region-context{display:none!important}
.homepage-editor-native{margin:24px 0;border-radius:18px;overflow:visible}.homepage-editor-native>summary{cursor:pointer;padding:16px 18px;font-weight:900;background:#fff;border:1px solid #d8e2eb;border-radius:16px}
.homepage-editor-layout{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(360px,.85fr);gap:22px;margin-top:16px;align-items:start}.homepage-design-form{display:grid;gap:14px;padding:22px}
.homepage-design-form>label,.homepage-editor-grid label{display:grid;gap:7px;font-weight:800;color:#173149}.homepage-design-form input,.homepage-design-form textarea,.homepage-design-form select{width:100%;border:1px solid #cbd8e5;border-radius:13px;background:#fff;padding:12px 14px;font:inherit;color:#14283a}
.homepage-design-form textarea{resize:vertical;min-height:150px}.homepage-design-form input[type=color]{min-height:48px;padding:5px}.homepage-editor-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.homepage-typography-grid{grid-template-columns:minmax(0,1.3fr) minmax(110px,.7fr) minmax(110px,.7fr)}
.homepage-image-picker{padding:12px 14px;border:1px dashed #a9bccb;border-radius:13px;background:#f7fafc}.homepage-image-picker input{padding:8px 0 0;border:0;background:transparent}.homepage-live-preview{position:sticky;top:84px;display:grid;gap:10px}.homepage-live-preview .homepage-frame{margin:0;min-height:260px}
.homepage-frame>div h2{line-height:1.16;overflow-wrap:anywhere}.homepage-frame>div p{line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}.content-editor-dialog select,.content-editor-dialog input[type=number],.content-editor-dialog input[type=color]{width:100%;min-height:46px}
@media(max-width:1050px){.homepage-editor-layout,.member-directory-controls{grid-template-columns:1fr}.homepage-live-preview{position:static}.homepage-typography-grid{grid-template-columns:1fr 1fr}.member-directory-quick{grid-column:1}}
''', encoding='utf-8')

print('native community upgrade finished')
