import './profile-photo-album-modern.css';
import './profile-photo-album-modern.js';

// Compatibility loader only.
// Uploads stay fully owned by the React handlers in App.jsx. Do not patch
// Supabase Storage or global file/change events here, because those hooks can
// affect unrelated uploads and destabilize the whole application.
