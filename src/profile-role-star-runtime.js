// Legacy profile role-star DOM mutator disabled.
// React renders role stars natively. Injecting <img> nodes with prepend() into
// React-owned role badges can invalidate React sibling references and surface
// as insertBefore NotFoundError during reconciliation.
export {};
