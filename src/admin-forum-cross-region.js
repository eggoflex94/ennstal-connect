let switching = false;

function switchToCrossRegion() {
  if (switching) return;
  const picker = document.querySelector('.ec-region-picker select');
  if (!picker || picker.value === 'ueberregional') return;
  const option = [...picker.options].find((item) => item.value === 'ueberregional');
  if (!option) return;
  switching = true;
  picker.value = 'ueberregional';
  picker.dispatchEvent(new Event('change', { bubbles: true }));
  setTimeout(() => { switching = false; }, 50);
}

function enhanceAdminForum() {
  document.querySelectorAll('.admin-dashboard-action').forEach((button) => {
    if (!/admin-forum/i.test(button.textContent || '') || button.dataset.ecCrossRegionBound === '1') return;
    button.dataset.ecCrossRegionBound = '1';
    button.addEventListener('pointerdown', switchToCrossRegion, true);
    button.addEventListener('click', switchToCrossRegion, true);
  });

  const page = [...document.querySelectorAll('.forum-page')].find((node) => /admin-forum/i.test(node.querySelector('h1')?.textContent || ''));
  if (!page) return;
  switchToCrossRegion();
  const heading = page.querySelector('h1');
  if (heading && !/überregional/i.test(heading.textContent || '')) heading.textContent = 'Admin-Forum · Überregional';
  const intro = page.querySelector('.page-heading p');
  if (intro) intro.textContent = 'Überregionaler interner Bereich für Administration und Moderation aller Regionen.';
}

new MutationObserver(() => requestAnimationFrame(enhanceAdminForum)).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('ec:region-change', () => requestAnimationFrame(enhanceAdminForum));
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhanceAdminForum, { once: true });
else enhanceAdminForum();
