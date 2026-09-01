const fs = require('fs');
const path = require('path');

// The source code is now kept valid directly in src/App.jsx.
// This release hook intentionally does not rewrite React source code.
const file = path.join(process.cwd(), 'src', 'App.jsx');
if (!fs.existsSync(file)) throw new Error('src/App.jsx fehlt.');
