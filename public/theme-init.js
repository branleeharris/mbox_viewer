// Apply the saved theme before first paint to avoid a light flash in dark mode.
// Kept as an external file so the production CSP can forbid inline scripts.
try {
  var t = localStorage.getItem('mbox-theme') || 'system';
  var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
} catch (e) {}
