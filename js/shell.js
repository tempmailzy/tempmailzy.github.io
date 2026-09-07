/* =========================================================
   Mailzy — shared page shell (header + sidebar)
   Runs on EVERY page (the app page and every content page) —
   theme toggle, the off-canvas sidebar on narrow viewports, and
   the footer year. js/app.js (index.html only) calls
   MailzyShell.closeSidebar() after "Generate New" instead of
   re-implementing this.
   ========================================================= */
(function () {
  'use strict';

  const fy = document.getElementById('footerYear');
  if (fy) fy.textContent = new Date().getFullYear();

  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeToggleIcon = document.getElementById('themeToggleIcon');
  const themeToggleLabel = document.getElementById('themeToggleLabel');

  /** Theme is UI-only state, unrelated to the mailbox-session rule
   *  elsewhere — persisting it in localStorage is fine. Each page's
   *  own inline <script> already set the initial data-theme
   *  attribute before first paint; this just keeps the toggle in
   *  sync with it and handles clicks. */
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('theme', theme);
    } catch {
      // Private browsing / storage disabled — theme just won't persist.
    }
    if (themeToggleIcon) themeToggleIcon.textContent = theme === 'light' ? '☀️' : '🌙';
    if (themeToggleLabel) themeToggleLabel.textContent = theme === 'light' ? 'Light Mode' : 'Dark Mode';
    if (themeToggleBtn) themeToggleBtn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
  }

  function toggleTheme() {
    const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    applyTheme(current === 'light' ? 'dark' : 'light');
  }

  if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

  const sidebar = document.getElementById('sidebar');
  const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
  const sidebarScrim = document.getElementById('sidebarScrim');

  function openSidebar() {
    if (!sidebar) return;
    sidebar.classList.add('is-open');
    if (sidebarScrim) sidebarScrim.hidden = false;
    if (sidebarToggleBtn) sidebarToggleBtn.setAttribute('aria-expanded', 'true');
  }

  function closeSidebar() {
    if (!sidebar) return;
    sidebar.classList.remove('is-open');
    if (sidebarScrim) sidebarScrim.hidden = true;
    if (sidebarToggleBtn) sidebarToggleBtn.setAttribute('aria-expanded', 'false');
  }

  if (sidebarToggleBtn) {
    sidebarToggleBtn.addEventListener('click', () => {
      if (sidebar.classList.contains('is-open')) closeSidebar();
      else openSidebar();
    });
  }
  if (sidebarScrim) sidebarScrim.addEventListener('click', closeSidebar);

  window.MailzyShell = { applyTheme, toggleTheme, openSidebar, closeSidebar };
})();
