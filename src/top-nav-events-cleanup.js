function removeEventsButton() {
  document.querySelectorAll('.ec-top-nav [data-ec-page="events"]').forEach((button) => button.remove());
  document.querySelectorAll('.ec-mobile-nav-rail [data-ec-page="events"]').forEach((button) => button.remove());
}

let queued = false;
function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    removeEventsButton();
  });
}

new MutationObserver(schedule).observe(document.documentElement, { childList:true, subtree:true });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once:true });
else schedule();
