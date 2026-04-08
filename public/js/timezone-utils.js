/* Timezone utility — converts all displayed times to Austin, TX (US Central Time) */

const CENTRAL_TZ = 'America/Chicago';

/**
 * Format a date string or Date object in Central Time (America/Chicago).
 * @param {string|Date} dateStr - ISO date string or Date object
 * @param {Object} [opts] - Additional Intl.DateTimeFormat options to merge
 * @returns {string} Formatted date string in Central Time
 */
function formatCentralDate(dateStr, opts = {}) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const defaults = { month: 'short', day: 'numeric', year: 'numeric', timeZone: CENTRAL_TZ };
  return d.toLocaleDateString('en-US', { ...defaults, ...opts });
}

/**
 * Format a date string or Date object with time in Central Time.
 * @param {string|Date} dateStr - ISO date string or Date object
 * @returns {string} Formatted date+time string in Central Time
 */
function formatCentralDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: CENTRAL_TZ,
  });
}

/**
 * Get today's date string (YYYY-MM-DD) in Central Time.
 * Useful for filenames and labels that reference "today".
 * @returns {string} e.g. "2026-04-08"
 */
function getCentralDateISO() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    timeZone: CENTRAL_TZ,
  }).format(new Date());
  return parts; // en-CA format is YYYY-MM-DD
}
