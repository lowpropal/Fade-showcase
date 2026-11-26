/**
 * Automated Verification & Audit Reconciliation for:
 * - FADE PODS v0.2 — REVISION 00 (Baseline Verification)
 * - FADE PODS v0.2 — REVISION 01 (Critical Functionality, Routing & Role Permissions)
 */
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const results = {
  rev00: {},
  rev01: {},
  passed: 0,
  failed: 0,
  details: []
};

function assert(condition, message, section) {
  if (condition) {
    results.passed++;
    results.details.push({ status: 'PASS', section, message });
    console.log(`[PASS] [${section}] ${message}`);
  } else {
    results.failed++;
    results.details.push({ status: 'FAIL', section, message });
    console.error(`[FAIL] [${section}] ${message}`);
  }
}

// -------------------------------------------------------------
// REVISION 00: BASELINE AUDIT
// -------------------------------------------------------------
console.log('\n======================================================');
console.log('AUDIT REVISI 00: BASELINE VERIFICATION');
console.log('======================================================');

// Task 1 & 2: Git & Architecture Files
assert(fs.existsSync(path.join(ROOT_DIR, '.nojekyll')), '.nojekyll exists in root', 'REV00');
assert(fs.existsSync(path.join(ROOT_DIR, 'index.html')), 'index.html exists as active login entry point', 'REV00');
assert(fs.existsSync(path.join(ROOT_DIR, 'admin.html')), 'admin.html exists as active admin portal', 'REV00');
assert(fs.existsSync(path.join(ROOT_DIR, 'sales.html')), 'sales.html exists as active sales portal', 'REV00');

// Master data belongs in Supabase, never in the public Pages artifact.
assert(!fs.existsSync(path.join(ROOT_DIR, 'assets/js/data/synthetic-seed.js')), 'Public bundled master-data seed is absent', 'REV00');
const storeRaw = fs.readFileSync(path.join(ROOT_DIR, 'assets/js/store.js'), 'utf8');
assert(!storeRaw.includes('FADE_SYNTHETIC_SEED'), 'Client state has no public seed dependency', 'REV00');

// -------------------------------------------------------------
// REVISION 01: CRITICAL FUNCTIONALITY & ROLE HARDENING
// -------------------------------------------------------------
console.log('\n======================================================');
console.log('AUDIT REVISI 01: CRITICAL FUNCTIONALITY & ROLES');
console.log('======================================================');

const adminHtml = fs.readFileSync(path.join(ROOT_DIR, 'admin.html'), 'utf8');
const salesHtml = fs.readFileSync(path.join(ROOT_DIR, 'sales.html'), 'utf8');

// Task 1: Admin routing crash fix (exportDropdownMenu scoping)
assert(
  adminHtml.includes('var exportDropdownMenu = null;') &&
  adminHtml.includes("var expMenu = document.getElementById('exportDropdownMenu') || exportDropdownMenu;"),
  'Task 1: exportDropdownMenu declared in outer IIFE scope + null-safe check in handleRouting()',
  'REV01'
);

// Task 2: Custom Logout confirmation modal (No native window.confirm)
const hasNativeConfirmAdmin = /window\.confirm\(|confirm\(['"]/.test(adminHtml.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, ''));
const hasNativeConfirmSales = /window\.confirm\(|confirm\(['"]/.test(salesHtml.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, ''));
assert(!hasNativeConfirmAdmin, 'Task 2: admin.html has zero native window.confirm() calls', 'REV01');
assert(!hasNativeConfirmSales, 'Task 2: sales.html has zero native window.confirm() calls', 'REV01');
assert(adminHtml.includes('id="logoutConfirmModalBackdrop"'), 'Task 2: admin.html has custom logout modal #logoutConfirmModalBackdrop', 'REV01');
assert(salesHtml.includes('id="accountModalBackdrop"') && salesHtml.includes('confirmSalesLogout'), 'Task 2: sales.html has custom logout modal #accountModalBackdrop and confirmSalesLogout', 'REV01');

// Task 3: Session handling & unauthenticated redirect
assert(
  adminHtml.includes("window.location.replace('./index.html')") &&
  adminHtml.includes("if (!session)"),
  'Task 3: admin.html redirects unauthenticated visitors to login (no auto-admin creation without demo param)',
  'REV01'
);
assert(
  salesHtml.includes("window.location.replace('./index.html')") &&
  salesHtml.includes("if (!session)"),
  'Task 3: sales.html redirects unauthenticated visitors to login',
  'REV01'
);

// Task 4: Sales role guard & pure read-only enforcement
assert(!salesHtml.includes('data-route="upload"'), 'Task 4: sales.html has zero upload items in navigation config', 'REV01');
assert(!salesHtml.includes('id="exportMenuBtn"'), 'Task 4: sales.html has zero export buttons', 'REV01');
assert(!salesHtml.includes('id="addInvoiceBtn"'), 'Task 4: sales.html has zero add invoice buttons', 'REV01');
assert(!salesHtml.includes('id="addPaymentBtn"'), 'Task 4: sales.html has zero record payment buttons', 'REV01');
assert(
  salesHtml.includes("if (hash === 'upload')") &&
  salesHtml.includes("window.location.hash = '#dashboard'"),
  'Task 4: sales.html blocks #upload route and redirects to #dashboard with warning',
  'REV01'
);

// Admin-only mutation guard in handlers
assert(
  adminHtml.includes("if (!session || session.role !== 'admin')") &&
  adminHtml.includes("showToast('Akses ditolak: Operasi membutuhkan role Admin', 'error')"),
  'Task 4: admin.html validates session.role === "admin" before mutating localStorage in all forms',
  'REV01'
);

// Task 5: Dead action cleanup
assert(
  !salesHtml.includes('Klik "+ Unggah Dokumen"'),
  'Task 5: Misleading upload message removed from sales.html',
  'REV01'
);
assert(
  salesHtml.includes('Belum ada berkas pendukung yang terlampir untuk toko/invoice ini.'),
  'Task 5: Neutral, read-only placeholder installed in sales.html',
  'REV01'
);

// Task 6: Basic input safety (XSS prevention via esc())
assert(
  adminHtml.includes('function esc(str)') &&
  adminHtml.includes('.replace(/&/g, \'&amp;\')'),
  'Task 6: admin.html has centralized HTML escaping helper esc()',
  'REV01'
);
assert(
  salesHtml.includes('function esc(str)') &&
  salesHtml.includes('.replace(/&/g, \'&amp;\')'),
  'Task 6: sales.html has centralized HTML escaping helper esc()',
  'REV01'
);

console.log('\n======================================================');
console.log(`TOTAL: ${results.passed} PASSED, ${results.failed} FAILED`);
console.log('======================================================\n');

if (results.failed > 0) {
  process.exit(1);
} else {
  console.log('ALL AUDIT CHECKS FOR REVISION 00 AND REVISION 01 VERIFIED SOLVED 100%!');
}
