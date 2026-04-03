/**
 * Bullhorn CRM integration — stub module.
 * Bullhorn API is not available (no CLIENT_SECRET).
 * All checks are done manually via Chrome browser.
 * This module returns safe defaults so the pipeline runs without errors.
 */

function isConfigured() {
  return false;
}

async function checkCompany() {
  return { found: false };
}

module.exports = { checkCompany, isConfigured };
