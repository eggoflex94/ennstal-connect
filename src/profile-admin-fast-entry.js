// Legacy profile Admin Tools DOM observer disabled.
// Admin and moderation controls are rendered by React in App.jsx.
// Directly adding/removing buttons with MutationObserver caused stale profile
// actions to be remounted while another profile was rendering.
export {};
