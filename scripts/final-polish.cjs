const fs = require("fs");
const path = require("path");

// Kept only for backwards-compatible build configurations. Source files are
// intentionally never modified during a release build.
const file = path.join(process.cwd(), "src", "App.jsx");
if (!fs.existsSync(file)) throw new Error("src/App.jsx fehlt.");
