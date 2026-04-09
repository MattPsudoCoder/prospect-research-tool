/* Dark mode toggle — shared across all pages */
(function () {
  var toggle = document.getElementById('darkToggle');
  if (!toggle) return;

  function isDark() {
    return localStorage.getItem('darkMode') === 'on';
  }

  function applyTheme(dark) {
    document.documentElement.classList.toggle('dark-mode', dark);
    document.body.classList.toggle('dark-mode', dark);
    toggle.textContent = dark ? 'Light Mode' : 'Dark Mode';
  }

  applyTheme(isDark());

  toggle.addEventListener('click', function () {
    var dark = !isDark();
    localStorage.setItem('darkMode', dark ? 'on' : 'off');
    applyTheme(dark);
  });
})();
