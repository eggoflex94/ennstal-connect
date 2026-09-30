// Legacy automated-message DOM decorator disabled.
// React owns chat/message children; moving or replacing them can corrupt reconciliation
// and trigger browser NotFoundError exceptions. Automated messages continue to render
// through the React message components and database message_type metadata.
export {};
