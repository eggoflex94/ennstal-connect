// Legacy Head Admin profile relabeler disabled.
// The React UI already renders the Hauptadmin label and role star. Mutating
// React-owned text nodes and prepending images here can race reconciliation and
// cause insertBefore NotFoundError in Chromium/WebKit.
export {};
