// Legacy home dashboard DOM rewriter disabled.
// React owns the home action buttons. Removing or reparenting those nodes can
// invalidate React's sibling references and trigger insertBefore NotFoundError.
// Styling remains in home-dashboard-modern-buttons.css.
export {};
