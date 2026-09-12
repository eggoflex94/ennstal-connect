// Legacy member profile DOM renderer disabled.
// React in App.jsx/ProfileSections.jsx is the single owner of the member profile UI.
// The previous implementation injected a second profile layout, repeated the bio,
// queried the member directory/regions again, and watched the whole DOM with a
// MutationObserver. That caused the old design overlay and unnecessary profile load.
export {};
