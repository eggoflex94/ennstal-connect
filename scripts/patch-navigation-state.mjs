import fs from 'node:fs';

const path = new URL('../src/App.jsx', import.meta.url);
let source = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

const oldPageState = '  const [page, setPage] = useState("home");';
const newPageState = `  const [page, setPage] = useState(() => {
    try {
      const requested = sessionStorage.getItem("ec-recovery-page");
      sessionStorage.removeItem("ec-recovery-page");
      const allowed = new Set(["home","members","forum","groups","community","news","profile","messages","friends","friend-requests","blocked","admin"]);
      return allowed.has(requested) ? requested : "home";
    } catch {
      return "home";
    }
  });`;

if (!source.includes(oldPageState)) throw new Error('[navigation state] page state anchor not found');
source = source.replace(oldPageState, newPageState);

fs.writeFileSync(path, source, 'utf8');
console.log('[navigation state] recovery page state installed');
