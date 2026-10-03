// Legacy event-form injection is disabled because React owns the form.
// Event creation now uses App.jsx and the active region directly.
function eventForm(){
  return document.querySelector('.admin-community-tools form');
}
async function ensureRegionSelect(){
  const form=eventForm();
  if(!form)return;
  // Async DOM enhancers must revalidate before any mutation.
  if(!form.isConnected || form !== eventForm())return;
}
export { eventForm, ensureRegionSelect };
