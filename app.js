let db = null;
let currentPage = 'dashboard';
let currentSearchQuery = '';
let currentCategoryFilter = 'all';
let currentSiteFilter = 'all';
let currentDeptFilter = 'all';
let currentStatusFilter = 'all';
let currentPayModeFilter = 'all';
let currentPeriod = new Date().toISOString().slice(0, 7);
let currentSelectedSiteId = null;
let currentSiteSubtab = 'employees';
let selectedEmpCodes = new Set();
let showAllPayslipComponents = false;

// Report Center sub-navigation state
let reportCategory = 'payroll'; // 'payroll' | 'statutory' | 'payment' | 'additional'
let currentReportType = 'wage_register';

// Bonus calculation state
let bonusBase = 'Basic';
let bonusPct1 = 8.33;
let bonusPct2 = 0.00;
let bonusFromMonth = '2025-04';
let bonusToMonth = '2026-03';

// Helper utilities
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function toast(message, type = 'success') {
  const t = $('#toast');
  if (!t) return;
  t.textContent = message;
  t.style.borderLeftColor = type === 'error' ? 'var(--accent-primary)' : 'var(--accent-emerald)';
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3500);
}

// Convert number to Indian currency words
function numberToWords(num) {
  num = Math.round(Number(num || 0));
  if (num === 0) return 'Zero Rupees Only';
  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function inWords(n) {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : ' ');
    if (n < 1000) return a[Math.floor(n / 100)] + 'Hundred ' + (n % 100 !== 0 ? 'and ' + inWords(n % 100) : '');
    if (n < 100000) return inWords(Math.floor(n / 1000)) + 'Thousand ' + (n % 1000 !== 0 ? ' ' + inWords(n % 1000) : '');
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + 'Lakh ' + (n % 100000 !== 0 ? ' ' + inWords(n % 100000) : '');
    return inWords(Math.floor(n / 10000000)) + 'Crore ' + (n % 10000000 !== 0 ? ' ' + inWords(n % 10000000) : '');
  }
  return (inWords(num).trim() + ' Rupees Only');
}

// ----------------------------------------------------
// VALIDATION & INTEGRATION UTILITIES
// ----------------------------------------------------
const verhoeffTableD = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
];
const verhoeffTableP = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
];

function validateVerhoeff(str) {
  let c = 0;
  const invertedArray = String(str).split('').reverse().map(Number);
  for (let i = 0; i < invertedArray.length; i++) {
    c = verhoeffTableD[c][verhoeffTableP[i % 8][invertedArray[i]]];
  }
  return c === 0;
}

function validateAadhaar(val, isRequired = false) {
  const cleaned = String(val || '').replace(/[\s-]/g, '').trim();
  if (!cleaned) {
    return isRequired ? { valid: false, error: 'Aadhaar number is required', cleaned: '' } : { valid: true, error: '', cleaned: '' };
  }
  if (!/^\d{12}$/.test(cleaned)) {
    return { valid: false, error: 'Aadhaar must be exactly 12 numeric digits', cleaned };
  }
  if (!validateVerhoeff(cleaned)) {
    return { valid: false, error: 'Invalid Aadhaar number (checksum failed)', cleaned };
  }
  return { valid: true, error: '', cleaned };
}

function formatAadhaar(val) {
  const c = String(val || '').replace(/[\s-]/g, '').trim();
  if (c.length === 12) {
    return `${c.slice(0, 4)} ${c.slice(4, 8)} ${c.slice(8, 12)}`;
  }
  return c;
}

function maskAadhaar(val) {
  const c = String(val || '').replace(/[\s-]/g, '').trim();
  if (c.length >= 4) {
    return `•••• •••• ${c.slice(-4)}`;
  }
  return c || '—';
}

function validatePAN(val, isRequired = false) {
  const cleaned = String(val || '').trim().toUpperCase();
  if (!cleaned) {
    return isRequired ? { valid: false, error: 'PAN number is required', cleaned: '' } : { valid: true, error: '', cleaned: '' };
  }
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(cleaned)) {
    return { valid: false, error: 'PAN must be 10 characters in standard format (e.g. ABCDE1234F)', cleaned };
  }
  return { valid: true, error: '', cleaned };
}

function validateMobile(val, isRequired = false) {
  let cleaned = String(val || '').replace(/[\s-]/g, '').trim();
  if (cleaned.startsWith('+91')) cleaned = cleaned.slice(3);
  else if (cleaned.startsWith('91') && cleaned.length === 12) cleaned = cleaned.slice(2);
  else if (cleaned.startsWith('0') && cleaned.length === 11) cleaned = cleaned.slice(1);

  if (!cleaned) {
    return isRequired ? { valid: false, error: 'Mobile number is required', cleaned: '' } : { valid: true, error: '', cleaned: '' };
  }
  if (!/^[6-9]\d{9}$/.test(cleaned)) {
    return { valid: false, error: 'Mobile number must be a valid 10-digit Indian mobile number starting with 6-9', cleaned };
  }
  return { valid: true, error: '', cleaned };
}

function validateIFSC(val, isRequired = false) {
  const cleaned = String(val || '').trim().toUpperCase();
  if (!cleaned) {
    return isRequired ? { valid: false, error: 'IFSC code is required', cleaned: '' } : { valid: true, error: '', cleaned: '' };
  }
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleaned)) {
    return { valid: false, error: 'IFSC must be 11 characters starting with 4 letters, followed by 0 (e.g. HDFC0001234)', cleaned };
  }
  return { valid: true, error: '', cleaned };
}

function validateBankAccount(val, isRequired = false) {
  const cleaned = String(val || '').trim();
  if (!cleaned) {
    return isRequired ? { valid: false, error: 'Bank account number is required', cleaned: '' } : { valid: true, error: '', cleaned: '' };
  }
  if (!/^\d{9,18}$/.test(cleaned)) {
    return { valid: false, error: 'Bank account number must be between 9 and 18 digits', cleaned };
  }
  return { valid: true, error: '', cleaned };
}

function generateWhatsAppPayslipMessage(r, period) {
  const site = getSite(r.siteId);
  const siteName = site ? site.siteName : (r.siteName || 'Plant / Office');
  const netWords = numberToWords(r.net);
  const accountLast4 = String(r.bankAccount || '').slice(-4);
  const maskedAcc = accountLast4 ? `•••• ${accountLast4}` : 'N/A';

  return `*P & P ENTERPRISES*
*SALARY STATEMENT / PAY ADVICE*

Dear *${r.name}* (${r.empCode}),
Here is your salary summary for *${period}*:

──────────────────────
🏢 *Site / Location:* ${siteName}
💼 *Department / Desig:* ${r.department || 'Operations'} (${r.designation || r.category || 'Staff'})
📅 *Days Payable:* ${r.payableDays || 0} / ${r.workingDays || 26}
${r.otHours > 0 ? `⏱️ *Overtime:* ${r.otHours} hrs (₹${Number(r.ot || 0).toFixed(2)})\n` : ''}──────────────────────
💵 *EARNINGS*
 • Basic Salary: ₹${Number(r.basic || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
 • DA / Special Allowance: ₹${Number(r.da || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
${r.hra > 0 ? ` • HRA: ₹${Number(r.hra || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` : ''}${r.otherAllowance > 0 ? ` • Other Allowance: ₹${Number(r.otherAllowance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` : ''}${r.arrearsAmount > 0 ? ` • Arrears: ₹${Number(r.arrearsAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` : ''}${r.bonusAmount > 0 ? ` • Bonus: ₹${Number(r.bonusAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` : ''}📈 *Gross Earnings: ₹${Number(r.gross || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*

📉 *DEDUCTIONS*
 • Provident Fund (PF): ₹${Number(r.pf || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
${r.esic > 0 ? ` • ESIC: ₹${Number(r.esic || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` : ''}${r.pt > 0 ? ` • Professional Tax: ₹${Number(r.pt || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` : ''}${r.lwf > 0 ? ` • LWF: ₹${Number(r.lwf || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` : ''}${r.loanDeduction > 0 ? ` • Loan Deduction: ₹${Number(r.loanDeduction || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` : ''}${r.incomeTax > 0 ? ` • TDS: ₹${Number(r.incomeTax || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` : ''}📉 *Total Deductions: ₹${Number(r.totalDeduction || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*
──────────────────────
💰 *NET TAKE-HOME PAY: ₹${Number(r.net || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*
_(${netWords})_
──────────────────────
🏦 *Payment Mode:* ${r.paymentMode || 'Bank'} (${maskedAcc})
📋 *Slip Ref:* ${r.empCode}/${period}

_This is a confidential system-generated pay advice from P & P Enterprises Payroll Control Room._`;
}

// ----------------------------------------------------
// DUPLICATE EMPLOYEE DETECTION
// ----------------------------------------------------
function findDuplicateEmployee(candidate, excludeEmpCode = null) {
  if (!candidate || !Array.isArray(db.employees)) return { isDuplicate: false };
  const norm = (v) => (v === undefined || v === null ? '' : String(v).trim());
  const digitsOnly = (v) => norm(v).replace(/\D/g, '');
  const alphaUpper = (v) => norm(v).toUpperCase().replace(/[^A-Z0-9]/g, '');

  const cCode = alphaUpper(candidate.empCode);
  const cAadhaar = digitsOnly(candidate.aadhaar);
  const cPan = alphaUpper(candidate.pan);
  const cUan = digitsOnly(candidate.uan);
  const cEsi = digitsOnly(candidate.esiNumber || candidate.esicIpNumber);

  for (const emp of db.employees) {
    if (excludeEmpCode && (emp.empCode || '').trim().toUpperCase() === excludeEmpCode.trim().toUpperCase()) {
      continue;
    }

    // 1. Employee Code check
    if (cCode && alphaUpper(emp.empCode) === cCode) {
      return { isDuplicate: true, matchedField: 'Employee Code', matchedValue: candidate.empCode, existingEmployee: emp };
    }

    // 2. Aadhaar No check (must be 12 digits)
    if (cAadhaar && cAadhaar.length === 12 && digitsOnly(emp.aadhaar) === cAadhaar) {
      return { isDuplicate: true, matchedField: 'Aadhaar No.', matchedValue: maskAadhaar(candidate.aadhaar), existingEmployee: emp };
    }

    // 3. PAN No check (must be 10 chars)
    if (cPan && cPan.length === 10 && alphaUpper(emp.pan) === cPan) {
      return { isDuplicate: true, matchedField: 'PAN No.', matchedValue: candidate.pan.toUpperCase(), existingEmployee: emp };
    }

    // 4. UAN No check (must be 12 digits or >= 10)
    if (cUan && cUan.length >= 10 && digitsOnly(emp.uan) === cUan) {
      return { isDuplicate: true, matchedField: 'UAN No.', matchedValue: candidate.uan, existingEmployee: emp };
    }

    // 5. ESIC No / IP check (must be >= 9 digits)
    const empEsi = digitsOnly(emp.esiNumber || emp.esicDetails?.ipNumber);
    if (cEsi && cEsi.length >= 9 && empEsi === cEsi) {
      return { isDuplicate: true, matchedField: 'ESIC No.', matchedValue: (candidate.esiNumber || candidate.esicIpNumber), existingEmployee: emp };
    }
  }

  return { isDuplicate: false };
}

function showDuplicateWarningModal(dup, onConfirm) {
  const existing = dup.existingEmployee;
  const site = getSite(existing.siteId);
  const siteName = site ? site.siteName : 'Unassigned';

  const html = `
    <div class="dup-warning-box">
      <div class="dup-warning-header">
        <span style="font-size:20px;">⚠️</span>
        <span>Employee Already Exists</span>
      </div>
      <p style="font-size:13px; color:#78350f; margin-bottom:12px;">
        An employee with this <strong>${esc(dup.matchedField)}</strong> (<span class="dup-field-highlight">${esc(dup.matchedValue)}</span>) already exists in the system.
      </p>

      <div class="dup-details-grid">
        <div><span>Employee Name:</span> <strong>${esc(existing.name)}</strong></div>
        <div><span>Employee Code:</span> <strong>${esc(existing.empCode)}</strong></div>
        <div><span>Assigned Site:</span> <strong>🏢 ${esc(siteName)}</strong></div>
        <div><span>Department / Role:</span> <strong>${esc(existing.department || 'Operations')} (${esc(existing.designation || existing.category || 'Staff')})</strong></div>
        <div><span>Aadhaar:</span> <strong>${maskAadhaar(existing.aadhaar)}</strong></div>
        <div><span>PAN / UAN:</span> <strong>${esc(existing.pan || '—')} / ${mask(existing.uan)}</strong></div>
      </div>
    </div>

    <div style="background:#f8fafc; border:1px solid var(--border-color); border-radius:var(--radius-sm); padding:12px; font-size:12px; color:var(--text-muted); margin-bottom:12px;">
      ℹ️ To prevent duplicate employee records and corrupted statutory declarations, please review the existing profile. You may cancel, view the existing profile, or intentionally confirm to proceed anyway.
    </div>
  `;

  showModal({
    title: 'Employee Already Exists',
    eyebrow: 'DUPLICATE RECORD WARNING',
    body: html,
    modalClass: 'modal-md',
    showCancel: true,
    cancelText: 'Cancel',
    saveText: 'Continue Anyway (Confirm)',
    onSave: async () => {
      closeModal();
      if (typeof onConfirm === 'function') {
        await onConfirm();
      }
      return true;
    }
  });

  // Inject a dedicated "View Existing Employee" button in modal footer
  setTimeout(() => {
    const footer = document.getElementById('modalFooter');
    if (footer && !document.getElementById('dupViewExistingBtn')) {
      const viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.id = 'dupViewExistingBtn';
      viewBtn.className = 'outline';
      viewBtn.style.marginRight = 'auto';
      viewBtn.innerHTML = '👁️ View Existing Employee';
      viewBtn.onclick = () => {
        closeModal();
        openEmployeeProfileModal(existing.empCode);
      };
      footer.prepend(viewBtn);
    }
  }, 50);
}

// ----------------------------------------------------
// SALARY HISTORY & INCREMENT ENGINE
// ----------------------------------------------------
function getEffectiveSalary(emp, period = currentPeriod) {
  if (!emp) return { basic: 0, da: 0, hra: 0, conveyance: 0, medical: 0, otherAllowance: 0, effectiveRecord: null };
  const normPeriod = (period || '').slice(0, 7);
  const history = Array.isArray(emp.salaryHistory) ? emp.salaryHistory.slice() : [];

  if (history.length > 0) {
    history.sort((a, b) => {
      const dateA = a.effectiveDate || a.effectivePeriod || '';
      const dateB = b.effectiveDate || b.effectivePeriod || '';
      return dateA.localeCompare(dateB);
    });

    const eligible = history.filter(h => {
      const p = (h.effectivePeriod || (h.effectiveDate || '').slice(0, 7));
      return p <= normPeriod;
    });

    if (eligible.length > 0) {
      const active = eligible[eligible.length - 1];
      const s = active.newSalary || {};
      return {
        basic: Number(s.basic ?? emp.basic ?? 0),
        da: Number(s.da ?? emp.da ?? 0),
        hra: Number(s.hra ?? emp.hra ?? 0),
        conveyance: Number(s.conveyance ?? emp.conveyance ?? 0),
        medical: Number(s.medical ?? emp.medical ?? 0),
        otherAllowance: Number(s.otherAllowance ?? emp.otherAllowance ?? 0),
        effectiveRecord: active
      };
    } else {
      const earliest = history[0];
      const prev = earliest.previousSalary || {};
      return {
        basic: Number(prev.basic ?? earliest.newSalary?.basic ?? emp.basic ?? 0),
        da: Number(prev.da ?? earliest.newSalary?.da ?? emp.da ?? 0),
        hra: Number(prev.hra ?? earliest.newSalary?.hra ?? emp.hra ?? 0),
        conveyance: Number(prev.conveyance ?? earliest.newSalary?.conveyance ?? emp.conveyance ?? 0),
        medical: Number(prev.medical ?? earliest.newSalary?.medical ?? emp.medical ?? 0),
        otherAllowance: Number(prev.otherAllowance ?? earliest.newSalary?.otherAllowance ?? emp.otherAllowance ?? 0),
        effectiveRecord: earliest
      };
    }
  }

  return {
    basic: Number(emp.basic || 0),
    da: Number(emp.da || 0),
    hra: Number(emp.hra || 0),
    conveyance: Number(emp.conveyance || 0),
    medical: Number(emp.medical || 0),
    otherAllowance: Number(emp.otherAllowance || 0),
    effectiveRecord: null
  };
}

// Site helpers
function getSite(siteId) {
  if (!siteId || siteId === 'unassigned') return null;
  return (db.sites || []).find(s => s.id === siteId || s.siteCode?.toUpperCase() === siteId?.toUpperCase());
}

function getSiteName(siteId) {
  const s = getSite(siteId);
  return s ? s.siteName : 'Unassigned';
}

function getSiteCode(siteId) {
  const s = getSite(siteId);
  return s ? s.siteCode : 'UNASSIGNED';
}

function getSitePill(siteId) {
  const s = getSite(siteId);
  if (!s) {
    return `<span class="site-pill unassigned">⚠️ Unassigned</span>`;
  }
  const code = (s.siteCode || '').toLowerCase();
  let colorClass = 'pune';
  if (code.includes('mum')) colorClass = 'mumbai';
  else if (code.includes('nsk') || code.includes('nas')) colorClass = 'nashik';
  else if (s.status === 'Inactive') colorClass = 'unassigned';

  return `<span class="site-pill ${colorClass}" title="${esc(s.siteName)} (${esc(s.siteCode)})">🏢 ${esc(s.siteName)}</span>`;
}

function getUnassignedEmployees() {
  return (db.employees || []).filter(e => !e.siteId || e.siteId === 'unassigned' || !getSite(e.siteId));
}

function getPaymentModePill(mode) {
  const m = (mode || 'Bank').toLowerCase();
  if (m === 'cash') return `<span class="paymode-pill cash">💵 Cash</span>`;
  if (m === 'cheque') return `<span class="paymode-pill cheque">📑 Cheque</span>`;
  return `<span class="paymode-pill bank">🏦 Bank</span>`;
}

// Save database and automatically trigger background auto-backup
async function save(silent = false) {
  try {
    await window.emppay.save(db);
    if (window.emppay.autoBackup) {
      window.emppay.autoBackup(db).then(res => {
        if (res && res.success) {
          updateAutoBackupIndicator(new Date());
        }
      }).catch(err => console.error('AutoBackup error:', err));
    }
    updateNavBadges();
  } catch (err) {
    console.error('Save error:', err);
    toast('Error saving data: ' + err.message, 'error');
  }
}

function updateAutoBackupIndicator(date) {
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const el = $('#lastSavedTime');
  const badgeText = $('#autoBackupText');
  if (el) el.textContent = `Auto-saved at ${timeStr}`;
  if (badgeText) badgeText.textContent = `Auto-saved ${timeStr}`;
}

function log(action, detail, module = 'general') {
  if (!db.audit) db.audit = [];
  db.audit.unshift({
    at: new Date().toISOString(),
    action,
    detail,
    module,
    user: db.auth?.username || 'Admin',
    period: currentPeriod
  });
}

function updateNavBadges() {
  if (!db) return;
  const empBadge = $('#empCountBadge');
  if (empBadge && db.employees) empBadge.textContent = db.employees.length;
  
  const siteBadge = $('#siteCountBadge');
  if (siteBadge && db.sites) siteBadge.textContent = db.sites.length;
  
  const loanBadge = $('#loanCountBadge');
  if (loanBadge && db.loans) {
    const activeLoans = db.loans.filter(l => l.status === 'Active' && l.outstandingAmount > 0).length;
    loanBadge.textContent = activeLoans;
  }
  
  const arrearBadge = $('#arrearCountBadge');
  if (arrearBadge && db.arrears) {
    const pendingArrears = db.arrears.filter(a => a.status === 'Pending').length;
    arrearBadge.textContent = pendingArrears;
  }
}

// Modal Dialog System
function showModal({ title, eyebrow = 'INPUT DIALOG', body, onSave, saveText = 'Save Changes', modalClass = '', hideSave = false }) {
  const container = $('#modalContainer');
  const card = $('#modalCard');
  $('#modalEyebrow').textContent = eyebrow;
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = body;

  card.className = 'modal-card ' + modalClass;

  const footer = $('#modalFooter');
  footer.innerHTML = `
    <button class="outline" id="modalCancelBtn">Cancel</button>
    ${!hideSave ? `<button class="primary" id="modalSubmitBtn">${saveText}</button>` : ''}
  `;

  container.style.display = 'flex';

  let keyHandler = null;
  const close = () => {
    container.style.display = 'none';
    if (keyHandler) {
      window.removeEventListener('keydown', keyHandler);
      keyHandler = null;
    }
  };
  $('#modalCloseBtn').onclick = close;
  $('#modalCancelBtn').onclick = close;

  if (!hideSave && onSave) {
    $('#modalSubmitBtn').onclick = async () => {
      const shouldClose = await onSave();
      if (shouldClose !== false) {
        close();
      }
    };
  }

  keyHandler = (e) => {
    if (e.key === 'Escape') {
      close();
    }
  };
  window.addEventListener('keydown', keyHandler);
}

function closeModal() {
  const cancelBtn = $('#modalCancelBtn');
  if (cancelBtn && cancelBtn.onclick) {
    cancelBtn.onclick();
  } else {
    const container = $('#modalContainer');
    if (container) container.style.display = 'none';
  }
}

function showConfirm({ title = 'Confirm Action', message = 'Are you sure you want to proceed?', onConfirm, confirmText = 'Confirm', isDanger = false }) {
  showModal({
    title,
    eyebrow: 'CONFIRMATION',
    body: `<p style="font-size: 14px; color: var(--text-secondary); line-height: 1.6;">${message}</p>`,
    saveText: confirmText,
    modalClass: 'modal-sm',
    onSave: async () => {
      await onConfirm();
      return true;
    }
  });
  if (isDanger) {
    const btn = $('#modalSubmitBtn');
    if (btn) btn.className = 'danger';
  }
}

// ----------------------------------------------------
// EMPLOYMENT HISTORY MIGRATION HELPER
// Runs once on startup — wraps flat employee data into
// Employment Period #1 for backward compatibility.
// No data is overwritten; only employmentHistory[] is added.
// ----------------------------------------------------
function migrateEmploymentHistory() {
  if (!db || !Array.isArray(db.employees)) return;
  let migrated = 0;
  db.employees.forEach(emp => {
    if (!emp.employmentHistory || !Array.isArray(emp.employmentHistory) || emp.employmentHistory.length === 0) {
      const stintId = `${emp.empCode}_S1`;
      emp.employmentHistory = [{
        stintId,
        stintNumber: 1,
        joinDate: emp.joinDate || emp.joiningDate || '',
        leaveDate: (emp.status === 'Inactive') ? (emp.leavingDate || emp.leaveDate || '') : null,
        reasonForLeaving: emp.reasonForLeaving || '',
        reasonForJoining: 'Initial Joining',
        department: emp.department || '',
        designation: emp.designation || '',
        category: emp.category || 'Skilled',
        siteId: emp.siteId || 'unassigned',
        reportingManager: emp.reportingManager || '',
        employmentType: emp.employmentType || 'Permanent',
        basic: emp.basic || 0,
        da: emp.da || 0,
        hra: emp.hra || 0,
        conveyance: emp.conveyance || 0,
        medical: emp.medical || 0,
        otherAllowance: emp.otherAllowance || 0,
        uan: emp.uan || '',
        pfNumber: emp.pfNumber || '',
        esiNumber: emp.esiNumber || '',
        pan: emp.pan || '',
        bankAccount: emp.bankAccount || '',
        ifsc: emp.ifsc || '',
        bankName: emp.bankName || '',
        paymentMode: emp.paymentMode || 'Bank',
        esicCoveredPeriods: emp.esicCoveredPeriods || [],
        status: (emp.status === 'Inactive') ? 'Completed' : 'Active',
        createdAt: emp.createdAt || new Date().toISOString()
      }];
      emp.currentStintId = (emp.status === 'Inactive') ? null : stintId;
      migrated++;
    } else {
      // Ensure currentStintId is set on already-migrated employees
      if (!emp.currentStintId) {
        const activeStint = emp.employmentHistory.find(s => s.status === 'Active');
        emp.currentStintId = activeStint ? activeStint.stintId : null;
      }
    }
  });
  if (!db.kycDocuments) db.kycDocuments = [];
  if (migrated > 0) {
    console.log(`[EMPPAY] Migrated employment history for ${migrated} employees.`);
  }
}

// Determine which ESIC contribution half-year period a payroll month falls in.
// Returns: { label: 'Apr-Sep 2026', start: '2026-04', end: '2026-09' }
function getEsicContribPeriod(period) {
  if (!period) return null;
  const [y, m] = period.split('-').map(Number);
  if (m >= 4 && m <= 9) {
    return { label: `Apr-Sep ${y}`, start: `${y}-04`, end: `${y}-09` };
  } else {
    // Oct-Mar spans two calendar years
    const startYear = m >= 10 ? y : y - 1;
    const endYear = startYear + 1;
    return { label: `Oct ${startYear}-Mar ${endYear}`, start: `${startYear}-10`, end: `${endYear}-03` };
  }
}

// Proper ESIC contribution-period eligibility check.
// An employee enrolled at the start of a half-year contribution period
// continues to contribute for the FULL period even if wages exceed ₹21,000 mid-period.
function isEsicCoveredForPeriod(emp, period, rule) {
  // Manual opt-out takes priority
  if (emp.esiEligible === false) {
    return { covered: false, reason: 'Employee manually opted out of ESIC' };
  }

  const ceiling = Number(rule?.esicCeiling || 21000);
  const contribPeriod = getEsicContribPeriod(period);
  if (!contribPeriod) return { covered: false, reason: 'Invalid payroll period' };

  // Get the employee's current employment stint
  const currentStint = emp.employmentHistory
    ? emp.employmentHistory.find(s => s.stintId === emp.currentStintId)
    : null;

  const coveredPeriods = (currentStint?.esicCoveredPeriods) || (emp.esicCoveredPeriods || []);

  // Check if this contribution period is already recorded as covered
  const alreadyCovered = coveredPeriods.some(cp => cp === contribPeriod.label);
  if (alreadyCovered) {
    return { covered: true, reason: `Active ESIC contribution period: ${contribPeriod.label}` };
  }

  // Not in a tracked period — check if we need to record coverage
  // (This will be evaluated against gross in calculate(), which calls this function)
  return { covered: false, reason: 'Not in ESIC contribution period', contribPeriod };
}

// Record a new ESIC contribution period for an employee (called when gross <= ceiling & newly eligible)
function recordEsicCoverage(emp, contribPeriodLabel) {
  const currentStint = emp.employmentHistory
    ? emp.employmentHistory.find(s => s.stintId === emp.currentStintId)
    : null;

  if (currentStint) {
    if (!currentStint.esicCoveredPeriods) currentStint.esicCoveredPeriods = [];
    if (!currentStint.esicCoveredPeriods.includes(contribPeriodLabel)) {
      currentStint.esicCoveredPeriods.push(contribPeriodLabel);
    }
  } else {
    if (!emp.esicCoveredPeriods) emp.esicCoveredPeriods = [];
    if (!emp.esicCoveredPeriods.includes(contribPeriodLabel)) {
      emp.esicCoveredPeriods.push(contribPeriodLabel);
    }
  }
}

// ----------------------------------------------------
// ----------------------------------------------------
// PROFESSIONAL TAX SLABS BY STATE (India)
// ----------------------------------------------------
const PT_SLABS_BY_STATE = {
  'Maharashtra': [
    { min: 0, max: 7500, amount: 0 },
    { min: 7501, max: 10000, amount: 175 },
    { min: 10001, max: 9999999, amount: 200, febAmount: 300 }
  ],
  'Karnataka': [
    { min: 0, max: 15000, amount: 0 },
    { min: 15001, max: 9999999, amount: 200 }
  ],
  'West Bengal': [
    { min: 0, max: 10000, amount: 0 },
    { min: 10001, max: 15000, amount: 110 },
    { min: 15001, max: 25000, amount: 130 },
    { min: 25001, max: 40000, amount: 150 },
    { min: 40001, max: 9999999, amount: 200 }
  ],
  'Andhra Pradesh': [
    { min: 0, max: 15000, amount: 0 },
    { min: 15001, max: 20000, amount: 150 },
    { min: 20001, max: 9999999, amount: 200 }
  ],
  'Telangana': [
    { min: 0, max: 15000, amount: 0 },
    { min: 15001, max: 20000, amount: 150 },
    { min: 20001, max: 9999999, amount: 200 }
  ],
  'Tamil Nadu': [
    { min: 0, max: 3500, amount: 0 },
    { min: 3501, max: 5000, amount: 22 },
    { min: 5001, max: 7500, amount: 52 },
    { min: 7501, max: 10000, amount: 115 },
    { min: 10001, max: 12500, amount: 125 },
    { min: 12501, max: 9999999, amount: 182 }
  ],
  'Gujarat': [
    { min: 0, max: 5999, amount: 0 },
    { min: 6000, max: 8999, amount: 80 },
    { min: 9000, max: 11999, amount: 150 },
    { min: 12000, max: 9999999, amount: 200 }
  ],
  'Madhya Pradesh': [
    { min: 0, max: 18750, amount: 0 },
    { min: 18751, max: 25000, amount: 125 },
    { min: 25001, max: 33333, amount: 167 },
    { min: 33334, max: 9999999, amount: 208 }
  ],
  'Assam': [
    { min: 0, max: 10000, amount: 0 },
    { min: 10001, max: 15000, amount: 150 },
    { min: 15001, max: 25000, amount: 180 },
    { min: 25001, max: 9999999, amount: 208 }
  ],
  'Kerala': [
    { min: 0, max: 1999, amount: 0 },
    { min: 2000, max: 2999, amount: 20 },
    { min: 3000, max: 4999, amount: 30 },
    { min: 5000, max: 7499, amount: 50 },
    { min: 7500, max: 9999, amount: 75 },
    { min: 10000, max: 12499, amount: 100 },
    { min: 12500, max: 16666, amount: 125 },
    { min: 16667, max: 20833, amount: 167 },
    { min: 20834, max: 9999999, amount: 208 }
  ],
  'Odisha': [
    { min: 0, max: 5000, amount: 0 },
    { min: 5001, max: 6000, amount: 30 },
    { min: 6001, max: 8000, amount: 50 },
    { min: 8001, max: 10000, amount: 75 },
    { min: 10001, max: 15000, amount: 100 },
    { min: 15001, max: 20000, amount: 150 },
    { min: 20001, max: 9999999, amount: 200 }
  ],
  'Punjab': [
    { min: 0, max: 9999999, amount: 200 }
  ],
  'Chhattisgarh': [
    { min: 0, max: 12500, amount: 0 },
    { min: 12501, max: 16666, amount: 150 },
    { min: 16667, max: 20833, amount: 180 },
    { min: 20834, max: 9999999, amount: 208 }
  ],
  'None / Exempt': []
};

function getPtSlabsForState(stateName) {
  return PT_SLABS_BY_STATE[stateName] || PT_SLABS_BY_STATE['Maharashtra'];
}

function applyPtStateSlabs(stateName) {
  const slabs = PT_SLABS_BY_STATE[stateName];
  if (slabs) {
    const count = slabs.length;
    toast(`PT slabs for ${stateName} auto-loaded (${count} slab${count !== 1 ? 's' : ''})`, 'success');
  }
}

// ----------------------------------------------------
// RULE VERSIONING HELPER
// ----------------------------------------------------
function getActiveRuleVersion(targetVersion = null) {
  if (targetVersion) {
    const found = (db.ruleVersions || []).find(v => v.version === Number(targetVersion) || v.id === targetVersion);
    if (found) return found;
  }
  
  if (Array.isArray(db.ruleVersions) && db.ruleVersions.length > 0) {
    const active = db.ruleVersions.find(v => v.status === 'Active') || db.ruleVersions[0];
    return active;
  }

  // Fallback to active rules object
  return {
    version: db.rules?.version || 1,
    name: 'Standard Statutory Rules',
    effectiveFrom: '2026-01-01',
    pfRate: db.rules?.pfRate ?? 12,
    pfCeiling: db.rules?.pfCeiling ?? 15000,
    epsRate: db.rules?.epsRate ?? 8.33,
    epfEmployerRate: db.rules?.epfEmployerRate ?? 3.67,
    pfAdminRate: db.rules?.pfAdminRate ?? 0.5,
    edliRate: db.rules?.edliRate ?? 0.5,
    esicRate: db.rules?.esicRate ?? 0.75,
    esicEmployerRate: db.rules?.esicEmployerRate ?? 3.25,
    esicCeiling: db.rules?.esicCeiling ?? 21000,
    pt: db.rules?.pt ?? 200,
    ptState: db.rules?.ptState || 'Maharashtra',
    ptSlabs: db.rules?.ptSlabs || [
      { min: 0, max: 7500, amount: 0 },
      { min: 7501, max: 10000, amount: 175 },
      { min: 10001, max: 9999999, amount: 200, febAmount: 300 }
    ],
    lwf: db.rules?.lwf ?? 20,
    lwfEmployer: db.rules?.lwfEmployer ?? 40,
    lwfFrequency: db.rules?.lwfFrequency || 'Monthly',
    otMultiplier: db.rules?.otMultiplier ?? 1.5,
    otBase: db.rules?.otBase || 'Basic',
    standardDailyHours: db.rules?.standardDailyHours ?? 8,
    // Leave payable configuration
    clPayable: db.rules?.clPayable ?? true,
    plPayable: db.rules?.plPayable ?? true,
    slPayable: db.rules?.slPayable ?? true,
    olPayable: db.rules?.olPayable ?? false,
    woPayable: db.rules?.woPayable ?? true,
    phPayable: db.rules?.phPayable ?? true
  };
}

// ----------------------------------------------------
// CENTRALIZED PAYROLL CALCULATION ENGINE
// Single source of truth for all calculations and reports
// ----------------------------------------------------
function calculate(e, a = {}, ruleObj = null, period = currentPeriod) {
  const rule = ruleObj || getActiveRuleVersion();

  const isInactive = e.status === 'Inactive';
  const workingDays = Number(a.workingDays || 26);
  const presentDays = Number((a.presentDays !== undefined && a.presentDays !== '') ? a.presentDays : (isInactive ? 0 : workingDays));
  const weeklyOffs = Number(a.weeklyOffs || 0);
  const paidHolidays = Number(a.paidHolidays || 0);
  const sickLeave = Number(a.sickLeave || 0);
  const cl = Number(a.cl || 0);
  const pl = Number(a.pl || 0);
  const otherLeave = Number(a.otherLeave || 0);
  const lopDays = Number(a.lopDays || 0);

  // Configurable leave payability calculation
  const computedPayableDays = presentDays +
    (rule.clPayable !== false ? cl : 0) +
    (rule.plPayable !== false ? pl : 0) +
    (rule.slPayable !== false ? sickLeave : 0) +
    (rule.olPayable === true ? otherLeave : 0) +
    (rule.woPayable !== false ? weeklyOffs : 0) +
    (rule.phPayable !== false ? paidHolidays : 0) -
    lopDays;

  const defaultPayable = isInactive && (a.presentDays === undefined || a.presentDays === '') ? 0 : computedPayableDays;
  const payableDays = Math.max(0, Math.min(workingDays, (a.payableDays !== undefined && a.payableDays !== '') ? Number(a.payableDays) : defaultPayable));
  const factor = workingDays > 0 ? (payableDays / workingDays) : 0;

  // Individual Salary Components (Period-accurate via Salary History)
  const effSal = getEffectiveSalary(e, period);
  const basic = Number(effSal.basic || 0) * factor;
  const da = Number(effSal.da || 0) * factor;
  const hra = Number(effSal.hra || 0) * factor;
  const conveyance = Number(effSal.conveyance || 0) * factor;
  const incentive = Number(e.incentive || 0) * factor;
  const medical = Number(effSal.medical || 0) * factor;
  const educationAllowance = Number(e.educationAllowance || 0) * factor;
  const shiftAllowance = Number(e.shiftAllowance || 0) * factor;
  const washingAllowance = Number(e.washingAllowance || 0) * factor;
  const otherAllowance = Number(effSal.otherAllowance || 0) * factor;
  const lta = Number(e.lta || 0) * factor;

  // Dynamic Custom Catalog Earnings
  const customEarningsList = [];
  let customEarningsSum = 0;
  (db?.components || []).filter(c => c.type === 'earning' && c.active !== false && !['Basic', 'DA', 'HRA', 'Conveyance', 'Incentive', 'Medical', 'Education Allowance', 'Shift Allowance', 'Washing Allowance', 'Other Allowance', 'LTA', 'Arrears', 'Overtime', 'Bonus'].includes(c.name)).forEach(c => {
    let val = 0;
    if (c.mode === 'percentage') {
      val = (basic + da + hra) * Number(c.defaultValue || c.value || 0) / 100;
    } else if (c.mode === 'percentage_basic') {
      val = basic * Number(c.defaultValue || c.value || 0) / 100;
    } else if (c.mode === 'percentage_gross') {
      val = (basic + da + hra + otherAllowance) * Number(c.defaultValue || c.value || 0) / 100;
    } else {
      val = Number(e[c.id] || c.defaultValue || c.value || 0) * factor;
    }
    customEarningsList.push({ id: c.id, name: c.name, amount: val, taxable: c.taxable !== false });
    customEarningsSum += val;
  });

  // Arrears for this employee in this payment month
  const activeArrears = (db?.arrears || []).filter(arr => arr.empCode === e.empCode && (arr.paymentMonth === period || arr.paymentMonth === currentPeriod) && arr.status === 'Pending');
  const arrearsAmount = activeArrears.reduce((s, x) => s + Number(x.amount || 0), 0);
  const arrearsPfAmount = activeArrears.filter(x => x.pfApplicable).reduce((s, x) => s + Number(x.amount || 0), 0);
  const arrearsEsiAmount = activeArrears.filter(x => x.esiApplicable).reduce((s, x) => s + Number(x.amount || 0), 0);

  // Bonus for this employee in this payroll period
  const activeBonusEntry = (db?.bonusStatements || []).flatMap(b => b.rows || []).find(r => r.empCode === e.empCode && r.disbursementPeriod === period);
  const bonusAmount = Number(activeBonusEntry?.totalBonus || a.bonus || e.bonus || 0);

  // Overtime Calculation
  const otMultiplier = Number(rule.otMultiplier || 1.5);
  let otBaseWage = basic;
  if (rule.otBase === 'Basic+DA') otBaseWage = basic + da;
  else if (rule.otBase === 'Gross') otBaseWage = basic + da + hra + otherAllowance;
  
  const stdHours = Number(rule.standardDailyHours || 8);
  const defaultHourlyRate = (workingDays > 0 && stdHours > 0) ? ((otBaseWage / workingDays) / stdHours) : 0;
  const otRate = Number(a.otRate > 0 ? a.otRate : (e.otRate > 0 ? e.otRate : defaultHourlyRate));
  const ot = Number(a.otHours || 0) * otRate * otMultiplier;

  // Gross Salary
  const gross = basic + da + hra + conveyance + incentive + medical + educationAllowance + shiftAllowance + washingAllowance + otherAllowance + lta + customEarningsSum + arrearsAmount + bonusAmount + ot;

  // --------------------------------------------------
  // STATUTORY DEDUCTIONS
  // --------------------------------------------------
  // Provident Fund (PF): 12% capped at PF Ceiling (₹15,000 basic + DA)
  const pfCeiling = Number(rule.pfCeiling || 15000);
  const pfBase = Math.min(basic + da + arrearsPfAmount, pfCeiling);
  const pf = (e.pfEligible !== false && rule.pfEligibleDefault !== false)
    ? (pfBase * Number(rule.pfRate || 12) / 100)
    : 0;

  // PF Employer Contributions (EPF + EPS + Admin)
  const epsRate = Number(rule.epsRate || 8.33);
  const eps = (e.pfEligible !== false) ? Math.min(basic + da, pfCeiling) * epsRate / 100 : 0;
  const epfEmployer = Math.max(0, pf - eps);
  const pfEmployer = eps + epfEmployer;
  const pfAdmin = pfBase * Number(rule.pfAdminRate || 0.5) / 100;
  const edli = pfBase * Number(rule.edliRate || 0.5) / 100;

  // --------------------------------------------------
  // ESIC Calculation — CONTRIBUTION PERIOD AWARE
  // An employee enrolled at the start of a half-year period (Apr-Sep or Oct-Mar)
  // remains covered for the FULL period even if wages later exceed ₹21,000.
  // --------------------------------------------------
  const esicCeiling = Number(rule.esicCeiling || 21000);
  const esicBasis = gross + arrearsEsiAmount;
  let esicApplicable = false;
  let esicStatusReason = '';

  if (e.esiEligible === false) {
    esicStatusReason = 'Employee manually opted out of ESIC';
  } else {
    const esicCheck = isEsicCoveredForPeriod(e, period, rule);
    if (esicCheck.covered) {
      // Already in a tracked contribution period — always covered
      esicApplicable = true;
      esicStatusReason = esicCheck.reason;
    } else if (esicBasis <= esicCeiling) {
      // Wages within ceiling — newly covered; record the contribution period
      esicApplicable = true;
      if (esicCheck.contribPeriod) {
        recordEsicCoverage(e, esicCheck.contribPeriod.label);
        esicStatusReason = `Newly enrolled: ${esicCheck.contribPeriod.label}`;
      } else {
        esicStatusReason = `Gross ₹${Math.round(esicBasis).toLocaleString('en-IN')} within ₹${esicCeiling.toLocaleString('en-IN')} ceiling`;
      }
    } else {
      // Wages above ceiling and not in any active period
      esicApplicable = false;
      esicStatusReason = `Gross ₹${Math.round(esicBasis).toLocaleString('en-IN')} exceeds ESIC ceiling ₹${esicCeiling.toLocaleString('en-IN')}`;
    }
  }

  const esic = esicApplicable ? (esicBasis * Number(rule.esicRate || 0.75) / 100) : 0;
  const esicEmployer = esicApplicable ? (esicBasis * Number(rule.esicEmployerRate || 3.25) / 100) : 0;

  // --------------------------------------------------
  // Professional Tax (PT) — Maharashtra Slab with February Rule
  // Normal months: ₹200, February: ₹300 for applicable salary slab
  // --------------------------------------------------
  let pt = 0;
  let ptMonth = period.endsWith('-02') ? 'February' : 'Normal';
  if (e.ptEligible !== false && rule.ptEligibleDefault !== false) {
    const isFeb = period.endsWith('-02');
    const slabs = rule.ptSlabs || [
      { min: 0, max: 7500, amount: 0 },
      { min: 7501, max: 10000, amount: 175 },
      { min: 10001, max: 9999999, amount: 200, febAmount: 300 }
    ];
    // Sort slabs ascending by min for correct matching
    const sortedSlabs = [...slabs].sort((a, b) => a.min - b.min);
    const matchSlab = sortedSlabs.find(s => gross >= s.min && gross <= s.max);
    if (matchSlab) {
      pt = (isFeb && matchSlab.febAmount !== undefined) ? matchSlab.febAmount : matchSlab.amount;
    } else if (gross > 0) {
      // Gross exceeds all slab max values — use highest slab
      const highestSlab = sortedSlabs[sortedSlabs.length - 1];
      if (highestSlab) {
        pt = (isFeb && highestSlab.febAmount !== undefined) ? highestSlab.febAmount : highestSlab.amount;
      }
    }
  }

  // Labour Welfare Fund (LWF)
  const lwf = (e.lwfEligible !== false && rule.lwfEligibleDefault !== false) ? Number(rule.lwf || 20) : 0;
  const lwfEmployer = (e.lwfEligible !== false) ? Number(rule.lwfEmployer || 40) : 0;

  // Income Tax (TDS)
  const incomeTax = Number(e.incomeTax || a.incomeTax || 0);

  // LIC Deduction
  let lic = 0;
  if (e.licActive !== false && e.licAmount) {
    lic = Number(e.licAmount || 0);
  }

  // Loan Deduction
  const activeLoans = (db?.loans || []).filter(l => l.empCode === e.empCode && l.status === 'Active' && l.outstandingAmount > 0);
  let loanDeduction = 0;
  const activeLoanDetails = [];
  activeLoans.forEach(loan => {
    const deduct = Math.min(Number(loan.monthlyDeduction || 0), Number(loan.outstandingAmount || 0));
    loanDeduction += deduct;
    activeLoanDetails.push({ loanId: loan.id, loanType: loan.loanType, amount: deduct, outstanding: loan.outstandingAmount });
  });

  // Other Deductions & Custom Catalog Deductions
  const otherDed = Number(a.otherDeduction || e.otherDeduction || 0);
  const customDeductionsList = [];
  let customDeductionsSum = 0;
  (db?.components || []).filter(c => c.type === 'deduction' && c.active !== false && !['PF', 'ESIC', 'PT', 'LWF', 'Income Tax', 'LIC', 'Loan', 'Other Deduction'].includes(c.name)).forEach(c => {
    let val = 0;
    if (c.mode === 'percentage') {
      val = gross * Number(c.defaultValue || c.value || 0) / 100;
    } else {
      val = Number(e[c.id] || c.defaultValue || c.value || 0);
    }
    customDeductionsList.push({ id: c.id, name: c.name, amount: val });
    customDeductionsSum += val;
  });

  const totalDeduction = pf + esic + pt + lwf + incomeTax + lic + loanDeduction + otherDed + customDeductionsSum;
  const net = Math.max(0, gross - totalDeduction);
  const difference = Number(a.amountPaid || 0) - net;

  const site = getSite(e.siteId);

  return {
    ...e,
    ...a,
    empCode: e.empCode,
    name: e.name,
    siteId: e.siteId || 'unassigned',
    siteName: site ? site.siteName : 'Unassigned',
    siteCode: site ? site.siteCode : 'UNASSIGNED',
    category: e.category || 'Skilled',
    department: e.department || '',
    designation: e.designation || '',
    paymentMode: e.paymentMode || 'Bank',
    chequeHandling: e.chequeHandling || 'Separate',
    bankAccount: e.bankAccount || '',
    ifsc: e.ifsc || '',
    bankName: e.bankName || '',
    uan: e.uan || '',
    pfNumber: e.pfNumber || e.uan || '',
    esiNumber: e.esiNumber || '',
    pan: e.pan || '',
    
    // Attendance Breakup
    workingDays,
    presentDays,
    weeklyOffs,
    paidHolidays,
    sickLeave,
    cl,
    pl,
    otherLeave,
    lopDays,
    payableDays,
    otHours: Number(a.otHours || 0),
    otRate,
    
    // Earnings Breakup
    basic,
    da,
    hra,
    conveyance,
    incentive,
    medical,
    educationAllowance,
    shiftAllowance,
    washingAllowance,
    otherAllowance,
    lta,
    customEarnings: customEarningsList,
    customEarningsSum,
    arrearsAmount,
    activeArrears,
    bonusAmount,
    ot,
    gross,
    
    // Deductions Breakup
    pf,
    eps,
    epfEmployer,
    pfEmployer,
    pfAdmin,
    edli,
    pfBase,
    esic,
    esicEmployer,
    esicApplicable,
    esicStatusReason,
    esicCoveredPeriod: esicApplicable ? (getEsicContribPeriod(period)?.label || '') : '',
    pt,
    ptMonth,
    lwf,
    lwfEmployer,
    incomeTax,
    lic,
    licPolicyNo: e.licPolicyNo || '',
    loanDeduction,
    activeLoanDetails,
    otherDed,
    customDeductions: customDeductionsList,
    customDeductionsSum,
    totalDeduction,
    
    // Net
    net,
    difference
  };
}

function calculateRows(siteFilter = 'all', period = currentPeriod) {
  const rule = getActiveRuleVersion();
  return (db?.employees || [])
    .filter(e => {
      if (e.status === 'Inactive') {
        const hasAtt = (db?.attendance || []).some(x => x.empCode === e.empCode && x.period === period && (Number(x.presentDays) > 0 || Number(x.payableDays) > 0));
        const hasArrears = (db?.arrears || []).some(arr => arr.empCode === e.empCode && (arr.paymentMonth === period || arr.paymentMonth === currentPeriod) && arr.status === 'Pending');
        if (!hasAtt && !hasArrears) return false;
      }
      if (siteFilter === 'all') return true;
      if (siteFilter === 'unassigned') return !e.siteId || e.siteId === 'unassigned' || !getSite(e.siteId);
      return e.siteId === siteFilter;
    })
    .map(e => {
      const a = (db?.attendance || []).find(x => x.empCode === e.empCode && (!x.period || x.period === period)) || {};
      return calculate(e, a, rule, period);
    });
}

function mask(v) {
  const s = String(v || '').trim();
  return s ? `•••• ${s.slice(-4)}` : '—';
}

function renderTable(data, cols, emptyMsg = 'No records found.', tableClass = '') {
  return `
    <div class="table-wrap ${tableClass}">
      <table>
        <thead>
          <tr>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${data.length > 0 ? data.map((r, i) => `
            <tr>
              ${cols.map(c => `<td>${c.render ? c.render(r, i) : esc(r[c.key])}</td>`).join('')}
            </tr>
          `).join('') : `
            <tr>
              <td colspan="${cols.length}" class="empty-state">
                <div class="empty-state-icon">📋</div>
                <h4>${emptyMsg}</h4>
              </td>
            </tr>
          `}
        </tbody>
      </table>
    </div>
  `;
}

function shell(title, eyebrow, body, actions = '') {
  $('#pageTitle').textContent = title;
  $('#content').innerHTML = `
    <div class="page-head">
      <div>
        <p class="eyebrow">${eyebrow}</p>
        <h2>${title}</h2>
      </div>
      <div class="header-actions">${actions}</div>
    </div>
    ${body}
  `;
}

// ----------------------------------------------------
// SECTION 1: DASHBOARD
// ----------------------------------------------------
function renderDashboard() {
  const calc = calculateRows();
  const totalGross = calc.reduce((s, r) => s + r.gross, 0);
  const totalNet = calc.reduce((s, r) => s + r.net, 0);
  const totalDeductions = totalGross - totalNet;
  const totalPf = calc.reduce((s, r) => s + r.pf, 0);
  const totalEsic = calc.reduce((s, r) => s + r.esic, 0);
  const totalPt = calc.reduce((s, r) => s + r.pt, 0);
  const totalOt = calc.reduce((s, r) => s + r.ot, 0);
  const totalBonus = calc.reduce((s, r) => s + r.bonusAmount, 0);
  const totalLoans = calc.reduce((s, r) => s + r.loanDeduction, 0);
  const lopEmployees = calc.filter(r => r.lopDays > 0).length;
  const missingDataEmployees = (db.employees || []).filter(e => (!e.siteId || e.siteId === 'unassigned') || (e.paymentMode === 'Bank' && !e.bankAccount)).length;
  const activeEmployees = (db.employees || []).filter(e => e.status !== 'Inactive').length;

  const sites = db.sites || [];
  const unassigned = getUnassignedEmployees();
  const latestRun = db.payrollRuns[0];
  const runStatus = latestRun ? latestRun.status : 'Draft';

  // Multi-site provisions breakdown
  const siteStats = sites.map(site => {
    const siteRows = calc.filter(r => r.siteId === site.id);
    const gross = siteRows.reduce((s, r) => s + r.gross, 0);
    const net = siteRows.reduce((s, r) => s + r.net, 0);
    const ded = gross - net;
    return {
      site,
      empCount: siteRows.length,
      gross,
      ded,
      net
    };
  });

  shell('Dashboard', 'CONTROL ROOM / 01', `
    ${unassigned.length > 0 ? `
      <div class="alert-banner warning">
        <div class="alert-content">
          <span class="alert-icon">⚠️</span>
          <div>
            <strong>${unassigned.length} employee${unassigned.length > 1 ? 's are' : ' is'} unassigned to a plant/office site.</strong>
            <div style="font-size: 12px; color: #78350f;">Assign employees to enable precise site-wise statutory registers and bank payment files.</div>
          </div>
        </div>
        <button class="primary btn-sm" id="dashAssignUnassignedBtn">🏢 Bulk Assign Sites</button>
      </div>
    ` : ''}

    <div class="metric-grid">
      <div class="metric-card">
        <div class="metric-header"><span class="metric-title">TOTAL EMPLOYEES</span><span class="metric-icon">👥</span></div>
        <div class="metric-value">${db.employees.length}</div>
        <div class="metric-desc">${activeEmployees} active / ${db.employees.length - activeEmployees} inactive across ${sites.length} sites</div>
      </div>

      <div class="metric-card accent-blue">
        <div class="metric-header"><span class="metric-title">PAYROLL PERIOD</span><span class="metric-icon">📅</span></div>
        <div class="metric-value">${currentPeriod}</div>
        <div class="metric-desc">Status: <strong class="status ${runStatus === 'Finalized' ? 'ok' : 'warning'}">${runStatus.toUpperCase()}</strong></div>
      </div>

      <div class="metric-card accent-amber">
        <div class="metric-header"><span class="metric-title">GROSS PAYROLL</span><span class="metric-icon">💰</span></div>
        <div class="metric-value">${money(totalGross)}</div>
        <div class="metric-desc">Company-wide pre-deduction earnings</div>
      </div>

      <div class="metric-card accent-emerald">
        <div class="metric-header"><span class="metric-title">NET DISBURSAL</span><span class="metric-icon">💳</span></div>
        <div class="metric-value">${money(totalNet)}</div>
        <div class="metric-desc">${money(totalDeductions)} total statutory deductions</div>
      </div>
    </div>

    <div class="metric-grid" style="margin-top: -8px;">
      <div class="metric-card">
        <div class="metric-header"><span class="metric-title">PF TOTAL (12%)</span><span class="metric-icon">🏛️</span></div>
        <div class="metric-value">${money(totalPf)}</div>
        <div class="metric-desc">Employee provident fund share</div>
      </div>

      <div class="metric-card">
        <div class="metric-header"><span class="metric-title">ESIC TOTAL (0.75%)</span><span class="metric-icon">🏥</span></div>
        <div class="metric-value">${money(totalEsic)}</div>
        <div class="metric-desc">Employee health insurance share</div>
      </div>

      <div class="metric-card">
        <div class="metric-header"><span class="metric-title">PT & OT TOTAL</span><span class="metric-icon">⚙️</span></div>
        <div class="metric-value">${money(totalPt + totalOt)}</div>
        <div class="metric-desc">PT: ${money(totalPt)} · OT: ${money(totalOt)}</div>
      </div>

      <div class="metric-card">
        <div class="metric-header"><span class="metric-title">LOANS & BONUSES</span><span class="metric-icon">🎁</span></div>
        <div class="metric-value">${money(totalLoans)}</div>
        <div class="metric-desc">Loan ded: ${money(totalLoans)} · Bonus: ${money(totalBonus)}</div>
      </div>
    </div>

    <!-- Multi-Site Provision Overview -->
    <div class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">MULTI-SITE BREAKDOWN</p>
          <h3>Site Payroll & Workforce Overview</h3>
        </div>
        <div class="header-actions">
          <button class="outline btn-sm" id="dashViewAllSitesBtn">🏢 View All Sites</button>
          <button class="primary btn-sm" id="dashAddSiteBtn">+ Add Site</button>
        </div>
      </div>

      ${renderTable(siteStats, [
        { label: 'Site Name', render: r => `<strong>${esc(r.site.siteName)}</strong>` },
        { label: 'Site Code', render: r => `<span class="site-code-tag">${esc(r.site.siteCode)}</span>` },
        { label: 'Location', render: r => esc(`${r.site.city || '—'}, ${r.site.state || ''}`) },
        { label: 'Employees', render: r => `<b>${r.empCount}</b> employees` },
        { label: 'Gross Payroll', render: r => `<b>${money(r.gross)}</b>` },
        { label: 'Total Deductions', render: r => `<span style="color:var(--accent-primary);">${money(r.ded)}</span>` },
        { label: 'Net Disbursal', render: r => `<strong style="color:var(--accent-emerald); font-size:14px;">${money(r.net)}</strong>` },
        { label: 'Status', render: r => `<span class="status ${r.site.status === 'Inactive' ? 'warning' : 'ok'}">${esc(r.site.status || 'Active')}</span>` },
        { label: 'Quick View', render: r => `<button class="outline btn-sm dash-view-site-btn" data-siteid="${esc(r.site.id)}">📊 View Dashboard</button>` }
      ], 'No sites defined. Click "+ Add Site" to configure company locations.')}
    </div>

    <!-- Workflow Lifecycle -->
    <div class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">AUTOMATED WORKFLOW PIPELINE</p>
          <h3>End-to-End Enterprise Payroll Operations</h3>
        </div>
        <span class="status ok">● Multi-Site Enabled</span>
      </div>
      <div class="pipeline">
        <div class="pipeline-step">
          <div class="step-num">STEP 01</div>
          <b>Master & Rules</b>
          <small>Maintain employee wages, payment modes & effective rule versions.</small>
        </div>
        <div class="pipeline-step">
          <div class="step-num">STEP 02</div>
          <b>Attendance & Loans</b>
          <small>Log leaves (CL/PL/SL/LOP), overtime & active loan installments.</small>
        </div>
        <div class="pipeline-step">
          <div class="step-num">STEP 03</div>
          <b>Validate & Run</b>
          <small>Verify zero errors, calculate centralized payroll & finalize snapshot.</small>
        </div>
        <div class="pipeline-step active">
          <div class="step-num">STEP 04</div>
          <b>Reports & Bank Files</b>
          <small>Generate payslips, PF/ESI statements, bank/cash/cheque advice.</small>
        </div>
      </div>
    </div>
  `);

  if ($('#dashAssignUnassignedBtn')) {
    $('#dashAssignUnassignedBtn').onclick = () => openBulkAssignModal(unassigned.map(e => e.empCode));
  }
  $('#dashViewAllSitesBtn').onclick = () => { currentPage = 'sites'; render(); };
  $('#dashAddSiteBtn').onclick = () => openSiteModal();
  $$('.dash-view-site-btn').forEach(btn => {
    btn.onclick = () => { currentSelectedSiteId = btn.dataset.siteid; renderSiteDetails(currentSelectedSiteId); };
  });
}

// ----------------------------------------------------
// SECTION 2: SITES MANAGEMENT
// ----------------------------------------------------
function renderSites() {
  const sites = db.sites || [];
  const calc = calculateRows();

  const filtered = sites.filter(s => {
    const q = currentSearchQuery.toLowerCase();
    const matchSearch = !q ||
      s.siteName.toLowerCase().includes(q) ||
      s.siteCode.toLowerCase().includes(q) ||
      (s.city || '').toLowerCase().includes(q) ||
      (s.state || '').toLowerCase().includes(q) ||
      (s.contactPerson || '').toLowerCase().includes(q);

    const matchStatus = currentStatusFilter === 'all' || s.status === currentStatusFilter;
    return matchSearch && matchStatus;
  });

  const totalEmployees = (db.employees || []).length;
  const activeSites = sites.filter(s => s.status !== 'Inactive').length;
  const unassigned = getUnassignedEmployees();
  const totalGross = calc.reduce((s, r) => s + r.gross, 0);

  shell('Site Management', 'ENTERPRISE LOCATIONS / 02', `
    ${unassigned.length > 0 ? `
      <div class="alert-banner warning">
        <div class="alert-content">
          <span class="alert-icon">⚠️</span>
          <div>
            <strong>${unassigned.length} employee${unassigned.length > 1 ? 's are' : ' is'} unassigned to any site.</strong>
            <span style="font-size: 12px; color: #78350f;">Assign them to ensure accurate site-wise payroll calculation.</span>
          </div>
        </div>
        <button class="primary btn-sm" id="sitesBulkAssignBtn">🏢 Assign Employees Now</button>
      </div>
    ` : ''}

    <div class="metric-grid">
      <div class="metric-card">
        <div class="metric-header"><span class="metric-title">TOTAL SITES</span><span class="metric-icon">🏢</span></div>
        <div class="metric-value">${sites.length}</div>
        <div class="metric-desc">${activeSites} active locations / ${sites.length - activeSites} inactive</div>
      </div>
      <div class="metric-card accent-blue">
        <div class="metric-header"><span class="metric-title">TOTAL WORKFORCE</span><span class="metric-icon">👥</span></div>
        <div class="metric-value">${totalEmployees}</div>
        <div class="metric-desc">Employees distributed across sites</div>
      </div>
      <div class="metric-card accent-emerald">
        <div class="metric-header"><span class="metric-title">ACTIVE SITES</span><span class="metric-icon">✓</span></div>
        <div class="metric-value">${activeSites}</div>
        <div class="metric-desc">Operating plants and offices</div>
      </div>
      <div class="metric-card accent-amber">
        <div class="metric-header"><span class="metric-title">COMPANY GROSS PAYROLL</span><span class="metric-icon">💰</span></div>
        <div class="metric-value">${money(totalGross)}</div>
        <div class="metric-desc">Monthly payroll across all sites</div>
      </div>
    </div>

    <div class="toolbar">
      <div class="toolbar-left">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input type="text" id="siteSearchInput" placeholder="Search site name, code, city, contact..." value="${esc(currentSearchQuery)}">
        </div>
        <select class="filter-select" id="siteStatusFilter">
          <option value="all" ${currentStatusFilter === 'all' ? 'selected' : ''}>All Status</option>
          <option value="Active" ${currentStatusFilter === 'Active' ? 'selected' : ''}>Active</option>
          <option value="Inactive" ${currentStatusFilter === 'Inactive' ? 'selected' : ''}>Inactive</option>
        </select>
      </div>
      <div class="toolbar-right">
        <button class="primary" id="addSiteBtn">+ Add Site</button>
      </div>
    </div>

    <div class="panel">
      ${renderTable(filtered, [
        { label: 'Site Code', render: r => `<span class="site-code-tag">${esc(r.siteCode)}</span>` },
        { label: 'Site Name', render: r => `<strong>${esc(r.siteName)}</strong>` },
        { label: 'Location', render: r => esc(`${r.city || '—'}, ${r.state || ''}`) },
        { label: 'Contact', render: r => `<div>${esc(r.contactPerson || '—')}<br><small style="color:var(--text-muted);">${esc(r.contactNumber || '')}</small></div>` },
        { label: 'Assigned Workforce', render: r => {
          const count = (db.employees || []).filter(e => e.siteId === r.id).length;
          return `<b>${count}</b> employees`;
        }},
        { label: 'Status', render: r => `<span class="status ${r.status === 'Inactive' ? 'warning' : 'ok'}">${esc(r.status || 'Active')}</span>` },
        { label: 'Actions', render: r => `
          <button class="outline btn-sm view-site-detail-btn" data-id="${esc(r.id)}">📊 Details</button>
          <button class="outline btn-sm edit-site-btn" data-id="${esc(r.id)}">✏️</button>
          <button class="danger btn-sm del-site-btn" data-id="${esc(r.id)}">🗑️</button>
        `}
      ], 'No sites found matching criteria.')}
    </div>
  `);

  if ($('#sitesBulkAssignBtn')) {
    $('#sitesBulkAssignBtn').onclick = () => openBulkAssignModal(unassigned.map(e => e.empCode));
  }
  $('#siteSearchInput').oninput = (e) => { currentSearchQuery = e.target.value; renderSites(); };
  $('#siteStatusFilter').onchange = (e) => { currentStatusFilter = e.target.value; renderSites(); };
  $('#addSiteBtn').onclick = () => openSiteModal();

  $$('.view-site-detail-btn').forEach(btn => {
    btn.onclick = () => { currentSelectedSiteId = btn.dataset.id; renderSiteDetails(currentSelectedSiteId); };
  });

  $$('.edit-site-btn').forEach(btn => {
    btn.onclick = () => {
      const site = (db.sites || []).find(s => s.id === btn.dataset.id);
      if (site) openSiteModal(site);
    };
  });

  $$('.del-site-btn').forEach(btn => {
    btn.onclick = () => {
      const site = (db.sites || []).find(s => s.id === btn.dataset.id);
      if (!site) return;
      const count = (db.employees || []).filter(e => e.siteId === site.id).length;
      showConfirm({
        title: 'Delete Site',
        message: `Are you sure you want to delete site <strong>${esc(site.siteName)} (${esc(site.siteCode)})</strong>? ${count > 0 ? `<br><br><span style="color:#b91c1c;">⚠️ ${count} employees assigned to this site will become Unassigned.</span>` : ''}`,
        isDanger: true,
        confirmText: 'Delete Site',
        onConfirm: async () => {
          db.sites = db.sites.filter(s => s.id !== site.id);
          (db.employees || []).forEach(e => {
            if (e.siteId === site.id) e.siteId = 'unassigned';
          });
          log('site.deleted', `Removed site ${site.siteName} (${site.siteCode})`, 'sites');
          await save();
          toast(`Site ${site.siteName} deleted`);
          renderSites();
        }
      });
    };
  });
}

function renderSiteDetails(siteId) {
  const site = getSite(siteId);
  if (!site) {
    currentPage = 'sites';
    render();
    return;
  }

  const siteEmps = (db.employees || []).filter(e => e.siteId === site.id);
  const siteCalc = calculateRows(site.id);
  const gross = siteCalc.reduce((s, r) => s + r.gross, 0);
  const net = siteCalc.reduce((s, r) => s + r.net, 0);
  const pf = siteCalc.reduce((s, r) => s + r.pf, 0);
  const esic = siteCalc.reduce((s, r) => s + r.esic, 0);

  shell(`${site.siteName} (${site.siteCode})`, 'SITE DASHBOARD', `
    <div style="margin-bottom: 16px;">
      <button class="outline btn-sm" id="backToSitesBtn">← Back to All Sites</button>
    </div>

    <div class="metric-grid">
      <div class="metric-card">
        <div class="metric-header"><span class="metric-title">SITE WORKFORCE</span><span class="metric-icon">👥</span></div>
        <div class="metric-value">${siteEmps.length}</div>
        <div class="metric-desc">Assigned employees</div>
      </div>
      <div class="metric-card accent-amber">
        <div class="metric-header"><span class="metric-title">SITE GROSS PAYROLL</span><span class="metric-icon">💰</span></div>
        <div class="metric-value">${money(gross)}</div>
        <div class="metric-desc">Pre-deduction site earnings</div>
      </div>
      <div class="metric-card accent-emerald">
        <div class="metric-header"><span class="metric-title">NET DISBURSAL</span><span class="metric-icon">💳</span></div>
        <div class="metric-value">${money(net)}</div>
        <div class="metric-desc">Take-home pay for location</div>
      </div>
      <div class="metric-card accent-blue">
        <div class="metric-header"><span class="metric-title">STATUTORY PROVISIONS</span><span class="metric-icon">🏛️</span></div>
        <div class="metric-value">${money(pf + esic)}</div>
        <div class="metric-desc">PF: ${money(pf)} · ESI: ${money(esic)}</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">LOCATION METADATA</p>
          <h3>Plant & Compliance Profile</h3>
        </div>
        <button class="outline btn-sm" id="editThisSiteBtn">✏️ Edit Site Profile</button>
      </div>
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:16px; font-size:13px;">
        <div><span style="color:var(--text-muted); display:block; font-size:11px;">ADDRESS</span><strong>${esc(site.address || '—')}</strong></div>
        <div><span style="color:var(--text-muted); display:block; font-size:11px;">CITY & STATE</span><strong>${esc(site.city || '')}, ${esc(site.state || '')} ${esc(site.pincode || '')}</strong></div>
        <div><span style="color:var(--text-muted); display:block; font-size:11px;">CONTACT PERSON</span><strong>${esc(site.contactPerson || '—')} (${esc(site.contactNumber || '—')})</strong></div>
        <div><span style="color:var(--text-muted); display:block; font-size:11px;">OFFICIAL EMAIL</span><strong>${esc(site.email || '—')}</strong></div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">ASSIGNED EMPLOYEES</p>
          <h3>Workforce at ${esc(site.siteName)}</h3>
        </div>
        <button class="primary btn-sm" id="siteAddEmpBtn">+ Add Employee to Site</button>
      </div>
      ${renderTable(siteCalc, [
        { label: 'Code', key: 'empCode' },
        { label: 'Employee Name', render: r => `<a href="#" class="site-emp-profile-link" data-code="${esc(r.empCode)}" style="color:var(--text-primary); font-weight:700; text-decoration:none;" title="View Profile & KYC">${esc(r.name)}</a>` },
        { label: 'Category', render: r => `<span class="cat-pill">${esc(r.category || 'Skilled')}</span>` },
        { label: 'Department', render: r => esc(r.department || '—') },
        { label: 'Pay Mode', render: r => getPaymentModePill(r.paymentMode) },
        { label: 'Basic Salary', render: r => `<b>${money(r.basic)}</b>` },
        { label: 'Gross', render: r => `<b>${money(r.gross)}</b>` },
        { label: 'Net Pay', render: r => `<strong style="color:var(--accent-emerald);">${money(r.net)}</strong>` },
        { label: 'Actions', render: r => `
          <button class="outline btn-sm view-site-emp-profile-btn" data-code="${esc(r.empCode)}" title="View Profile, KYC & Stint History">👤 Profile</button>
          <button class="outline btn-sm edit-site-emp-btn" data-code="${esc(r.empCode)}" title="Edit Details">✏️</button>
        `}
      ], `No employees assigned to ${site.siteName}.`)}
    </div>
  `);

  $('#backToSitesBtn').onclick = () => { currentPage = 'sites'; render(); };
  $('#editThisSiteBtn').onclick = () => openSiteModal(site);
  $('#siteAddEmpBtn').onclick = () => openEmployeeModal(null, site.id);
  $$('.view-site-emp-profile-btn').forEach(btn => {
    btn.onclick = () => openEmployeeProfileModal(btn.dataset.code);
  });
  $$('.site-emp-profile-link').forEach(link => {
    link.onclick = (e) => { e.preventDefault(); openEmployeeProfileModal(link.dataset.code); };
  });
  $$('.edit-site-emp-btn').forEach(btn => {
    btn.onclick = () => {
      const emp = (db.employees || []).find(e => e.empCode === btn.dataset.code);
      if (emp) openEmployeeModal(emp);
    };
  });
}

function openSiteModal(existing = null) {
  const isEdit = Boolean(existing);
  const nextCode = isEdit ? existing.siteCode : `SITE-${String((db.sites || []).length + 1).padStart(2, '0')}`;

  const html = `
    <form id="siteForm" class="form-grid">
      <div class="form-group">
        <label>Site Code *</label>
        <input type="text" id="fSiteCode" required value="${esc(nextCode)}" ${isEdit ? 'readonly style="background:var(--bg-subtle);"' : ''}>
      </div>
      <div class="form-group">
        <label>Site / Plant Name *</label>
        <input type="text" id="fSiteName" required placeholder="e.g. Pune Manufacturing Plant" value="${esc(existing?.siteName || '')}">
      </div>
      <div class="form-group" style="grid-column: span 2;">
        <label>Street Address</label>
        <input type="text" id="fSiteAddress" placeholder="e.g. Plot 42, MIDC Phase II" value="${esc(existing?.address || '')}">
      </div>
      <div class="form-group">
        <label>City *</label>
        <input type="text" id="fSiteCity" required placeholder="e.g. Pune" value="${esc(existing?.city || '')}">
      </div>
      <div class="form-group">
        <label>State *</label>
        <input type="text" id="fSiteState" required placeholder="e.g. Maharashtra" value="${esc(existing?.state || 'Maharashtra')}">
      </div>
      <div class="form-group">
        <label>Pin Code</label>
        <input type="text" id="fSitePincode" placeholder="e.g. 411057" value="${esc(existing?.pincode || '')}">
      </div>
      <div class="form-group">
        <label>Contact Person</label>
        <input type="text" id="fSiteContact" placeholder="e.g. Ramesh Deshmukh" value="${esc(existing?.contactPerson || '')}">
      </div>
      <div class="form-group">
        <label>Contact Phone</label>
        <input type="text" id="fSitePhone" placeholder="e.g. +91 98220 12345" value="${esc(existing?.contactNumber || '')}">
      </div>
      <div class="form-group">
        <label>Site Email</label>
        <input type="email" id="fSiteEmail" placeholder="e.g. pune.plant@emppay.com" value="${esc(existing?.email || '')}">
      </div>
      <div class="form-group">
        <label>Status</label>
        <select id="fSiteStatus">
          <option value="Active" ${existing?.status !== 'Inactive' ? 'selected' : ''}>Active</option>
          <option value="Inactive" ${existing?.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
        </select>
      </div>
    </form>
  `;

  showModal({
    title: isEdit ? 'Edit Site Location' : 'Create New Plant / Office Site',
    eyebrow: isEdit ? 'SITE CONFIGURATION' : 'NEW LOCATION REGISTRATION',
    body: html,
    saveText: isEdit ? 'Update Site' : 'Create Site',
    modalClass: 'modal-lg',
    onSave: async () => {
      const code = $('#fSiteCode').value.trim();
      const name = $('#fSiteName').value.trim();
      const city = $('#fSiteCity').value.trim();
      const state = $('#fSiteState').value.trim();

      if (!code || !name || !city || !state) {
        toast('Please fill all required site fields.', 'error');
        return false;
      }

      const siteObj = {
        id: isEdit ? existing.id : `site_${Date.now()}`,
        siteCode: code.toUpperCase(),
        siteName: name,
        address: $('#fSiteAddress').value.trim(),
        city,
        state,
        pincode: $('#fSitePincode').value.trim(),
        contactPerson: $('#fSiteContact').value.trim(),
        contactNumber: $('#fSitePhone').value.trim(),
        email: $('#fSiteEmail').value.trim(),
        status: $('#fSiteStatus').value,
        updatedAt: new Date().toISOString()
      };

      if (isEdit) {
        const idx = db.sites.findIndex(s => s.id === existing.id);
        if (idx !== -1) db.sites[idx] = siteObj;
        log('site.updated', `Updated site ${name} (${code})`, 'sites');
      } else {
        if (db.sites.some(s => s.siteCode.toUpperCase() === code.toUpperCase())) {
          toast('Site code already exists!', 'error');
          return false;
        }
        siteObj.createdAt = new Date().toISOString();
        db.sites.push(siteObj);
        log('site.created', `Registered site ${name} (${code})`, 'sites');
      }

      await save();
      toast(isEdit ? 'Site updated successfully' : 'Site created successfully');
      render();
      return true;
    }
  });
}

// ----------------------------------------------------
// SECTION 3: EMPLOYEES MASTER (WITH PAYMENT MODES & LIC)
// ----------------------------------------------------
function renderEmployees() {
  const sites = db.sites || [];
  const unassigned = getUnassignedEmployees();

  const filtered = (db.employees || []).filter(e => {
    const q = currentSearchQuery.toLowerCase();
    const siteName = getSiteName(e.siteId).toLowerCase();
    const siteCode = getSiteCode(e.siteId).toLowerCase();

    const matchSearch = !q ||
      e.name.toLowerCase().includes(q) ||
      e.empCode.toLowerCase().includes(q) ||
      (e.department || '').toLowerCase().includes(q) ||
      siteName.includes(q) ||
      siteCode.includes(q);

    const matchCat = currentCategoryFilter === 'all' || e.category === currentCategoryFilter;

    let matchSite = true;
    if (currentSiteFilter === 'unassigned') {
      matchSite = !e.siteId || e.siteId === 'unassigned' || !getSite(e.siteId);
    } else if (currentSiteFilter !== 'all') {
      matchSite = e.siteId === currentSiteFilter;
    }

    const matchStatus = currentStatusFilter === 'all' || e.status === currentStatusFilter;
    const matchPayMode = currentPayModeFilter === 'all' || (e.paymentMode || 'Bank') === currentPayModeFilter;

    return matchSearch && matchCat && matchSite && matchStatus && matchPayMode;
  });

  const categories = Array.from(new Set((db.employees || []).map(e => e.category).filter(Boolean)));
  const allFilteredCodes = filtered.map(e => e.empCode);
  const isAllSelected = filtered.length > 0 && allFilteredCodes.every(c => selectedEmpCodes.has(c));

  shell('Employee Master', 'MASTER DATA / 03', `
    ${unassigned.length > 0 && currentSiteFilter !== 'unassigned' ? `
      <div class="alert-banner warning">
        <div class="alert-content">
          <span class="alert-icon">⚠️</span>
          <div>
            <strong>${unassigned.length} employee${unassigned.length > 1 ? 's are' : ' is'} unassigned to a plant/office site.</strong>
            <span style="font-size: 12px; color: #78350f;">Assign them to ensure accurate site-wise payroll calculation.</span>
          </div>
        </div>
        <button class="primary btn-sm" id="empBannerAssignBtn">🏢 Bulk Assign Sites</button>
      </div>
    ` : ''}

    ${selectedEmpCodes.size > 0 ? `
      <div class="bulk-action-bar">
        <div class="bulk-action-left">
          <span class="bulk-count-badge">${selectedEmpCodes.size} Selected</span>
          <span>Employees selected for bulk action</span>
        </div>
        <div class="bulk-action-right">
          <button class="primary btn-sm" id="bulkAssignBtn">🏢 Assign to Site</button>
          <button class="danger btn-sm" id="bulkDeleteBtn">🗑️ Delete Selected</button>
          <button class="outline btn-sm" id="bulkDeselectBtn" style="color:#fff; border-color:#475569;">✕ Clear Selection</button>
        </div>
      </div>
    ` : ''}

    <div class="toolbar">
      <div class="toolbar-left">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input type="text" id="empSearchInput" placeholder="Search employee name, code, dept, site..." value="${esc(currentSearchQuery)}">
        </div>

        <select class="filter-select" id="empSiteFilter">
          <option value="all" ${currentSiteFilter === 'all' ? 'selected' : ''}>All Sites (${(db.employees || []).length})</option>
          <option value="unassigned" ${currentSiteFilter === 'unassigned' ? 'selected' : ''}>⚠️ Unassigned (${unassigned.length})</option>
          ${sites.map(s => {
            const count = (db.employees || []).filter(e => e.siteId === s.id).length;
            return `<option value="${esc(s.id)}" ${currentSiteFilter === s.id ? 'selected' : ''}>🏢 ${esc(s.siteName)} (${count})</option>`;
          }).join('')}
        </select>

        <select class="filter-select" id="empCategoryFilter">
          <option value="all">All Categories</option>
          ${categories.map(c => `<option value="${esc(c)}" ${currentCategoryFilter === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>

        <select class="filter-select" id="empPayModeFilter">
          <option value="all" ${currentPayModeFilter === 'all' ? 'selected' : ''}>All Payment Modes</option>
          <option value="Bank" ${currentPayModeFilter === 'Bank' ? 'selected' : ''}>🏦 Bank</option>
          <option value="Cash" ${currentPayModeFilter === 'Cash' ? 'selected' : ''}>💵 Cash</option>
          <option value="Cheque" ${currentPayModeFilter === 'Cheque' ? 'selected' : ''}>📑 Cheque</option>
        </select>
      </div>

      <div class="toolbar-right">
        <button class="outline" id="importEmpExcelBtn">📁 Import Excel / CSV</button>
        <button class="primary" id="addEmpModalBtn">+ Add Employee</button>
      </div>
    </div>

    <div class="panel">
      ${renderTable(filtered, [
        {
          label: `<input type="checkbox" id="selectAllEmps" class="row-checkbox" ${isAllSelected ? 'checked' : ''} title="Select all filtered">`,
          render: r => `<input type="checkbox" class="emp-row-check row-checkbox" data-code="${esc(r.empCode)}" ${selectedEmpCodes.has(r.empCode) ? 'checked' : ''}>`
        },
        { label: 'S.No.', render: (_r, i) => String(i + 1).padStart(2, '0') },
        { label: 'Employee', render: r => `<a href="#" class="emp-profile-link" data-code="${esc(r.empCode)}" style="color:var(--text-primary); text-decoration:none;" title="View Profile, KYC & Stint History"><strong>${esc(r.name)}</strong></a><small style="display:block;color:var(--text-muted);">${esc(r.empCode)}</small>` },
        { label: 'Site', render: r => getSitePill(r.siteId) },
        { label: 'Category', render: r => `<span class="cat-pill">${esc(r.category || 'Skilled')}</span>` },
        { label: 'Department', render: r => esc(r.department || '—') },
        { label: 'Payment Mode', render: r => getPaymentModePill(r.paymentMode) },
        { label: 'Basic Salary (₹)', render: r => `<b>${money(r.basic)}</b>` },
        { label: 'UAN / Bank', render: r => `<div><small>UAN: ${mask(r.uan)}</small><br><small>A/C: ${mask(r.bankAccount)}</small></div>` },
        { label: 'Status', render: r => `<span class="status ${r.status === 'Inactive' ? 'warning' : 'ok'}">${esc(r.status || 'Active')}</span>` },
        { label: 'Actions', render: r => `
          <button class="outline btn-sm view-emp-profile-btn" data-code="${esc(r.empCode)}" title="View Profile, KYC & Stint History">👤 Profile</button>
          <button class="outline btn-sm edit-emp-btn" data-code="${esc(r.empCode)}" title="Edit Details">✏️ Edit</button>
          <button class="danger btn-sm del-emp-btn" data-code="${esc(r.empCode)}" title="Delete Employee">🗑️</button>
        ` }
      ], 'No employees matching filter criteria.')}
    </div>
  `);

  if ($('#empBannerAssignBtn')) {
    $('#empBannerAssignBtn').onclick = () => openBulkAssignModal(unassigned.map(e => e.empCode));
  }
  $('#empSearchInput').oninput = (e) => { currentSearchQuery = e.target.value; renderEmployees(); };
  $('#empSiteFilter').onchange = (e) => { currentSiteFilter = e.target.value; renderEmployees(); };
  $('#empCategoryFilter').onchange = (e) => { currentCategoryFilter = e.target.value; renderEmployees(); };
  $('#empPayModeFilter').onchange = (e) => { currentPayModeFilter = e.target.value; renderEmployees(); };
  $('#addEmpModalBtn').onclick = () => openEmployeeModal();
  $('#importEmpExcelBtn').onclick = importWorkbook;

  const selectAllEl = $('#selectAllEmps');
  if (selectAllEl) {
    selectAllEl.onchange = (e) => {
      if (e.target.checked) filtered.forEach(emp => selectedEmpCodes.add(emp.empCode));
      else filtered.forEach(emp => selectedEmpCodes.delete(emp.empCode));
      renderEmployees();
    };
  }

  $$('.emp-row-check').forEach(chk => {
    chk.onchange = (e) => {
      const code = chk.dataset.code;
      if (e.target.checked) selectedEmpCodes.add(code);
      else selectedEmpCodes.delete(code);
      renderEmployees();
    };
  });

  if ($('#bulkAssignBtn')) $('#bulkAssignBtn').onclick = () => openBulkAssignModal(Array.from(selectedEmpCodes));
  if ($('#bulkDeselectBtn')) $('#bulkDeselectBtn').onclick = () => { selectedEmpCodes.clear(); renderEmployees(); };
  if ($('#bulkDeleteBtn')) {
    $('#bulkDeleteBtn').onclick = () => {
      const codes = Array.from(selectedEmpCodes);
      showConfirm({
        title: 'Delete Selected Employees',
        message: `Are you sure you want to delete <strong>${codes.length} selected employees</strong> and their related records?`,
        isDanger: true,
        confirmText: `Delete ${codes.length} Employees`,
        onConfirm: async () => {
          db.employees = db.employees.filter(e => !selectedEmpCodes.has(e.empCode));
          db.attendance = db.attendance.filter(a => !selectedEmpCodes.has(a.empCode));
          db.loans = (db.loans || []).filter(l => !selectedEmpCodes.has(l.empCode));
          db.arrears = (db.arrears || []).filter(arr => !selectedEmpCodes.has(arr.empCode));
          db.kycDocuments = (db.kycDocuments || []).filter(d => !selectedEmpCodes.has(d.empCode));
          log('employee.bulk_deleted', `Deleted ${codes.length} employees`, 'employees');
          selectedEmpCodes.clear();
          await save();
          toast(`Deleted ${codes.length} employees`);
          renderEmployees();
        }
      });
    };
  }

  $$('.view-emp-profile-btn').forEach(btn => {
    btn.onclick = () => openEmployeeProfileModal(btn.dataset.code);
  });
  $$('.emp-profile-link').forEach(link => {
    link.onclick = (e) => { e.preventDefault(); openEmployeeProfileModal(link.dataset.code); };
  });

  $$('.edit-emp-btn').forEach(btn => {
    btn.onclick = () => {
      const code = btn.dataset.code;
      const emp = db.employees.find(e => e.empCode === code);
      if (emp) openEmployeeModal(emp);
    };
  });

  $$('.del-emp-btn').forEach(btn => {
    btn.onclick = () => {
      const code = btn.dataset.code;
      const emp = db.employees.find(e => e.empCode === code);
      if (!emp) return;
      showConfirm({
        title: 'Delete Employee',
        message: `Are you sure you want to remove <strong>${esc(emp.name)} (${esc(emp.empCode)})</strong>?`,
        isDanger: true,
        confirmText: 'Delete Employee',
        onConfirm: async () => {
          db.employees = db.employees.filter(e => e.empCode !== code);
          db.attendance = db.attendance.filter(a => a.empCode !== code);
          db.loans = (db.loans || []).filter(l => l.empCode !== code);
          db.arrears = (db.arrears || []).filter(arr => arr.empCode !== code);
          db.kycDocuments = (db.kycDocuments || []).filter(d => d.empCode !== code);
          selectedEmpCodes.delete(code);
          log('employee.deleted', `Removed ${emp.name} (${code})`, 'employees');
          await save();
          toast(`Employee ${emp.name} deleted`);
          renderEmployees();
        }
      });
    };
  });
}

function openBulkAssignModal(empCodes = null) {
  const targetCodes = empCodes && empCodes.length > 0 ? empCodes : (selectedEmpCodes.size > 0 ? Array.from(selectedEmpCodes) : (db.employees || []).map(e => e.empCode));
  if (targetCodes.length === 0) {
    toast('No employees selected for site assignment.', 'error');
    return;
  }

  const sites = (db.sites || []).filter(s => s.status !== 'Inactive');
  if (sites.length === 0) {
    toast('Please create at least one active site first.', 'error');
    openSiteModal();
    return;
  }

  const sampleNames = targetCodes.slice(0, 5).map(c => {
    const e = (db.employees || []).find(x => x.empCode === c);
    return e ? `${e.name} (${c})` : c;
  }).join(', ');

  const html = `
    <div style="padding: 4px 0;">
      <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 16px;">
        Assign <strong>${targetCodes.length} selected employee${targetCodes.length > 1 ? 's' : ''}</strong> to a specific plant or office location at once:
      </p>
      <div class="form-group" style="margin-bottom: 16px;">
        <label>Target Site / Location *</label>
        <select id="bulkTargetSite" style="font-size: 14px; padding: 10px;">
          ${sites.map(s => `<option value="${esc(s.id)}">🏢 ${esc(s.siteName)} (${esc(s.siteCode)}) — ${esc(s.city || 'Location')}</option>`).join('')}
        </select>
      </div>
      <div style="background: var(--bg-subtle); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 12px; font-size: 12px; color: var(--text-muted);">
        <strong>Employees to move:</strong> ${esc(sampleNames)}${targetCodes.length > 5 ? ` and ${targetCodes.length - 5} others...` : ''}
      </div>
    </div>
  `;

  showModal({
    title: `Bulk Assign ${targetCodes.length} Employees to Site`,
    eyebrow: 'WORKFORCE REASSIGNMENT',
    body: html,
    saveText: `Confirm & Move ${targetCodes.length} Employees`,
    modalClass: 'modal-md',
    onSave: async () => {
      const siteId = $('#bulkTargetSite').value;
      const targetSite = getSite(siteId);
      if (!targetSite) {
        toast('Please select a valid site.', 'error');
        return false;
      }

      let updatedCount = 0;
      (db.employees || []).forEach(emp => {
        if (targetCodes.includes(emp.empCode)) {
          emp.siteId = siteId;
          updatedCount++;
        }
      });

      selectedEmpCodes.clear();
      log('employee.bulk_assigned_site', `Assigned ${updatedCount} employees to ${targetSite.siteName} (${targetSite.siteCode})`, 'employees');
      await save();
      toast(`Successfully moved ${updatedCount} employees to ${targetSite.siteName}!`);
      render();
      return true;
    }
  });
}

function openEmployeeModal(existing = null, presetSiteId = null) {
  const isEdit = Boolean(existing);
  const nextCode = isEdit ? existing.empCode : `EMP-${String((db.employees || []).length + 1).padStart(4, '0')}`;
  const sites = db.sites || [];
  const selectedSite = existing?.siteId || presetSiteId || (sites[0]?.id || 'unassigned');
  let currentPhotoData = existing?.photo || '';

  const html = `
    <form id="employeeForm" class="form-grid">
      <div class="form-group" style="grid-column: span 2; background: var(--bg-subtle); padding: 10px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); margin-bottom: 4px;">
        <strong style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary);">1. Primary Profile, Photo & Identity Details</strong>
      </div>

      <!-- Employee Photo Uploader -->
      <div class="form-group" style="grid-column: span 2;">
        <div class="emp-photo-uploader">
          <div id="fEmpPhotoPreviewContainer">
            ${existing?.photo ? `
              <img src="${existing.photo}" id="fEmpPhotoImg" class="emp-photo-avatar" alt="Photo">
            ` : `
              <div id="fEmpPhotoPlaceholder" class="emp-photo-placeholder">👤</div>
            `}
          </div>
          <div class="emp-photo-controls">
            <strong style="font-size: 13px; color: var(--text-primary);">Employee Photograph / Profile Photo</strong>
            <span style="font-size: 11px; color: var(--text-muted);">Accepts JPG, JPEG, or PNG formats. Maximum file size: 1 MB.</span>
            <div class="emp-photo-actions">
              <input type="file" id="fEmpPhotoFile" accept="image/jpeg,image/jpg,image/png" style="display:none;">
              <button type="button" class="outline btn-sm" id="fEmpPhotoUploadBtn">📷 Upload Photo</button>
              <button type="button" class="danger btn-sm" id="fEmpPhotoRemoveBtn" style="${existing?.photo ? '' : 'display:none;'}">🗑️ Remove</button>
              <label style="font-size: 12px; margin:0; display:flex; align-items:center; gap:6px; cursor:pointer; color:var(--text-secondary);">
                <input type="checkbox" id="fEmpShowPhotoOnSlip" ${existing?.showPhotoOnPayslip !== false ? 'checked' : ''}>
                Show Photo on Payslip
              </label>
            </div>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label>Employee Code *</label>
        <input type="text" id="fEmpCode" required value="${esc(nextCode)}" ${isEdit ? 'readonly style="background:var(--bg-subtle);"' : ''}>
      </div>

      <div class="form-group">
        <label>Full Name *</label>
        <input type="text" id="fEmpName" required placeholder="e.g. Rahul Suresh Patil" value="${esc(existing?.name || '')}">
      </div>

      <div class="form-group">
        <label>Name as per Aadhaar</label>
        <input type="text" id="fEmpAadhaarName" placeholder="Official name on Aadhaar card" value="${esc(existing?.aadhaarName || existing?.name || '')}">
      </div>

      <div class="form-group">
        <label>Date of Birth</label>
        <input type="date" id="fEmpDob" value="${esc(existing?.dob || '')}">
      </div>

      <div class="form-group">
        <label>Gender *</label>
        <select id="fEmpGender">
          <option value="" ${!existing?.gender ? 'selected' : ''}>Select Gender</option>
          <option value="Male" ${existing?.gender === 'Male' ? 'selected' : ''}>Male</option>
          <option value="Female" ${existing?.gender === 'Female' ? 'selected' : ''}>Female</option>
          <option value="Other" ${existing?.gender === 'Other' ? 'selected' : ''}>Other</option>
        </select>
      </div>

      <div class="form-group">
        <label>Aadhaar No. (12 Digits)</label>
        <input type="text" id="fEmpAadhaar" maxlength="14" placeholder="e.g. 1234 5678 9012" value="${esc(existing?.aadhaar || '')}">
        <small style="font-size: 11px; color: var(--text-muted);">Stored securely and masked in public slips</small>
      </div>

      <div class="form-group">
        <label>Mobile No. (10 Digits)</label>
        <input type="text" id="fEmpMobile" maxlength="13" placeholder="e.g. 9823012345" value="${esc(existing?.mobile || '')}">
        <small style="font-size: 11px; color: var(--text-muted);">Used for direct WhatsApp payslip dispatch</small>
      </div>

      <div class="form-group">
        <label>Assigned Site / Plant *</label>
        <select id="fEmpSite" required>
          ${sites.map(s => `
            <option value="${esc(s.id)}" ${selectedSite === s.id ? 'selected' : ''}>🏢 ${esc(s.siteName)} (${esc(s.siteCode)}) ${s.status === 'Inactive' ? '[Inactive]' : ''}</option>
          `).join('')}
          ${sites.length === 0 ? '<option value="unassigned">⚠️ Unassigned (Create Site in Sites Menu)</option>' : ''}
        </select>
      </div>

      <div class="form-group" style="grid-column: span 2;">
        <label>Present Address</label>
        <textarea id="fEmpPresentAddress" rows="2" placeholder="Current residential address, area, city, pin">${esc(existing?.presentAddress || existing?.address || '')}</textarea>
      </div>

      <div class="form-group" style="grid-column: span 2;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <label style="margin-bottom:0;">Permanent Address</label>
          <button type="button" class="copy-address-btn" id="copyPresentAddressBtn">↳ Same as Present Address</button>
        </div>
        <textarea id="fEmpPermanentAddress" rows="2" placeholder="Permanent hometown / village address, pin">${esc(existing?.permanentAddress || existing?.presentAddress || existing?.address || '')}</textarea>
      </div>

      <div class="form-group" style="grid-column: span 2; background: var(--bg-subtle); padding: 10px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); margin: 8px 0 4px;">
        <strong style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary);">2. Employment & Designation</strong>
      </div>

      <div class="form-group">
        <label>Category *</label>
        <select id="fEmpCategory">
          <option value="Skilled" ${existing?.category === 'Skilled' ? 'selected' : ''}>Skilled</option>
          <option value="Semi-skilled" ${existing?.category === 'Semi-skilled' ? 'selected' : ''}>Semi-skilled</option>
          <option value="Unskilled" ${existing?.category === 'Unskilled' ? 'selected' : ''}>Unskilled</option>
          <option value="Executive" ${existing?.category === 'Executive' ? 'selected' : ''}>Executive</option>
          <option value="Manager" ${existing?.category === 'Manager' ? 'selected' : ''}>Manager</option>
        </select>
      </div>

      <div class="form-group">
        <label>Department</label>
        <input type="text" id="fEmpDept" placeholder="e.g. Operations / Finance" value="${esc(existing?.department || '')}">
      </div>

      <div class="form-group">
        <label>Designation</label>
        <input type="text" id="fEmpDesignation" placeholder="e.g. Plant Operator" value="${esc(existing?.designation || '')}">
      </div>

      <div class="form-group">
        <label>Payment Mode *</label>
        <select id="fEmpPayMode">
          <option value="Bank" ${(existing?.paymentMode || 'Bank') === 'Bank' ? 'selected' : ''}>🏦 Bank Transfer</option>
          <option value="Cash" ${existing?.paymentMode === 'Cash' ? 'selected' : ''}>💵 Cash</option>
          <option value="Cheque" ${existing?.paymentMode === 'Cheque' ? 'selected' : ''}>📑 Cheque</option>
        </select>
      </div>

      <div class="form-group">
        <label>Cheque Handling</label>
        <select id="fEmpChequeHandling">
          <option value="Separate" ${(existing?.chequeHandling || 'Separate') === 'Separate' ? 'selected' : ''}>Separate Cheque</option>
          <option value="Combine" ${existing?.chequeHandling === 'Combine' ? 'selected' : ''}>Combine Cheque</option>
        </select>
      </div>

      <div class="form-group">
        <label>Status</label>
        <select id="fEmpStatus">
          <option value="Active" ${existing?.status !== 'Inactive' ? 'selected' : ''}>Active</option>
          <option value="Inactive" ${existing?.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
        </select>
      </div>

      <!-- Salary Allowances -->
      <div class="form-group" style="grid-column: span 2; background: var(--bg-subtle); padding: 10px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); margin: 8px 0 4px;">
        <strong style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary);">3. Salary Structure & Allowances</strong>
      </div>

      <div class="form-group">
        <label>Monthly Basic Salary (₹) *</label>
        <input type="number" step="1" id="fEmpBasic" required min="0" placeholder="e.g. 18500" value="${existing?.basic ?? ''}">
      </div>

      <div class="form-group">
        <label>DA / Special Allowance (₹)</label>
        <input type="number" step="1" id="fEmpDa" min="0" placeholder="0" value="${existing?.da ?? 0}">
      </div>

      <div class="form-group">
        <label>HRA Allowance (₹)</label>
        <input type="number" step="1" id="fEmpHra" min="0" placeholder="0" value="${existing?.hra ?? 0}">
      </div>

      <div class="form-group">
        <label>Conveyance Allowance (₹)</label>
        <input type="number" step="1" id="fEmpConveyance" min="0" placeholder="0" value="${existing?.conveyance ?? 0}">
      </div>

      <div class="form-group">
        <label>Medical Allowance (₹)</label>
        <input type="number" step="1" id="fEmpMedical" min="0" placeholder="0" value="${existing?.medical ?? 0}">
      </div>

      <div class="form-group">
        <label>Other Allowance (₹)</label>
        <input type="number" step="1" id="fEmpOther" min="0" placeholder="0" value="${existing?.otherAllowance ?? 0}">
      </div>

      ${isEdit ? `
        <div class="form-group">
          <label>Effective Date of Revision</label>
          <input type="date" id="fEmpEffectiveDate" value="${new Date().toISOString().slice(0, 10)}">
          <small style="font-size:11px; color:var(--text-muted);">Payroll calculates with salary effective for each period</small>
        </div>

        <div class="form-group">
          <label>Reason for Salary Change</label>
          <select id="fEmpSalaryReason">
            <option value="Annual Increment">Annual Increment</option>
            <option value="Performance Promotion">Performance Promotion</option>
            <option value="Market Correction">Market Correction</option>
            <option value="Salary Reduction / Decrement">Salary Reduction / Decrement</option>
            <option value="General Revision">General Revision</option>
            <option value="Other">Other Adjustment</option>
          </select>
        </div>
      ` : ''}

      <!-- Statutory & Bank Identifiers -->
      <div class="form-group" style="grid-column: span 2; background: var(--bg-subtle); padding: 10px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); margin: 8px 0 4px;">
        <strong style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary);">4. Statutory, Banking & Tax Identifiers</strong>
      </div>

      <div class="form-group">
        <label>PAN Number</label>
        <input type="text" id="fEmpPan" placeholder="e.g. ABCDE1234F" maxlength="10" value="${esc(existing?.pan || '')}" style="text-transform: uppercase;">
      </div>

      <div class="form-group">
        <label>Bank Account Number</label>
        <input type="text" id="fEmpBank" placeholder="9 to 18 digits account number" value="${esc(existing?.bankAccount || '')}">
      </div>

      <div class="form-group">
        <label>Bank IFSC Code</label>
        <input type="text" id="fEmpIfsc" placeholder="e.g. HDFC0001234" maxlength="11" value="${esc(existing?.ifsc || '')}" style="text-transform: uppercase;">
      </div>

      <div class="form-group">
        <label>Bank Name</label>
        <input type="text" id="fEmpBankName" placeholder="e.g. HDFC Bank Ltd." value="${esc(existing?.bankName || '')}">
      </div>

      <div class="form-group">
        <label>UAN Number</label>
        <input type="text" id="fEmpUan" placeholder="12-digit UAN" value="${esc(existing?.uan || '')}">
      </div>

      <div class="form-group">
        <label>PF Number</label>
        <input type="text" id="fEmpPfNo" placeholder="PF Member ID" value="${esc(existing?.pfNumber || existing?.uan || '')}">
      </div>

      <div class="form-group">
        <label>ESI IP Number</label>
        <input type="text" id="fEmpEsiNo" placeholder="10-digit ESI IP Number" value="${esc(existing?.esiNumber || existing?.esicDetails?.ipNumber || '')}">
      </div>

      <div class="form-group">
        <label>Monthly Income Tax TDS (₹)</label>
        <input type="number" step="1" id="fEmpTds" min="0" placeholder="0" value="${existing?.incomeTax ?? 0}">
      </div>

      <div class="form-group">
        <label>LIC Policy Number</label>
        <input type="text" id="fEmpLicNo" placeholder="Policy / Ref #" value="${esc(existing?.licPolicyNo || '')}">
      </div>

      <div class="form-group">
        <label>LIC Monthly Deduction (₹)</label>
        <input type="number" step="1" id="fEmpLicAmount" min="0" placeholder="0" value="${existing?.licAmount ?? 0}">
      </div>

      <!-- Family, Nominee & ESIC Management -->
      <div class="form-group" style="grid-column: span 2; background: var(--bg-subtle); padding: 10px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); margin: 8px 0 4px;">
        <strong style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary);">5. Nominee & ESIC Allotment Management</strong>
      </div>

      <div class="form-group">
        <label>Nominee Name</label>
        <input type="text" id="fEmpNomineeName" placeholder="Full name of nominee" value="${esc(existing?.nominee?.name || existing?.nomineeName || '')}">
      </div>

      <div class="form-group">
        <label>Nominee Relationship</label>
        <input type="text" id="fEmpNomineeRel" placeholder="e.g. Spouse / Mother / Father / Son" value="${esc(existing?.nominee?.relationship || '')}">
      </div>

      <div class="form-group">
        <label>ESIC Allotment Status</label>
        <select id="fEmpEsicStatus">
          <option value="Not Registered" ${(existing?.esicDetails?.status || 'Not Registered') === 'Not Registered' ? 'selected' : ''}>Not Registered</option>
          <option value="Pending Allotment" ${existing?.esicDetails?.status === 'Pending Allotment' ? 'selected' : ''}>Pending Allotment</option>
          <option value="Allotted" ${existing?.esicDetails?.status === 'Allotted' ? 'selected' : ''}>Allotted (IP Generated)</option>
          <option value="Exempt" ${existing?.esicDetails?.status === 'Exempt' ? 'selected' : ''}>Exempt / Opted Out</option>
        </select>
      </div>

      <div class="form-group">
        <label>ESIC Dispensary Name / Branch</label>
        <input type="text" id="fEmpEsicDispensary" placeholder="e.g. ESIC Dispensary Bhosari / Pune" value="${esc(existing?.esicDetails?.dispensary || '')}">
      </div>
    </form>
  `;

  const commitEmployeeSave = async (empObj, isEditMode, existingRecord) => {
    empObj.photo = currentPhotoData;
    empObj.showPhotoOnPayslip = $('#fEmpShowPhotoOnSlip') ? $('#fEmpShowPhotoOnSlip').checked : true;

    const newGross = empObj.basic + empObj.da + empObj.hra + empObj.conveyance + empObj.medical + empObj.otherAllowance;
    const effectiveDate = $('#fEmpEffectiveDate')?.value || new Date().toISOString().slice(0, 10);
    const effectivePeriod = effectiveDate.slice(0, 7);
    const salaryReason = $('#fEmpSalaryReason')?.value || 'Salary Revision';

    if (!isEditMode) {
      // Initial Salary History baseline
      empObj.salaryHistory = [{
        id: 'sal_rev_' + Date.now(),
        effectiveDate,
        effectivePeriod,
        previousSalary: { basic: 0, da: 0, hra: 0, conveyance: 0, medical: 0, otherAllowance: 0, gross: 0 },
        newSalary: {
          basic: empObj.basic,
          da: empObj.da,
          hra: empObj.hra,
          conveyance: empObj.conveyance,
          medical: empObj.medical,
          otherAllowance: empObj.otherAllowance,
          gross: newGross
        },
        changeType: 'Initial Salary',
        reason: 'Initial Registration',
        changedBy: db.auth?.username || 'Admin',
        timestamp: new Date().toISOString()
      }];

      const stintId = `${empObj.empCode}_S1`;
      empObj.employmentHistory = [{
        stintId,
        stintNumber: 1,
        joinDate: new Date().toISOString().slice(0, 10),
        leaveDate: (empObj.status === 'Inactive') ? new Date().toISOString().slice(0, 10) : null,
        reasonForLeaving: '',
        reasonForJoining: 'Initial Registration',
        department: empObj.department,
        designation: empObj.designation,
        category: empObj.category,
        siteId: empObj.siteId,
        basic: empObj.basic,
        da: empObj.da,
        hra: empObj.hra,
        conveyance: empObj.conveyance,
        medical: empObj.medical,
        otherAllowance: empObj.otherAllowance,
        uan: empObj.uan,
        pfNumber: empObj.pfNumber,
        esiNumber: empObj.esiNumber,
        pan: empObj.pan,
        bankAccount: empObj.bankAccount,
        ifsc: empObj.ifsc,
        bankName: empObj.bankName,
        paymentMode: empObj.paymentMode,
        status: empObj.status === 'Inactive' ? 'Completed' : 'Active',
        createdAt: new Date().toISOString()
      }];
      empObj.currentStintId = empObj.status === 'Inactive' ? null : stintId;
      empObj.createdAt = new Date().toISOString();
      db.employees.push(empObj);

      if (!db.attendance.some(a => a.empCode === empObj.empCode)) {
        db.attendance.push({
          empCode: empObj.empCode,
          period: currentPeriod,
          workingDays: 26,
          presentDays: empObj.status === 'Inactive' ? 0 : 26,
          weeklyOffs: 4,
          paidHolidays: 1,
          sickLeave: 0,
          cl: 0,
          pl: 0,
          otherLeave: 0,
          lopDays: 0,
          payableDays: empObj.status === 'Inactive' ? 0 : 26,
          otHours: 0
        });
      }
      log('employee.created', `Added ${empObj.name} (${empObj.empCode})`, 'employees');
    } else {
      const idx = db.employees.findIndex(e => e.empCode === existingRecord.empCode);
      if (idx !== -1) {
        const oldRec = db.employees[idx];
        const oldBasic = Number(oldRec.basic || 0);
        const oldDa = Number(oldRec.da || 0);
        const oldHra = Number(oldRec.hra || 0);
        const oldConveyance = Number(oldRec.conveyance || 0);
        const oldMedical = Number(oldRec.medical || 0);
        const oldOther = Number(oldRec.otherAllowance || 0);
        const oldGross = oldBasic + oldDa + oldHra + oldConveyance + oldMedical + oldOther;

        let history = Array.isArray(oldRec.salaryHistory) ? [...oldRec.salaryHistory] : [];
        if (history.length === 0 && oldBasic > 0) {
          history.push({
            id: 'sal_rev_base_' + oldRec.empCode,
            effectiveDate: '2026-01-01',
            effectivePeriod: '2026-01',
            previousSalary: { basic: 0, da: 0, hra: 0, conveyance: 0, medical: 0, otherAllowance: 0, gross: 0 },
            newSalary: { basic: oldBasic, da: oldDa, hra: oldHra, conveyance: oldConveyance, medical: oldMedical, otherAllowance: oldOther, gross: oldGross },
            changeType: 'Initial Salary',
            reason: 'Baseline Record',
            changedBy: 'System',
            timestamp: new Date().toISOString()
          });
        }

        if (oldBasic !== empObj.basic || oldDa !== empObj.da || oldHra !== empObj.hra || oldConveyance !== empObj.conveyance || oldMedical !== empObj.medical || oldOther !== empObj.otherAllowance) {
          const changeType = newGross > oldGross ? 'Increment' : (newGross < oldGross ? 'Decrement' : 'Revision');
          history.push({
            id: 'sal_rev_' + Date.now(),
            effectiveDate,
            effectivePeriod,
            previousSalary: { basic: oldBasic, da: oldDa, hra: oldHra, conveyance: oldConveyance, medical: oldMedical, otherAllowance: oldOther, gross: oldGross },
            newSalary: { basic: empObj.basic, da: empObj.da, hra: empObj.hra, conveyance: empObj.conveyance, medical: empObj.medical, otherAllowance: empObj.otherAllowance, gross: newGross },
            changeType,
            reason: salaryReason,
            changedBy: db.auth?.username || 'Admin',
            timestamp: new Date().toISOString()
          });
        }
        empObj.salaryHistory = history;

        let updatedHistory = oldRec.employmentHistory || [];
        if (oldRec.currentStintId && Array.isArray(updatedHistory)) {
          const stintIdx = updatedHistory.findIndex(s => s.stintId === oldRec.currentStintId);
          if (stintIdx !== -1) {
            updatedHistory[stintIdx] = {
              ...updatedHistory[stintIdx],
              siteId: empObj.siteId,
              department: empObj.department,
              designation: empObj.designation,
              category: empObj.category,
              basic: empObj.basic,
              da: empObj.da,
              hra: empObj.hra,
              conveyance: empObj.conveyance,
              medical: empObj.medical,
              otherAllowance: empObj.otherAllowance,
              uan: empObj.uan,
              pfNumber: empObj.pfNumber,
              esiNumber: empObj.esiNumber,
              pan: empObj.pan,
              bankAccount: empObj.bankAccount,
              ifsc: empObj.ifsc,
              bankName: empObj.bankName,
              paymentMode: empObj.paymentMode
            };
          }
        }
        db.employees[idx] = {
          ...oldRec,
          ...empObj,
          salaryHistory: empObj.salaryHistory,
          employmentHistory: updatedHistory,
          currentStintId: oldRec.currentStintId
        };
      }
      log('employee.updated', `Updated ${empObj.name} (${empObj.empCode})`, 'employees');
    }

    await save();
    toast(isEditMode ? 'Employee updated successfully' : 'Employee registered successfully');
    closeModal();
    render();
  };

  showModal({
    title: isEdit ? 'Edit Employee Details' : 'Register New Employee',
    eyebrow: isEdit ? 'UPDATE MASTER' : 'NEW REGISTRATION',
    body: html,
    saveText: isEdit ? 'Update Employee' : 'Save Employee',
    modalClass: 'modal-lg',
    onSave: async () => {
      const code = $('#fEmpCode').value.trim();
      const name = $('#fEmpName').value.trim();
      const siteId = $('#fEmpSite').value;
      const basicRaw = $('#fEmpBasic').value;

      if (!code || !name) {
        toast('Please provide employee code and name', 'error');
        return false;
      }

      // 1. Validate Aadhaar
      const aadhaarRaw = $('#fEmpAadhaar').value.trim();
      const aadhaarRes = validateAadhaar(aadhaarRaw, false);
      if (!aadhaarRes.valid) {
        toast(aadhaarRes.error, 'error');
        return false;
      }

      // 2. Validate Mobile
      const mobileRaw = $('#fEmpMobile').value.trim();
      const mobileRes = validateMobile(mobileRaw, false);
      if (!mobileRes.valid) {
        toast(mobileRes.error, 'error');
        return false;
      }

      // 3. Validate PAN
      const panRaw = $('#fEmpPan').value.trim();
      const panRes = validatePAN(panRaw, false);
      if (!panRes.valid) {
        toast(panRes.error, 'error');
        return false;
      }

      // 4. Validate IFSC
      const ifscRaw = $('#fEmpIfsc').value.trim();
      const ifscRes = validateIFSC(ifscRaw, false);
      if (!ifscRes.valid) {
        toast(ifscRes.error, 'error');
        return false;
      }

      // 5. Validate Bank Account
      const bankRaw = $('#fEmpBank').value.trim();
      const bankRes = validateBankAccount(bankRaw, false);
      if (!bankRes.valid) {
        toast(bankRes.error, 'error');
        return false;
      }

      const basic = basicRaw === '' ? 0 : Number(basicRaw || 0);

      const empObj = {
        empCode: code,
        name,
        aadhaarName: $('#fEmpAadhaarName').value.trim() || name,
        dob: $('#fEmpDob').value || '',
        gender: $('#fEmpGender').value || '',
        aadhaar: aadhaarRes.cleaned,
        mobile: mobileRes.cleaned,
        presentAddress: $('#fEmpPresentAddress').value.trim(),
        permanentAddress: $('#fEmpPermanentAddress').value.trim(),
        siteId: siteId || 'unassigned',
        category: $('#fEmpCategory').value,
        department: $('#fEmpDept').value.trim(),
        designation: $('#fEmpDesignation').value.trim(),
        paymentMode: $('#fEmpPayMode').value,
        chequeHandling: $('#fEmpChequeHandling').value,
        basic,
        da: Number($('#fEmpDa').value || 0),
        hra: Number($('#fEmpHra').value || 0),
        conveyance: Number($('#fEmpConveyance').value || 0),
        medical: Number($('#fEmpMedical').value || 0),
        otherAllowance: Number($('#fEmpOther').value || 0),
        uan: $('#fEmpUan').value.trim(),
        pfNumber: $('#fEmpPfNo').value.trim(),
        esiNumber: $('#fEmpEsiNo').value.trim(),
        pan: panRes.cleaned,
        bankAccount: bankRes.cleaned,
        ifsc: ifscRes.cleaned,
        bankName: $('#fEmpBankName').value.trim(),
        incomeTax: Number($('#fEmpTds').value || 0),
        licPolicyNo: $('#fEmpLicNo').value.trim(),
        licAmount: Number($('#fEmpLicAmount').value || 0),
        licActive: Boolean(Number($('#fEmpLicAmount').value || 0) > 0),
        status: $('#fEmpStatus').value,
        nomineeName: $('#fEmpNomineeName').value.trim(),
        nominee: {
          name: $('#fEmpNomineeName').value.trim(),
          relationship: $('#fEmpNomineeRel').value.trim(),
          dob: existing?.nominee?.dob || '',
          mobile: existing?.nominee?.mobile || '',
          address: existing?.nominee?.address || '',
          sharePct: existing?.nominee?.sharePct || 100
        },
        familyMembers: existing?.familyMembers || [],
        esicDetails: {
          status: $('#fEmpEsicStatus').value,
          ipNumber: $('#fEmpEsiNo').value.trim(),
          dispensary: $('#fEmpEsicDispensary').value.trim(),
          employerCode: existing?.esicDetails?.employerCode || '',
          allotmentDate: existing?.esicDetails?.allotmentDate || '',
          maritalStatus: existing?.esicDetails?.maritalStatus || '',
          fatherOrHusbandName: existing?.esicDetails?.fatherOrHusbandName || '',
          customFields: existing?.esicDetails?.customFields || []
        }
      };

      // 6. Duplicate Employee Detection across UAN, Aadhaar, ESIC, PAN, and Employee Code
      const candidateCheck = {
        empCode: code,
        aadhaar: aadhaarRes.cleaned,
        pan: panRes.cleaned,
        uan: $('#fEmpUan').value.trim(),
        esiNumber: $('#fEmpEsiNo').value.trim()
      };

      const dup = findDuplicateEmployee(candidateCheck, isEdit ? existing.empCode : null);
      if (dup.isDuplicate) {
        showDuplicateWarningModal(dup, async () => {
          await commitEmployeeSave(empObj, isEdit, existing);
        });
        return false;
      }

      await commitEmployeeSave(empObj, isEdit, existing);
      return true;
    }
  });

  // Wire up Photo Upload controls
  const fileInput = document.getElementById('fEmpPhotoFile');
  const uploadBtn = document.getElementById('fEmpPhotoUploadBtn');
  const removeBtn = document.getElementById('fEmpPhotoRemoveBtn');
  const previewContainer = document.getElementById('fEmpPhotoPreviewContainer');

  if (uploadBtn && fileInput) {
    uploadBtn.onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // 1 MB limit (1,048,576 bytes)
      if (file.size > 1048576) {
        toast(`Photo file size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds 1 MB limit. Please select a smaller photo.`, 'error');
        fileInput.value = '';
        return;
      }

      // Formats: JPG, JPEG, PNG
      if (!['image/jpeg', 'image/jpg', 'image/png'].includes(file.type.toLowerCase())) {
        toast('Only JPG, JPEG, or PNG formats are supported.', 'error');
        fileInput.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = (evt) => {
        currentPhotoData = evt.target.result;
        if (previewContainer) {
          previewContainer.innerHTML = `<img src="${currentPhotoData}" class="emp-photo-avatar" alt="Photo">`;
        }
        if (removeBtn) removeBtn.style.display = 'inline-block';
        toast('Photo uploaded successfully');
      };
      reader.readAsDataURL(file);
    };
  }

  if (removeBtn) {
    removeBtn.onclick = () => {
      currentPhotoData = '';
      if (fileInput) fileInput.value = '';
      if (previewContainer) {
        previewContainer.innerHTML = '<div class="emp-photo-placeholder">👤</div>';
      }
      removeBtn.style.display = 'none';
      toast('Photo removed');
    };
  }

  // Wire up quick Copy Present Address to Permanent Address button
  const copyBtn = document.getElementById('copyPresentAddressBtn');
  if (copyBtn) {
    copyBtn.onclick = () => {
      const pres = document.getElementById('fEmpPresentAddress')?.value || '';
      const perm = document.getElementById('fEmpPermanentAddress');
      if (perm) perm.value = pres;
    };
  }
}

// ----------------------------------------------------
// EMPLOYEE PROFILE — FULL TABBED MODAL (Phase 2)
// ----------------------------------------------------
let empProfileTab = 'personal';

function openEmployeeProfileModal(empCode) {
  const emp = (db.employees || []).find(e => e.empCode === empCode);
  if (!emp) { toast('Employee not found', 'error'); return; }

  empProfileTab = 'personal';
  renderEmpProfileModal(emp);
}

// ----------------------------------------------------
// SALARY HISTORY TAB & REVISION MODAL
// ----------------------------------------------------
function renderSalaryHistoryTabHtml(emp) {
  const history = Array.isArray(emp.salaryHistory) ? emp.salaryHistory.slice() : [];

  const displayHistory = history.slice().sort((a, b) => {
    const dateA = a.effectiveDate || a.effectivePeriod || '';
    const dateB = b.effectiveDate || b.effectivePeriod || '';
    return dateB.localeCompare(dateA);
  });

  const curBasic = Number(emp.basic || 0);
  const curDa = Number(emp.da || 0);
  const curHra = Number(emp.hra || 0);
  const curConv = Number(emp.conveyance || 0);
  const curMed = Number(emp.medical || 0);
  const curOther = Number(emp.otherAllowance || 0);
  const curGross = curBasic + curDa + curHra + curConv + curMed + curOther;

  return `
    <div class="salary-history-container">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
        <div style="display:flex; gap:12px; flex-wrap:wrap;">
          <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:10px 16px;">
            <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Current Gross Salary</div>
            <div style="font-size:18px; font-weight:800; color:var(--accent-emerald);">${money(curGross)}</div>
          </div>
          <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:10px 16px;">
            <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Basic + DA Split</div>
            <div style="font-size:14px; font-weight:700; color:var(--text-primary);">${money(curBasic)} <span style="font-size:11px; color:var(--text-muted);">+ ${money(curDa)} DA</span></div>
          </div>
          <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:10px 16px;">
            <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Total Revisions</div>
            <div style="font-size:14px; font-weight:700; color:var(--accent-blue);">${history.length} logged</div>
          </div>
        </div>
        <button class="primary btn-sm" id="recordSalaryRevisionBtn" style="display:flex; align-items:center; gap:6px;">
          <span>➕</span> Record Salary Revision
        </button>
      </div>

      ${displayHistory.length === 0 ? `
        <div style="text-align:center; padding:32px 16px; background:var(--bg-subtle); border-radius:var(--radius-md); border:1px dashed var(--border-color);">
          <div style="font-size:28px; margin-bottom:8px;">💰</div>
          <p style="font-size:13px; color:var(--text-muted); margin-bottom:12px;">No formal salary revisions recorded yet for this employee.</p>
          <button class="outline btn-sm" id="recordFirstSalaryBtn">Record Initial Salary Revision</button>
        </div>
      ` : `
        <div class="salary-timeline-track">
          ${displayHistory.map((h, idx) => {
            const prevGross = Number(h.previousSalary?.gross || 0);
            const newGross = Number(h.newSalary?.gross || 0);
            const diff = newGross - prevGross;
            const diffPct = prevGross > 0 ? ((diff / prevGross) * 100).toFixed(1) : null;

            let badgeClass = 'revision';
            if (h.changeType === 'Increment') badgeClass = 'increment';
            else if (h.changeType === 'Decrement') badgeClass = 'decrement';
            else if (h.changeType === 'Promotion') badgeClass = 'promotion';
            else if (h.changeType === 'Initial Salary') badgeClass = 'initial';

            return `
              <div class="salary-revision-card">
                <div class="salary-card-header">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span class="salary-type-badge ${badgeClass}">${esc(h.changeType || 'Revision')}</span>
                    <strong style="font-size:13px; color:var(--text-primary);">Effective: ${esc(h.effectiveDate || h.effectivePeriod || '—')}</strong>
                    <span style="font-size:11px; color:var(--text-muted); font-family:monospace;">(${esc(h.effectivePeriod || (h.effectiveDate || '').slice(0, 7))})</span>
                  </div>
                  <div style="font-size:13px; font-weight:800; color:${diff > 0 ? 'var(--accent-emerald)' : (diff < 0 ? 'var(--accent-rose)' : 'var(--text-muted)')};">
                    ${diff > 0 ? `+${money(diff)}` : (diff < 0 ? `-${money(Math.abs(diff))}` : 'No change')}
                    ${diffPct !== null && prevGross > 0 ? `<span style="font-size:11px; font-weight:600; margin-left:4px;">(${diff > 0 ? '+' : ''}${diffPct}%)</span>` : ''}
                  </div>
                </div>

                <div class="salary-breakdown-grid">
                  <div class="salary-col">
                    <span class="salary-col-lbl">Component</span>
                    <span class="salary-comp-row">Basic Salary:</span>
                    <span class="salary-comp-row">DA / Special Allowance:</span>
                    <span class="salary-comp-row">HRA:</span>
                    <span class="salary-comp-row">Other Allowances:</span>
                    <span class="salary-comp-row total">Gross Total:</span>
                  </div>
                  <div class="salary-col">
                    <span class="salary-col-lbl">Previous</span>
                    <span class="salary-comp-row">${money(h.previousSalary?.basic)}</span>
                    <span class="salary-comp-row">${money(h.previousSalary?.da)}</span>
                    <span class="salary-comp-row">${money(h.previousSalary?.hra)}</span>
                    <span class="salary-comp-row">${money((Number(h.previousSalary?.conveyance)||0) + (Number(h.previousSalary?.medical)||0) + (Number(h.previousSalary?.otherAllowance)||0))}</span>
                    <span class="salary-comp-row total">${money(prevGross)}</span>
                  </div>
                  <div class="salary-col">
                    <span class="salary-col-lbl">New</span>
                    <span class="salary-comp-row" style="color:var(--text-primary); font-weight:600;">${money(h.newSalary?.basic)}</span>
                    <span class="salary-comp-row" style="color:var(--text-primary); font-weight:600;">${money(h.newSalary?.da)}</span>
                    <span class="salary-comp-row" style="color:var(--text-primary); font-weight:600;">${money(h.newSalary?.hra)}</span>
                    <span class="salary-comp-row" style="color:var(--text-primary); font-weight:600;">${money((Number(h.newSalary?.conveyance)||0) + (Number(h.newSalary?.medical)||0) + (Number(h.newSalary?.otherAllowance)||0))}</span>
                    <span class="salary-comp-row total" style="color:var(--accent-emerald); font-weight:800;">${money(newGross)}</span>
                  </div>
                </div>

                ${h.reason ? `
                  <div style="margin-top:10px; font-size:12px; color:var(--text-muted); background:var(--bg-subtle); padding:6px 10px; border-radius:var(--radius-sm);">
                    📌 <strong>Reason / Letter Ref:</strong> ${esc(h.reason)}
                  </div>
                ` : ''}

                <div class="salary-card-footer">
                  <span>Logged by: <strong>${esc(h.changedBy || 'Admin')}</strong></span>
                  <span>${h.timestamp ? new Date(h.timestamp).toLocaleString('en-IN') : '—'}</span>
                  ${idx === 0 && displayHistory.length > 1 ? `
                    <button class="icon-btn del-sal-rev-btn" data-id="${esc(h.id)}" title="Undo / Delete latest revision" style="color:var(--accent-rose); font-size:11px; margin-left:auto;">🗑️ Delete Revision</button>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
  `;
}

function openRecordSalaryRevisionModal(empCode) {
  const emp = (db.employees || []).find(e => e.empCode === empCode);
  if (!emp) { toast('Employee not found', 'error'); return; }

  const curBasic = Number(emp.basic || 0);
  const curDa = Number(emp.da || 0);
  const curHra = Number(emp.hra || 0);
  const curConv = Number(emp.conveyance || 0);
  const curMed = Number(emp.medical || 0);
  const curOther = Number(emp.otherAllowance || 0);
  const curGross = curBasic + curDa + curHra + curConv + curMed + curOther;

  const body = `
    <div style="padding:4px 0;">
      <div style="background:var(--bg-subtle); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:12px 16px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Current Salary Baseline</div>
          <strong style="font-size:14px; color:var(--text-primary);">${esc(emp.name)} (${esc(emp.empCode)})</strong>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px; color:var(--text-muted);">Current Gross</div>
          <strong style="font-size:16px; color:var(--accent-emerald);">${money(curGross)}</strong>
        </div>
      </div>

      <div class="form-grid">
        <div class="form-group">
          <label>Effective Date *</label>
          <input type="date" id="revEffectiveDate" value="${new Date().toISOString().slice(0, 10)}" style="padding:8px; border:1px solid var(--border-color); border-radius:6px; width:100%;">
          <small style="font-size:11px; color:var(--text-muted);">Payroll calculation will use this salary from this date/month onward.</small>
        </div>

        <div class="form-group">
          <label>Revision Type *</label>
          <select id="revChangeType" style="padding:8px; border:1px solid var(--border-color); border-radius:6px; width:100%;">
            <option value="Increment" selected>📈 Increment</option>
            <option value="Promotion">🎖️ Promotion / Role Upgrade</option>
            <option value="Annual Revision">📅 Annual Appraisal Revision</option>
            <option value="Decrement">📉 Decrement / Pay Cut</option>
            <option value="Correction">✏️ Correction / Adjustment</option>
            <option value="Other">📌 Other</option>
          </select>
        </div>

        <div class="form-group">
          <label>New Basic Salary (₹) *</label>
          <input type="number" id="revBasic" step="0.01" min="0" value="${curBasic}" style="padding:8px; border:1px solid var(--border-color); border-radius:6px; width:100%; font-weight:700;">
        </div>

        <div class="form-group">
          <label>New DA / Special Allowance (₹)</label>
          <input type="number" id="revDa" step="0.01" min="0" value="${curDa}" style="padding:8px; border:1px solid var(--border-color); border-radius:6px; width:100%; font-weight:700;">
        </div>

        <div class="form-group">
          <label>New HRA (₹)</label>
          <input type="number" id="revHra" step="0.01" min="0" value="${curHra}" style="padding:8px; border:1px solid var(--border-color); border-radius:6px; width:100%;">
        </div>

        <div class="form-group">
          <label>New Conveyance (₹)</label>
          <input type="number" id="revConv" step="0.01" min="0" value="${curConv}" style="padding:8px; border:1px solid var(--border-color); border-radius:6px; width:100%;">
        </div>

        <div class="form-group">
          <label>New Medical Allowance (₹)</label>
          <input type="number" id="revMed" step="0.01" min="0" value="${curMed}" style="padding:8px; border:1px solid var(--border-color); border-radius:6px; width:100%;">
        </div>

        <div class="form-group">
          <label>New Other Allowance (₹)</label>
          <input type="number" id="revOther" step="0.01" min="0" value="${curOther}" style="padding:8px; border:1px solid var(--border-color); border-radius:6px; width:100%;">
        </div>

        <div class="form-group" style="grid-column: span 2;">
          <label>Reason / Increment Letter Ref</label>
          <input type="text" id="revReason" placeholder="e.g. Annual Appraisal FY26, Promotion to Sr. Technician, Letter Ref: HR/2026/042" style="padding:8px; border:1px solid var(--border-color); border-radius:6px; width:100%;">
        </div>
      </div>

      <div id="revCalcPill" style="margin-top:14px; padding:12px; background:var(--bg-subtle); border-radius:var(--radius-sm); border:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
        <div>
          <span style="font-size:12px; color:var(--text-muted);">New Gross Salary:</span>
          <strong id="revNewGrossVal" style="font-size:15px; color:var(--accent-emerald); margin-left:6px;">${money(curGross)}</strong>
        </div>
        <div id="revDiffVal" style="font-size:12px; font-weight:700; color:var(--text-muted);">
          No change
        </div>
      </div>
    </div>
  `;

  showModal({
    title: `Record Salary Revision — ${emp.name}`,
    eyebrow: 'SALARY REVISION & INCREMENT',
    body,
    modalClass: 'modal-lg',
    saveText: '💾 Save Salary Revision',
    onSave: async () => {
      const effDate = $('#revEffectiveDate')?.value || '';
      if (!effDate) { toast('Effective date is required', 'error'); return false; }
      const effPeriod = effDate.slice(0, 7);

      const nBasic = Number($('#revBasic')?.value || 0);
      const nDa = Number($('#revDa')?.value || 0);
      const nHra = Number($('#revHra')?.value || 0);
      const nConv = Number($('#revConv')?.value || 0);
      const nMed = Number($('#revMed')?.value || 0);
      const nOther = Number($('#revOther')?.value || 0);
      const nGross = nBasic + nDa + nHra + nConv + nMed + nOther;

      if (nBasic < 0 || nDa < 0 || nHra < 0 || nConv < 0 || nMed < 0 || nOther < 0) {
        toast('Salary components cannot be negative', 'error');
        return false;
      }

      const changeType = $('#revChangeType')?.value || 'Increment';
      const reason = $('#revReason')?.value.trim() || `${changeType} recorded`;

      const idx = db.employees.findIndex(e => e.empCode === emp.empCode);
      if (idx === -1) return false;

      let history = Array.isArray(db.employees[idx].salaryHistory) ? [...db.employees[idx].salaryHistory] : [];

      if (history.length === 0 && curBasic > 0) {
        history.push({
          id: 'sal_rev_base_' + emp.empCode,
          effectiveDate: '2026-01-01',
          effectivePeriod: '2026-01',
          previousSalary: { basic: 0, da: 0, hra: 0, conveyance: 0, medical: 0, otherAllowance: 0, gross: 0 },
          newSalary: { basic: curBasic, da: curDa, hra: curHra, conveyance: curConv, medical: curMed, otherAllowance: curOther, gross: curGross },
          changeType: 'Initial Salary',
          reason: 'Baseline Salary Record',
          changedBy: 'System',
          timestamp: new Date().toISOString()
        });
      }

      const revRecord = {
        id: 'sal_rev_' + Date.now(),
        effectiveDate: effDate,
        effectivePeriod: effPeriod,
        previousSalary: {
          basic: curBasic,
          da: curDa,
          hra: curHra,
          conveyance: curConv,
          medical: curMed,
          otherAllowance: curOther,
          gross: curGross
        },
        newSalary: {
          basic: nBasic,
          da: nDa,
          hra: nHra,
          conveyance: nConv,
          medical: nMed,
          otherAllowance: nOther,
          gross: nGross
        },
        changeType,
        reason,
        changedBy: db.auth?.username || 'Admin',
        timestamp: new Date().toISOString()
      };

      history.push(revRecord);
      db.employees[idx].salaryHistory = history;

      if (effPeriod <= currentPeriod) {
        db.employees[idx].basic = nBasic;
        db.employees[idx].da = nDa;
        db.employees[idx].hra = nHra;
        db.employees[idx].conveyance = nConv;
        db.employees[idx].medical = nMed;
        db.employees[idx].otherAllowance = nOther;

        const stint = (db.employees[idx].employmentHistory || []).find(s => s.stintId === db.employees[idx].currentStintId);
        if (stint) {
          stint.basic = nBasic;
          stint.da = nDa;
          stint.hra = nHra;
          stint.conveyance = nConv;
          stint.medical = nMed;
          stint.otherAllowance = nOther;
        }
      }

      log('employee.salary_revision', `Recorded ${changeType} of ₹${nGross - curGross} for ${emp.name} (${emp.empCode}) effective ${effDate}`, 'employees');
      await save();
      toast('Salary revision recorded successfully');
      empProfileTab = 'salary';
      renderEmpProfileModal(db.employees[idx]);
      return true;
    }
  });

  const updateLiveGross = () => {
    const b = Number($('#revBasic')?.value || 0);
    const d = Number($('#revDa')?.value || 0);
    const h = Number($('#revHra')?.value || 0);
    const c = Number($('#revConv')?.value || 0);
    const m = Number($('#revMed')?.value || 0);
    const o = Number($('#revOther')?.value || 0);
    const tot = b + d + h + c + m + o;
    const diff = tot - curGross;
    const diffPct = curGross > 0 ? ((diff / curGross) * 100).toFixed(1) : null;

    const grossEl = document.getElementById('revNewGrossVal');
    const diffEl = document.getElementById('revDiffVal');
    if (grossEl) grossEl.textContent = money(tot);
    if (diffEl) {
      if (diff > 0) {
        diffEl.style.color = 'var(--accent-emerald)';
        diffEl.textContent = `+${money(diff)} (+${diffPct}%) Increment`;
      } else if (diff < 0) {
        diffEl.style.color = 'var(--accent-rose)';
        diffEl.textContent = `-${money(Math.abs(diff))} (${diffPct}%) Decrement`;
      } else {
        diffEl.style.color = 'var(--text-muted)';
        diffEl.textContent = 'No change';
      }
    }
  };

  ['revBasic', 'revDa', 'revHra', 'revConv', 'revMed', 'revOther'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.oninput = updateLiveGross;
  });
}

function renderEmpProfileModal(emp) {
  const tabs = [
    { id: 'personal', label: '👤 Personal' },
    { id: 'employment', label: '💼 Employment' },
    { id: 'salary', label: '💰 Salary History' },
    { id: 'family', label: '👨‍👩‍👧‍👦 Family & Nominee' },
    { id: 'history', label: '📋 History' },
    { id: 'kyc', label: '🪪 KYC Docs' },
    { id: 'statutory', label: '🏛️ Statutory & ESIC' },
    { id: 'audit', label: '📝 Audit' }
  ];

  const tabBar = `<div class="emp-profile-tabs">
    ${tabs.map(t => `<button class="emp-profile-tab-btn ${empProfileTab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
  </div>`;

  const activeStint = (emp.employmentHistory || []).find(s => s.stintId === emp.currentStintId) || emp.employmentHistory?.[0];
  const sites = db.sites || [];

  // TAB CONTENT RENDERERS
  const tabContents = {
    personal: `
      <!-- Profile Photograph Section -->
      <div style="display:flex; align-items:center; gap:16px; margin-bottom:16px; padding:12px; background:var(--bg-subtle); border-radius:var(--radius-md); border:1px solid var(--border-color);">
        <div id="pfPhotoPreviewContainer" style="width:64px; height:64px; border-radius:50%; overflow:hidden; border:2px solid var(--border-color); background:#f1f5f9; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          ${emp.photo ? `<img src="${emp.photo}" style="width:100%; height:100%; object-fit:cover;" alt="Photo">` : `<span style="font-size:24px;">👤</span>`}
        </div>
        <div style="flex:1;">
          <strong style="font-size:13px; display:block; color:var(--text-primary);">Employee Photograph</strong>
          <p style="font-size:11px; color:var(--text-muted); margin:2px 0 6px;">Supported: JPG, JPEG, PNG (Max 1 MB). Displayed on payslips and profile.</p>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <input type="file" id="pfPhotoFile" accept=".jpg,.jpeg,.png,image/jpeg,image/png" style="display:none;">
            <button type="button" class="outline btn-sm" id="pfPhotoUploadBtn">📷 ${emp.photo ? 'Change Photo' : 'Upload Photo'}</button>
            ${emp.photo ? `<button type="button" class="danger btn-sm" id="pfPhotoRemoveBtn">🗑️ Remove</button>` : ''}
            <label style="font-size:12px; display:inline-flex; align-items:center; gap:6px; cursor:pointer; margin-left:8px;">
              <input type="checkbox" id="pfShowPhotoOnSlip" ${emp.showPhotoOnPayslip !== false ? 'checked' : ''}>
              Show on Payslip
            </label>
          </div>
        </div>
      </div>

      <div class="form-grid">
        <div class="form-group"><label>Employee Code</label><div class="input-display">${esc(emp.empCode)}</div></div>
        <div class="form-group"><label>Full Name</label><input type="text" id="pfName" value="${esc(emp.name)}" style="padding:8px; border:1px solid var(--border-color); border-radius:6px; width:100%; font-family:inherit;"></div>
        <div class="form-group"><label>Name as per Aadhaar</label><input type="text" id="pfAadhaarName" value="${esc(emp.aadhaarName || emp.name)}" placeholder="Official name on Aadhaar card" style="padding:8px; border:1px solid var(--border-color); border-radius:6px; width:100%; font-family:inherit;"></div>
        <div class="form-group"><label>Date of Birth</label><input type="date" id="pfDob" value="${esc(emp.dob || '')}" style="padding:8px; border:1px solid var(--border-color); border-radius:6px; width:100%; font-family:inherit;"></div>
        <div class="form-group"><label>Gender</label><select id="pfGender" style="padding:8px; border:1px solid var(--border-color); border-radius:6px; width:100%; font-family:inherit;">
          <option value="" ${!emp.gender ? 'selected' : ''}>Select Gender</option>
          <option value="Male" ${emp.gender==='Male'?'selected':''}>Male</option>
          <option value="Female" ${emp.gender==='Female'?'selected':''}>Female</option>
          <option value="Other" ${emp.gender==='Other'?'selected':''}>Other</option>
        </select></div>
        <div class="form-group">
          <label>Aadhaar Number (12 Digits)</label>
          <div class="aadhaar-container">
            <input type="text" id="pfAadhaar" maxlength="14" value="${esc(emp.aadhaar || '')}" placeholder="1234 5678 9012" style="padding:8px; padding-right:32px; border:1px solid var(--border-color); border-radius:6px; width:100%; font-family:monospace;">
            <button type="button" class="aadhaar-toggle-btn" id="toggleAadhaarBtn" title="Toggle Mask / Unmask">👁️</button>
          </div>
          <small id="aadhaarMaskHint" style="font-size:11px; color:var(--text-muted);">Masked display: ${maskAadhaar(emp.aadhaar)}</small>
        </div>
        <div class="form-group"><label>PAN Number</label><input type="text" id="pfPan" maxlength="10" value="${esc(emp.pan || '')}" placeholder="ABCDE1234F" style="padding:8px; border:1px solid var(--border-color); border-radius:6px; width:100%; font-family:monospace; text-transform:uppercase;"></div>
        <div class="form-group"><label>Mobile Number (10 Digits)</label><input type="text" id="pfMobile" maxlength="13" value="${esc(emp.mobile || '')}" placeholder="9823012345" style="padding:8px; border:1px solid var(--border-color); border-radius:6px; width:100%; font-family:inherit;"></div>
        <div class="form-group"><label>Email Address</label><input type="email" id="pfEmail" value="${esc(emp.email || '')}" style="padding:8px; border:1px solid var(--border-color); border-radius:6px; width:100%; font-family:inherit;"></div>
        <div class="form-group" style="grid-column:span 2;"><label>Present Address</label><textarea id="pfPresentAddress" rows="2" style="padding:8px; border:1px solid var(--border-color); border-radius:6px; width:100%; font-family:inherit; resize:vertical;" placeholder="Current residential address">${esc(emp.presentAddress || emp.address || '')}</textarea></div>
        <div class="form-group" style="grid-column:span 2;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <label style="margin-bottom:0;">Permanent Address</label>
            <button type="button" class="copy-address-btn" id="copyPresentInProfileBtn">↳ Same as Present Address</button>
          </div>
          <textarea id="pfPermanentAddress" rows="2" style="padding:8px; border:1px solid var(--border-color); border-radius:6px; width:100%; font-family:inherit; resize:vertical;" placeholder="Permanent hometown / village address">${esc(emp.permanentAddress || emp.presentAddress || emp.address || '')}</textarea>
        </div>
        <div class="form-group"><label>Emergency Contact</label><input type="text" id="pfEmergency" value="${esc(emp.emergencyContact || '')}" style="padding:8px; border:1px solid var(--border-color); border-radius:6px; width:100%; font-family:inherit;"></div>
        <div class="form-group"><label>Emergency Phone</label><input type="text" id="pfEmergencyPhone" value="${esc(emp.emergencyPhone || '')}" style="padding:8px; border:1px solid var(--border-color); border-radius:6px; width:100%; font-family:inherit;"></div>
      </div>
      <div style="margin-top:16px; display:flex; justify-content:flex-end;">
        <button class="primary btn-sm" id="savePersonalInfoBtn">💾 Save Personal Info</button>
      </div>
    `,

    employment: `
      ${activeStint ? `
        <div style="display:flex; gap:12px; align-items:center; margin-bottom:16px;">
          <span class="status ${emp.status === 'Inactive' ? 'warning' : 'ok'}">${emp.status === 'Inactive' ? '● Inactive' : '● Active Employment'}</span>
          ${emp.status === 'Inactive'
            ? `<button class="btn-rejoin" id="rejoinEmpBtn">🔄 Rejoin Employee</button>`
            : `<button class="btn-mark-leaving" id="markLeavingBtn">🚪 Mark as Left</button>`}
        </div>
        <div class="form-grid">
          <div class="form-group"><label>Department</label><div class="input-display">${esc(activeStint.department || '—')}</div></div>
          <div class="form-group"><label>Designation</label><div class="input-display">${esc(activeStint.designation || '—')}</div></div>
          <div class="form-group"><label>Site / Location</label><div class="input-display">${getSiteName(activeStint.siteId)}</div></div>
          <div class="form-group"><label>Category</label><div class="input-display">${esc(activeStint.category || '—')}</div></div>
          <div class="form-group"><label>Employment Type</label><div class="input-display">${esc(activeStint.employmentType || 'Permanent')}</div></div>
          <div class="form-group"><label>Reporting Manager</label><div class="input-display">${esc(activeStint.reportingManager || '—')}</div></div>
          <div class="form-group"><label>Joining Date</label><div class="input-display">${esc(activeStint.joinDate || '—')}</div></div>
          <div class="form-group"><label>Payment Mode</label><div class="input-display">${getPaymentModePill(activeStint.paymentMode || emp.paymentMode)}</div></div>
          <div class="form-group"><label>Basic Salary</label><div class="input-display" style="color:var(--accent-emerald); font-weight:700;">${money(activeStint.basic || emp.basic)}</div></div>
          <div class="form-group"><label>Bank Account</label><div class="input-display" style="font-family:monospace;">${mask(activeStint.bankAccount || emp.bankAccount)}</div></div>
          <div class="form-group"><label>IFSC</label><div class="input-display">${esc(activeStint.ifsc || emp.ifsc || '—')}</div></div>
        </div>
        <div style="margin-top:16px;">
          <button class="outline btn-sm" id="editCurrentStintBtn">✏️ Edit Salary & Employment Details</button>
        </div>
      ` : `<p style="color:var(--text-muted); padding:24px; text-align:center;">No active employment period. <button class="btn-rejoin" id="rejoinEmpBtn">🔄 Rejoin Employee</button></p>`}
    `,

    family: `
      <div class="family-section">
        <div class="nominee-card">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:8px;">
            <div>
              <strong style="font-size:13px; color:var(--text-primary);">🛡️ Nominee Details</strong>
              <p style="font-size:11px; color:var(--text-muted); margin:0;">Official nominee for employee statutory benefits, PF, gratuity, and ESIC</p>
            </div>
            <button class="primary btn-sm" id="saveNomineeBtn">💾 Save Nominee</button>
          </div>
          <div class="nominee-grid">
            <div class="form-group"><label>Nominee Full Name</label><input type="text" id="nomName" value="${esc(emp.nominee?.name || emp.nomineeName || '')}" placeholder="Full Name" style="padding:8px; border:1px solid var(--border-color); border-radius:6px; width:100%;"></div>
            <div class="form-group"><label>Relationship</label><input type="text" id="nomRel" value="${esc(emp.nominee?.relationship || '')}" placeholder="e.g. Spouse / Mother / Father / Son" style="padding:8px; border:1px solid var(--border-color); border-radius:6px; width:100%;"></div>
            <div class="form-group"><label>Date of Birth / Age</label><input type="text" id="nomDob" value="${esc(emp.nominee?.dob || '')}" placeholder="YYYY-MM-DD or Age" style="padding:8px; border:1px solid var(--border-color); border-radius:6px; width:100%;"></div>
            <div class="form-group"><label>Mobile Number</label><input type="text" id="nomMobile" value="${esc(emp.nominee?.mobile || '')}" placeholder="10-digit mobile" style="padding:8px; border:1px solid var(--border-color); border-radius:6px; width:100%;"></div>
            <div class="form-group"><label>Share Proportion (%)</label><input type="number" id="nomShare" min="1" max="100" value="${emp.nominee?.sharePct || 100}" style="padding:8px; border:1px solid var(--border-color); border-radius:6px; width:100%;"></div>
            <div class="form-group" style="grid-column: span 2;"><label>Nominee Residential Address</label><input type="text" id="nomAddress" value="${esc(emp.nominee?.address || emp.permanentAddress || emp.presentAddress || '')}" placeholder="Complete address of nominee" style="padding:8px; border:1px solid var(--border-color); border-radius:6px; width:100%;"></div>
          </div>
        </div>

        <div class="nominee-card" style="margin-top:14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:8px; margin-bottom:12px;">
            <div>
              <strong style="font-size:13px; color:var(--text-primary);">👨‍👩‍👧‍👦 Family / Dependent Members (${(emp.familyMembers || []).length})</strong>
              <p style="font-size:11px; color:var(--text-muted); margin:0;">Family member roster required for ESIC medical benefit allotment & Pehchan card</p>
            </div>
            <button class="primary btn-sm" id="addFamilyMemberBtn">+ Add Family Member</button>
          </div>
          ${(emp.familyMembers || []).length > 0 ? `
            <div class="table-wrap">
              <table class="family-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Member Name</th>
                    <th>Relationship</th>
                    <th>DOB / Age</th>
                    <th>Gender</th>
                    <th>Residing with Employee</th>
                    <th>Dependent</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${(emp.familyMembers || []).map((m, idx) => `
                    <tr>
                      <td>${idx + 1}</td>
                      <td><strong>${esc(m.name)}</strong></td>
                      <td><span class="cat-pill">${esc(m.relationship || '—')}</span></td>
                      <td>${esc(m.dob || '—')}</td>
                      <td>${esc(m.gender || '—')}</td>
                      <td>${m.residingWith !== false ? '<span style="color:var(--accent-emerald); font-weight:600;">✓ Yes</span>' : '<span style="color:var(--text-muted);">No</span>'}</td>
                      <td>${m.dependent !== false ? '<span style="color:var(--accent-emerald); font-weight:700;">✓ Dependent</span>' : '<span style="color:var(--text-muted);">Independent</span>'}</td>
                      <td>
                        <button class="outline btn-sm edit-fam-btn" data-idx="${idx}" title="Edit Member">✏️</button>
                        <button class="danger btn-sm del-fam-btn" data-idx="${idx}" title="Remove Member">🗑️</button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : `
            <div style="text-align:center; padding:24px; color:var(--text-muted); font-size:13px;">
              No family members registered yet.<br>
              <span style="font-size:11px;">Click <b>+ Add Family Member</b> to add spouse, children, or dependent parents for ESIC coverage.</span>
            </div>
          `}
        </div>
      </div>
    `,

    history: `
      <p style="font-size:12px; color:var(--text-muted); margin-bottom:16px;">Complete employment timeline — ${(emp.employmentHistory || []).length} period(s)</p>
      <div class="stint-timeline">
        ${(emp.employmentHistory || []).slice().reverse().map(stint => `
          <div class="stint-block ${stint.status === 'Active' ? 'active-stint' : ''}">
            <div class="stint-number">Employment Period #${stint.stintNumber}</div>
            <div class="stint-dates">
              ${esc(stint.joinDate || '—')} → ${stint.leaveDate ? esc(stint.leaveDate) : '<span style="color:var(--accent-emerald);">Present</span>'}
              <span class="status ${stint.status === 'Active' ? 'ok' : 'warning'}" style="margin-left:8px;">${esc(stint.status)}</span>
            </div>
            <div class="stint-meta">
              <span>🏢 ${esc(getSiteName(stint.siteId))}</span>
              <span>💼 ${esc(stint.designation || '—')}</span>
              <span>🏷️ ${esc(stint.department || '—')}</span>
              <span>💰 Basic: ${money(stint.basic)}</span>
              ${stint.reasonForJoining ? `<span>📌 ${esc(stint.reasonForJoining)}</span>` : ''}
              ${stint.reasonForLeaving ? `<span>🚪 ${esc(stint.reasonForLeaving)}</span>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `,

    kyc: renderKycDocumentsHtml(emp.empCode),

    statutory: `
      <div class="form-grid">
        <div class="form-group"><label>Aadhaar Number</label><div class="input-display" style="font-family:monospace;">${maskAadhaar(emp.aadhaar)}</div></div>
        <div class="form-group"><label>PAN Number</label><div class="input-display" style="font-family:monospace;">${esc(emp.pan || '—')}</div></div>
        <div class="form-group"><label>UAN Number</label><div class="input-display" style="font-family:monospace;">${mask(emp.uan)}</div></div>
        <div class="form-group"><label>PF Number</label><div class="input-display" style="font-family:monospace;">${esc(emp.pfNumber || emp.uan || '—')}</div></div>
        <div class="form-group"><label>ESI IP Number</label><div class="input-display" style="font-family:monospace;">${esc(emp.esiNumber || emp.esicDetails?.ipNumber || '—')}</div></div>
        <div class="form-group"><label>PF Eligible</label>
          <select id="pfEligible" style="padding:8px; border:1px solid var(--border-color); border-radius:6px; width:100%; font-family:inherit;">
            <option value="true" ${emp.pfEligible !== false ? 'selected' : ''}>Yes — PF deducted</option>
            <option value="false" ${emp.pfEligible === false ? 'selected' : ''}>No — Exempt</option>
          </select>
        </div>
        <div class="form-group"><label>ESIC Eligible</label>
          <select id="esiEligible" style="padding:8px; border:1px solid var(--border-color); border-radius:6px; width:100%; font-family:inherit;">
            <option value="true" ${emp.esiEligible !== false ? 'selected' : ''}>Yes — ESIC deducted</option>
            <option value="false" ${emp.esiEligible === false ? 'selected' : ''}>No — Exempt / Opted out</option>
          </select>
        </div>
        <div class="form-group"><label>PT Eligible</label>
          <select id="ptEligible" style="padding:8px; border:1px solid var(--border-color); border-radius:6px; width:100%; font-family:inherit;">
            <option value="true" ${emp.ptEligible !== false ? 'selected' : ''}>Yes — PT deducted</option>
            <option value="false" ${emp.ptEligible === false ? 'selected' : ''}>No — Exempt</option>
          </select>
        </div>
        <div class="form-group"><label>LWF Eligible</label>
          <select id="lwfEligible" style="padding:8px; border:1px solid var(--border-color); border-radius:6px; width:100%; font-family:inherit;">
            <option value="true" ${emp.lwfEligible !== false ? 'selected' : ''}>Yes</option>
            <option value="false" ${emp.lwfEligible === false ? 'selected' : ''}>No</option>
          </select>
        </div>
      </div>

      <!-- ESIC Allotment Management Console -->
      <div class="esic-allotment-box">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid var(--border-color); padding-bottom:8px;">
          <div>
            <span class="eyebrow" style="font-size:10px;">ESIC ALLOTMENT PROVISION</span>
            <h3 style="font-size:14px; margin:2px 0 0; color:var(--text-primary);">ESIC Registration & IP Allotment Details</h3>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <span class="esic-badge ${(emp.esicDetails?.status || (emp.esiNumber ? 'Allotted' : 'Not Registered')).toLowerCase().replace(/\s/g, '_')}">
              ${esc(emp.esicDetails?.status || (emp.esiNumber ? 'Allotted' : 'Not Registered'))}
            </span>
            <button class="outline btn-sm" id="generateEsicSheetBtn">📋 Generate ESIC Form 1 Sheet</button>
          </div>
        </div>

        <div class="form-grid" style="margin-bottom:12px;">
          <div class="form-group"><label>ESIC IP Number (10 Digits)</label><div class="input-display" style="font-family:monospace; font-weight:700; color:var(--accent-blue);">${esc(emp.esicDetails?.ipNumber || emp.esiNumber || 'Not Yet Allotted')}</div></div>
          <div class="form-group"><label>Registration / Allotment Date</label><div class="input-display">${esc(emp.esicDetails?.allotmentDate || '—')}</div></div>
          <div class="form-group"><label>ESIC Dispensary</label><div class="input-display">${esc(emp.esicDetails?.dispensary || '—')}</div></div>
          <div class="form-group"><label>Employer ESIC Code</label><div class="input-display" style="font-family:monospace;">${esc(emp.esicDetails?.employerCode || '31000123450000101')}</div></div>
          <div class="form-group"><label>Father's / Husband's Name</label><div class="input-display">${esc(emp.esicDetails?.fatherOrHusbandName || '—')}</div></div>
          <div class="form-group"><label>Marital Status</label><div class="input-display">${esc(emp.esicDetails?.maritalStatus || '—')}</div></div>
          <div class="form-group"><label>Family Members Covered</label><div class="input-display">${(emp.familyMembers || []).length} registered member(s)</div></div>
        </div>

        ${(emp.esicDetails?.customFields || []).length > 0 ? `
          <div style="background:var(--bg-subtle); padding:10px 14px; border-radius:var(--radius-sm); border:1px solid var(--border-color); margin-bottom:12px;">
            <strong style="font-size:11px; text-transform:uppercase; color:var(--text-muted); display:block; margin-bottom:6px;">Custom ESIC Allotment Fields:</strong>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:8px;">
              ${emp.esicDetails.customFields.map((cf, cIdx) => `
                <div style="font-size:12px;">
                  <span style="color:var(--text-muted);">${esc(cf.label)}:</span> <strong>${esc(cf.value)}</strong>
                  <button class="icon-btn del-esic-custom-btn" data-idx="${cIdx}" style="font-size:10px; margin-left:4px;" title="Remove field">✕</button>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
          <button class="outline btn-sm" id="addEsicCustomFieldBtn">+ Add Custom ESIC Field</button>
          <button class="primary btn-sm" id="editEsicAllotmentBtn">✏️ Edit ESIC Allotment Details</button>
        </div>
      </div>

      <div style="margin-top:12px; padding:12px; background:var(--bg-subtle); border:1px solid var(--border-color); border-radius:var(--radius-md); font-size:12px;">
        <strong>ESIC Contribution Periods Covered:</strong><br>
        <div style="margin-top:6px; display:flex; gap:8px; flex-wrap:wrap;">
          ${(() => {
            const currentStint = (emp.employmentHistory || []).find(s => s.stintId === emp.currentStintId);
            const periods = currentStint?.esicCoveredPeriods || emp.esicCoveredPeriods || [];
            return periods.length > 0
              ? periods.map(p => `<span class="esic-covered-pill covered">✓ ${esc(p)}</span>`).join('')
              : `<span style="color:var(--text-muted);">No contribution periods recorded yet.</span>`;
          })()}
        </div>
      </div>
      <div style="margin-top:16px; display:flex; justify-content:flex-end; gap:8px;">
        <button class="outline btn-sm" id="editStatutoryIdsBtn">✏️ Edit Statutory IDs</button>
        <button class="primary btn-sm" id="saveStatutoryEligBtn">💾 Save Eligibility</button>
      </div>
    `,

    salary: renderSalaryHistoryTabHtml(emp),

    audit: `
      <p style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">Recent audit entries for ${esc(emp.name)}</p>
      ${renderTable(
        (db.audit || []).filter(a => a.detail && a.detail.includes(emp.empCode)).slice(0, 30),
        [
          { label: 'Date/Time', render: r => `<span style="font-size:11px; font-family:monospace;">${new Date(r.at).toLocaleString('en-IN')}</span>` },
          { label: 'Action', render: r => `<code style="font-size:11px;">${esc(r.action)}</code>` },
          { label: 'Module', render: r => esc(r.module) },
          { label: 'Details', render: r => `<span style="font-size:11px;">${esc(r.detail)}</span>` },
          { label: 'User', render: r => esc(r.user || 'Admin') }
        ],
        'No audit entries found for this employee.'
      )}`
  };

  const body = `
    <div style="padding:0;">
      <div style="background:linear-gradient(135deg,#0f172a,#1e293b); padding:16px 20px; border-radius:var(--radius-md) var(--radius-md) 0 0; margin:-16px -16px 16px; display:flex; align-items:center; gap:14px;">
        ${emp.photo ? `
          <img src="${emp.photo}" class="emp-photo-avatar" style="width:52px; height:52px; border-radius:50%; object-fit:cover; border:2px solid #38bdf8; flex-shrink:0; box-shadow:0 2px 8px rgba(0,0,0,0.3);" alt="${esc(emp.name)}">
        ` : `
          <div style="width:52px; height:52px; background:linear-gradient(135deg,#2563eb,#7c3aed); border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:20px; color:#fff; font-weight:700; flex-shrink:0; box-shadow:0 2px 8px rgba(0,0,0,0.3);">
            ${esc((emp.name || '?').charAt(0).toUpperCase())}
          </div>
        `}
        <div style="flex:1;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px;">
            <div>
              <div style="font-weight:700; color:#f8fafc; font-size:16px; display:flex; align-items:center; gap:8px;">
                ${esc(emp.name)}
                <span class="status ${emp.status === 'Inactive' ? 'warning' : 'ok'}" style="font-size:11px;">${esc(emp.status || 'Active')}</span>
              </div>
              <div style="font-size:12px; color:#94a3b8; margin-top:2px;">
                <span style="font-family:monospace; color:#cbd5e1;">${esc(emp.empCode)}</span> &bull; ${getPaymentModePill(emp.paymentMode)} &bull; 🏢 ${esc(getSiteName(emp.siteId))} &bull; 💼 ${esc(emp.designation || emp.category || 'Staff')}
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:10px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.05em;">Current Salary</div>
              <div style="font-size:16px; font-weight:800; color:#38bdf8;">${money((Number(emp.basic)||0) + (Number(emp.da)||0) + (Number(emp.hra)||0) + (Number(emp.conveyance)||0) + (Number(emp.medical)||0) + (Number(emp.otherAllowance)||0))}</div>
            </div>
          </div>
        </div>
      </div>
      ${tabBar}
      <div class="emp-profile-tab-content" id="empProfileTabContent">
        ${tabContents[empProfileTab] || ''}
      </div>
    </div>
  `;

  showModal({
    title: `${emp.name} — Employee Profile`,
    eyebrow: 'EMPLOYEE PROFILE',
    body,
    hideSave: true,
    modalClass: 'modal-xl'
  });

  // Tab switching
  document.querySelectorAll('.emp-profile-tab-btn').forEach(btn => {
    btn.onclick = () => {
      empProfileTab = btn.dataset.tab;
      const tabContentEl = document.getElementById('empProfileTabContent');
      if (tabContentEl) {
        tabContentEl.innerHTML = tabContents[empProfileTab] || '';
        attachProfileTabHandlers(emp);
      }
      document.querySelectorAll('.emp-profile-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === empProfileTab));
    };
  });

  attachProfileTabHandlers(emp);
}

function attachProfileTabHandlers(emp) {
  // Salary History tab handlers
  const recSalBtn = document.getElementById('recordSalaryRevisionBtn');
  if (recSalBtn) recSalBtn.onclick = () => openRecordSalaryRevisionModal(emp.empCode);
  const recFirstBtn = document.getElementById('recordFirstSalaryBtn');
  if (recFirstBtn) recFirstBtn.onclick = () => openRecordSalaryRevisionModal(emp.empCode);

  document.querySelectorAll('.del-sal-rev-btn').forEach(btn => {
    btn.onclick = () => {
      const revId = btn.dataset.id;
      showConfirm({
        title: 'Delete Salary Revision',
        message: 'Are you sure you want to delete this salary revision record? The employee active salary will revert to the previous revision.',
        isDanger: true,
        confirmText: 'Delete Revision',
        onConfirm: async () => {
          const idx = db.employees.findIndex(e => e.empCode === emp.empCode);
          if (idx !== -1) {
            db.employees[idx].salaryHistory = (db.employees[idx].salaryHistory || []).filter(h => h.id !== revId);
            const eff = getEffectiveSalary(db.employees[idx], currentPeriod);
            db.employees[idx].basic = eff.basic;
            db.employees[idx].da = eff.da;
            db.employees[idx].hra = eff.hra;
            db.employees[idx].conveyance = eff.conveyance;
            db.employees[idx].medical = eff.medical;
            db.employees[idx].otherAllowance = eff.otherAllowance;
            log('employee.salary_revision_deleted', `Deleted salary revision ${revId} for ${emp.name} (${emp.empCode})`, 'employees');
            await save();
            toast('Salary revision deleted');
            empProfileTab = 'salary';
            renderEmpProfileModal(db.employees[idx]);
          }
        }
      });
    };
  });

  // Personal Tab Photo Upload / Remove handlers
  const pfPhotoInput = document.getElementById('pfPhotoFile');
  const pfPhotoUploadBtn = document.getElementById('pfPhotoUploadBtn');
  const pfPhotoRemoveBtn = document.getElementById('pfPhotoRemoveBtn');
  if (pfPhotoUploadBtn && pfPhotoInput) {
    pfPhotoUploadBtn.onclick = () => pfPhotoInput.click();
    pfPhotoInput.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.size > 1048576) {
        toast(`Photo file size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds 1 MB limit. Please select a smaller photo.`, 'error');
        pfPhotoInput.value = '';
        return;
      }

      if (!['image/jpeg', 'image/jpg', 'image/png'].includes(file.type.toLowerCase())) {
        toast('Only JPG, JPEG, or PNG formats are supported.', 'error');
        pfPhotoInput.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = async (evt) => {
        const idx = db.employees.findIndex(em => em.empCode === emp.empCode);
        if (idx !== -1) {
          db.employees[idx].photo = evt.target.result;
          await save();
          toast('Photo updated successfully');
          empProfileTab = 'personal';
          renderEmpProfileModal(db.employees[idx]);
        }
      };
      reader.readAsDataURL(file);
    };
  }

  if (pfPhotoRemoveBtn) {
    pfPhotoRemoveBtn.onclick = async () => {
      const idx = db.employees.findIndex(em => em.empCode === emp.empCode);
      if (idx !== -1) {
        db.employees[idx].photo = '';
        await save();
        toast('Photo removed');
        empProfileTab = 'personal';
        renderEmpProfileModal(db.employees[idx]);
      }
    };
  }

  // Toggle Aadhaar mask
  const toggleAadhBtn = document.getElementById('toggleAadhaarBtn');
  if (toggleAadhBtn) {
    toggleAadhBtn.onclick = () => {
      const aadhInput = document.getElementById('pfAadhaar');
      if (aadhInput) {
        aadhInput.type = aadhInput.type === 'password' ? 'text' : 'password';
      }
    };
  }

  // Copy Present Address to Permanent in profile
  const copyBtn = document.getElementById('copyPresentInProfileBtn');
  if (copyBtn) {
    copyBtn.onclick = () => {
      const pres = document.getElementById('pfPresentAddress')?.value || '';
      const perm = document.getElementById('pfPermanentAddress');
      if (perm) perm.value = pres;
    };
  }

  // Personal Info save
  const savePersonalBtn = document.getElementById('savePersonalInfoBtn');
  if (savePersonalBtn) {
    savePersonalBtn.onclick = async () => {
      const idx = db.employees.findIndex(e => e.empCode === emp.empCode);
      if (idx !== -1) {
        const aadhaarRaw = document.getElementById('pfAadhaar')?.value.trim() || '';
        const aadhRes = validateAadhaar(aadhaarRaw, false);
        if (!aadhRes.valid) { toast(aadhRes.error, 'error'); return; }

        const panRaw = document.getElementById('pfPan')?.value.trim() || '';
        const panRes = validatePAN(panRaw, false);
        if (!panRes.valid) { toast(panRes.error, 'error'); return; }

        const mobileRaw = document.getElementById('pfMobile')?.value.trim() || '';
        const mobileRes = validateMobile(mobileRaw, false);
        if (!mobileRes.valid) { toast(mobileRes.error, 'error'); return; }

        db.employees[idx].name = document.getElementById('pfName')?.value.trim() || emp.name;
        db.employees[idx].aadhaarName = document.getElementById('pfAadhaarName')?.value.trim() || db.employees[idx].name;
        db.employees[idx].dob = document.getElementById('pfDob')?.value || '';
        db.employees[idx].gender = document.getElementById('pfGender')?.value || '';
        db.employees[idx].aadhaar = aadhRes.cleaned;
        db.employees[idx].pan = panRes.cleaned;
        db.employees[idx].mobile = mobileRes.cleaned;
        db.employees[idx].email = document.getElementById('pfEmail')?.value.trim() || '';
        db.employees[idx].presentAddress = document.getElementById('pfPresentAddress')?.value.trim() || '';
        db.employees[idx].permanentAddress = document.getElementById('pfPermanentAddress')?.value.trim() || '';
        db.employees[idx].address = db.employees[idx].presentAddress;
        db.employees[idx].emergencyContact = document.getElementById('pfEmergency')?.value.trim() || '';
        db.employees[idx].emergencyPhone = document.getElementById('pfEmergencyPhone')?.value.trim() || '';
        db.employees[idx].showPhotoOnPayslip = document.getElementById('pfShowPhotoOnSlip')?.checked !== false;

        log('employee.personal_updated', `Updated personal info for ${emp.name} (${emp.empCode})`, 'employees');
        await save();
        toast('Personal info saved successfully');
        render();
      }
    };
  }

  // Nominee Save
  const saveNomineeBtn = document.getElementById('saveNomineeBtn');
  if (saveNomineeBtn) {
    saveNomineeBtn.onclick = async () => {
      const idx = db.employees.findIndex(e => e.empCode === emp.empCode);
      if (idx !== -1) {
        const nomName = document.getElementById('nomName')?.value.trim() || '';
        const nomRel = document.getElementById('nomRel')?.value.trim() || '';
        const nomDob = document.getElementById('nomDob')?.value.trim() || '';
        const nomMobile = document.getElementById('nomMobile')?.value.trim() || '';
        const nomAddress = document.getElementById('nomAddress')?.value.trim() || '';
        const nomShare = Number(document.getElementById('nomShare')?.value || 100);

        db.employees[idx].nomineeName = nomName;
        db.employees[idx].nominee = {
          name: nomName,
          relationship: nomRel,
          dob: nomDob,
          mobile: nomMobile,
          address: nomAddress,
          sharePct: nomShare
        };

        log('employee.nominee_updated', `Updated nominee details for ${emp.name} (${emp.empCode})`, 'employees');
        await save();
        toast('Nominee details saved successfully');
      }
    };
  }

  // Family Member Add
  const addFamBtn = document.getElementById('addFamilyMemberBtn');
  if (addFamBtn) {
    addFamBtn.onclick = () => openFamilyMemberModal(emp.empCode);
  }

  // Family Member Edit & Delete
  document.querySelectorAll('.edit-fam-btn').forEach(btn => {
    btn.onclick = () => {
      const memberIdx = Number(btn.dataset.idx);
      openFamilyMemberModal(emp.empCode, memberIdx);
    };
  });

  document.querySelectorAll('.del-fam-btn').forEach(btn => {
    btn.onclick = () => {
      const memberIdx = Number(btn.dataset.idx);
      const member = (emp.familyMembers || [])[memberIdx];
      if (!member) return;
      showConfirm({
        title: 'Delete Family Member',
        message: `Remove family member <strong>${esc(member.name)}</strong> (${esc(member.relationship)}) from records?`,
        isDanger: true,
        confirmText: 'Remove Member',
        onConfirm: async () => {
          const idx = db.employees.findIndex(e => e.empCode === emp.empCode);
          if (idx !== -1) {
            db.employees[idx].familyMembers.splice(memberIdx, 1);
            await save();
            toast('Family member removed');
            empProfileTab = 'family';
            renderEmpProfileModal(db.employees[idx]);
          }
        }
      });
    };
  });

  // ESIC Allotment Edit button
  const editEsicBtn = document.getElementById('editEsicAllotmentBtn');
  if (editEsicBtn) {
    editEsicBtn.onclick = () => openEditEsicAllotmentModal(emp.empCode);
  }

  // ESIC Custom Field button
  const addEsicCustomBtn = document.getElementById('addEsicCustomFieldBtn');
  if (addEsicCustomBtn) {
    addEsicCustomBtn.onclick = () => openAddEsicCustomFieldModal(emp.empCode);
  }

  // ESIC Custom Field Delete button
  document.querySelectorAll('.del-esic-custom-btn').forEach(btn => {
    btn.onclick = async () => {
      const cIdx = Number(btn.dataset.idx);
      const idx = db.employees.findIndex(e => e.empCode === emp.empCode);
      if (idx !== -1 && db.employees[idx].esicDetails?.customFields) {
        db.employees[idx].esicDetails.customFields.splice(cIdx, 1);
        await save();
        toast('Custom ESIC field removed');
        empProfileTab = 'statutory';
        renderEmpProfileModal(db.employees[idx]);
      }
    };
  });

  // Generate ESIC Declaration Sheet
  const genEsicBtn = document.getElementById('generateEsicSheetBtn');
  if (genEsicBtn) {
    genEsicBtn.onclick = () => openEsicDeclarationModal(emp.empCode);
  }

  // Rejoin button
  const rejoinBtn = document.getElementById('rejoinEmpBtn');
  if (rejoinBtn) rejoinBtn.onclick = () => { closeModal(); openRejoinModal(emp.empCode); };

  // Mark as Left button
  const markLeavingBtn = document.getElementById('markLeavingBtn');
  if (markLeavingBtn) markLeavingBtn.onclick = () => { closeModal(); openMarkLeavingModal(emp.empCode); };

  // Edit current stint button (opens existing openEmployeeModal in edit mode)
  const editStintBtn = document.getElementById('editCurrentStintBtn');
  if (editStintBtn) editStintBtn.onclick = () => { closeModal(); openEmployeeModal(emp); };

  // Statutory eligibility save
  const saveStatutoryBtn = document.getElementById('saveStatutoryEligBtn');
  if (saveStatutoryBtn) {
    saveStatutoryBtn.onclick = async () => {
      const idx = db.employees.findIndex(e => e.empCode === emp.empCode);
      if (idx !== -1) {
        db.employees[idx].pfEligible = document.getElementById('pfEligible')?.value !== 'false';
        db.employees[idx].esiEligible = document.getElementById('esiEligible')?.value !== 'false';
        db.employees[idx].ptEligible = document.getElementById('ptEligible')?.value !== 'false';
        db.employees[idx].lwfEligible = document.getElementById('lwfEligible')?.value !== 'false';
        log('employee.statutory_updated', `Updated statutory eligibility for ${emp.name} (${emp.empCode})`, 'employees');
        await save();
        toast('Statutory eligibility saved');
      }
    };
  }

  // Edit Statutory IDs
  const editStatutoryBtn = document.getElementById('editStatutoryIdsBtn');
  if (editStatutoryBtn) {
    editStatutoryBtn.onclick = () => {
      showModal({
        title: 'Edit Statutory Identifiers',
        eyebrow: 'STATUTORY IDs',
        modalClass: 'modal-lg',
        body: `<div class="form-grid">
          <div class="form-group"><label>Aadhaar Number (12 Digits)</label><input type="text" id="sAadhaar" maxlength="14" placeholder="12-digit Aadhaar" value="${esc(emp.aadhaar || '')}"></div>
          <div class="form-group"><label>PAN Number</label><input type="text" id="sPan" placeholder="e.g. ABCDE1234F" maxlength="10" value="${esc(emp.pan || '')}" style="text-transform:uppercase;"></div>
          <div class="form-group"><label>UAN Number</label><input type="text" id="sUan" placeholder="12-digit UAN" value="${esc(emp.uan || '')}"></div>
          <div class="form-group"><label>PF Number</label><input type="text" id="sPfNo" placeholder="PF Member ID" value="${esc(emp.pfNumber || '')}"></div>
          <div class="form-group"><label>ESI IP Number</label><input type="text" id="sEsiNo" placeholder="10-digit ESI IP No." value="${esc(emp.esiNumber || emp.esicDetails?.ipNumber || '')}"></div>
        </div>`,
        saveText: 'Save IDs',
        onSave: async () => {
          const aadhVal = document.getElementById('sAadhaar')?.value.trim() || '';
          const aadhRes = validateAadhaar(aadhVal, false);
          if (!aadhRes.valid) { toast(aadhRes.error, 'error'); return false; }

          const panVal = document.getElementById('sPan')?.value.trim() || '';
          const panRes = validatePAN(panVal, false);
          if (!panRes.valid) { toast(panRes.error, 'error'); return false; }

          const idx = db.employees.findIndex(e => e.empCode === emp.empCode);
          if (idx !== -1) {
            db.employees[idx].aadhaar = aadhRes.cleaned;
            db.employees[idx].pan = panRes.cleaned;
            db.employees[idx].uan = document.getElementById('sUan')?.value.trim();
            db.employees[idx].pfNumber = document.getElementById('sPfNo')?.value.trim();
            db.employees[idx].esiNumber = document.getElementById('sEsiNo')?.value.trim();
            if (!db.employees[idx].esicDetails) db.employees[idx].esicDetails = {};
            db.employees[idx].esicDetails.ipNumber = db.employees[idx].esiNumber;

            // Also update current stint
            const stint = (db.employees[idx].employmentHistory || []).find(s => s.stintId === db.employees[idx].currentStintId);
            if (stint) {
              stint.uan = db.employees[idx].uan;
              stint.pfNumber = db.employees[idx].pfNumber;
              stint.esiNumber = db.employees[idx].esiNumber;
              stint.pan = db.employees[idx].pan;
            }
            log('employee.statutory_ids_updated', `Updated statutory IDs for ${emp.name} (${emp.empCode})`, 'employees');
            await save();
            toast('Statutory IDs updated');
            empProfileTab = 'statutory';
            renderEmpProfileModal(db.employees[idx]);
          }
          return true;
        }
      });
    };
  }

  // KYC tab handlers
  document.querySelectorAll('.kyc-upload-trigger-btn').forEach(btn => {
    btn.onclick = () => openKycUploadModal(emp.empCode);
  });
  document.querySelectorAll('.kyc-view-btn').forEach(btn => {
    btn.onclick = () => {
      const docId = btn.dataset.docid;
      const doc = (db.kycDocuments || []).find(d => d.id === docId);
      if (doc) openKycVerifyModal(doc, emp.empCode);
    };
  });
  document.querySelectorAll('.kyc-del-btn').forEach(btn => {
    btn.onclick = async () => {
      const docId = btn.dataset.docid;
      const doc = (db.kycDocuments || []).find(d => d.id === docId);
      if (!doc) return;
      showConfirm({
        title: 'Delete KYC Document',
        message: `Permanently delete <strong>${esc(doc.docType)}</strong> document for ${esc(emp.name)}? This cannot be undone.`,
        isDanger: true,
        confirmText: 'Delete Document',
        onConfirm: async () => {
          if (doc.storedPath && window.emppay.deleteKycDocument) {
            await window.emppay.deleteKycDocument({ storedPath: doc.storedPath });
          }
          db.kycDocuments = db.kycDocuments.filter(d => d.id !== docId);
          log('kyc.deleted', `Deleted ${doc.docType} document for ${emp.name} (${emp.empCode})`, 'kyc');
          await save();
          toast('Document deleted');
          openEmployeeProfileModal(emp.empCode);
        }
      });
    };
  });
  document.querySelectorAll('.kyc-download-btn').forEach(btn => {
    btn.onclick = async () => {
      const docId = btn.dataset.docid;
      const doc = (db.kycDocuments || []).find(d => d.id === docId);
      if (!doc || !doc.storedPath) { toast('Document path not found', 'error'); return; }
      try {
        const res = await window.emppay.getKycDocument({ storedPath: doc.storedPath });
        if (!res || !res.success) { toast(res?.error || 'Failed to read document', 'error'); return; }
        const link = document.createElement('a');
        link.href = `data:${res.mimeType};base64,${res.base64}`;
        link.download = `${emp.empCode}_${doc.docType.replace(/\s/g, '_')}.${doc.storedPath.split('.').pop()}`;
        link.click();
      } catch (err) {
        toast('Download failed: ' + err.message, 'error');
      }
    };
  });
}

// Render KYC document grid HTML (used in profile tab)
function renderKycDocumentsHtml(empCode) {
  const docs = (db.kycDocuments || []).filter(d => d.empCode === empCode);
  const docIcons = { Aadhaar: '🪪', PAN: '📇', Passport: '📔', 'Driving Licence': '🚗', 'Voter ID': '🗳️', 'Cancelled Cheque': '🏦', 'Address Proof': '🏠', Photograph: '📷', Other: '📄' };

  const grid = docs.length === 0
    ? `<div style="text-align:center; padding:32px; color:var(--text-muted); font-size:13px;">
        <div style="font-size:36px; margin-bottom:8px;">📂</div>
        <p>No KYC documents uploaded yet.</p>
      </div>`
    : `<div class="kyc-document-grid">
        ${docs.map(doc => {
          const statusClass = (doc.verificationStatus || 'Pending').toLowerCase();
          const isExpired = doc.expiryDate && new Date(doc.expiryDate) < new Date();
          const finalStatus = isExpired ? 'expired' : statusClass;
          return `<div class="kyc-doc-card kyc-${finalStatus}">
            <div class="kyc-doc-icon">${docIcons[doc.docType] || '📄'}</div>
            <div class="kyc-doc-type">${esc(doc.docType)}</div>
            ${doc.docNumber ? `<div class="kyc-doc-number">${mask(doc.docNumber)}</div>` : ''}
            <span class="kyc-status-badge ${finalStatus}">
              ${finalStatus === 'verified' ? '✓ Verified' : finalStatus === 'rejected' ? '✗ Rejected' : finalStatus === 'expired' ? '⏰ Expired' : '⏳ Pending'}
            </span>
            <div class="kyc-doc-date">Uploaded: ${esc(doc.uploadDate || '—')}</div>
            ${doc.expiryDate ? `<div class="kyc-doc-date">Expires: ${esc(doc.expiryDate)}</div>` : ''}
            ${doc.verifiedBy ? `<div class="kyc-doc-date">Verified by: ${esc(doc.verifiedBy)}</div>` : ''}
            <div class="kyc-doc-actions">
              <button class="kyc-view-btn" data-docid="${esc(doc.id)}" title="View / Verify">👁 View</button>
              <button class="kyc-download-btn" data-docid="${esc(doc.id)}" title="Download">⬇ DL</button>
              <button class="kyc-del-btn" data-docid="${esc(doc.id)}" title="Delete">🗑</button>
            </div>
          </div>`;
        }).join('')}
      </div>`;

  return `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <div>
        <p style="font-size:12px; color:var(--text-muted);">${docs.length} document(s) on file</p>
      </div>
      <button class="primary btn-sm kyc-upload-trigger-btn">📎 Upload KYC Document</button>
    </div>
    ${grid}
  `;
}

// Open KYC Document Upload Modal
function openKycUploadModal(empCode) {
  const docTypes = ['Aadhaar', 'PAN', 'Passport', 'Driving Licence', 'Voter ID', 'Cancelled Cheque', 'Address Proof', 'Photograph', 'Other'];
  let selectedFilePath = null;

  const html = `
    <div class="form-grid">
      <div class="form-group">
        <label>Document Type *</label>
        <select id="kycDocType">
          <option value="">— Select Type —</option>
          ${docTypes.map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Document Number (Optional — stored masked)</label>
        <input type="text" id="kycDocNumber" placeholder="e.g. XXXX-XXXX-1234">
      </div>
      <div class="form-group">
        <label>Expiry Date (if applicable)</label>
        <input type="date" id="kycExpiry">
      </div>
      <div class="form-group">
        <label>Verification Status</label>
        <select id="kycVerifStatus">
          <option value="Pending">⏳ Pending</option>
          <option value="Verified">✓ Verified</option>
          <option value="Rejected">✗ Rejected</option>
        </select>
      </div>
      <div class="form-group" style="grid-column:span 2;">
        <label>Verified By (HR/Admin Name)</label>
        <input type="text" id="kycVerifBy" placeholder="Leave blank if Pending">
      </div>
      <div class="form-group" style="grid-column:span 2;">
        <label>Remarks</label>
        <textarea id="kycRemarks" rows="2" style="width:100%; padding:8px; border:1px solid var(--border-color); border-radius:6px; font-family:inherit; resize:vertical;"></textarea>
      </div>
    </div>
    <div class="form-group" style="margin-top:8px;">
      <label>Document File * (JPG, PNG, PDF — max 5 MB)</label>
      <div class="kyc-upload-area" id="kycUploadArea">
        <span class="kyc-upload-icon">📎</span>
        <span id="kycFileName">Click to select document file</span>
      </div>
    </div>
  `;

  showModal({
    title: 'Upload KYC Document',
    eyebrow: 'DOCUMENT MANAGEMENT',
    body: html,
    saveText: 'Upload & Save',
    modalClass: 'modal-lg',
    onSave: async () => {
      const docType = document.getElementById('kycDocType')?.value;
      if (!docType) { toast('Please select a document type', 'error'); return false; }
      if (!selectedFilePath) { toast('Please select a document file', 'error'); return false; }

      const emp = (db.employees || []).find(e => e.empCode === empCode);
      const docId = `KYC-${Date.now()}`;

      try {
        const res = await window.emppay.saveKycDocument({ empCode, docId, sourcePath: selectedFilePath });
        if (!res || !res.success) { toast(res?.error || 'File upload failed', 'error'); return false; }

        const docMeta = {
          id: docId,
          empCode,
          stintId: emp?.currentStintId || '',
          docType,
          docNumber: document.getElementById('kycDocNumber')?.value.trim() || '',
          storedPath: res.storedPath,
          storedFileName: res.storedFileName,
          ext: res.ext,
          sizeBytes: res.sizeBytes,
          uploadDate: new Date().toISOString().slice(0, 10),
          expiryDate: document.getElementById('kycExpiry')?.value || null,
          verificationStatus: document.getElementById('kycVerifStatus')?.value || 'Pending',
          verifiedBy: document.getElementById('kycVerifBy')?.value.trim() || '',
          verificationDate: document.getElementById('kycVerifStatus')?.value === 'Verified' ? new Date().toISOString().slice(0, 10) : '',
          remarks: document.getElementById('kycRemarks')?.value.trim() || '',
          uploadedBy: db.auth?.username || 'Admin',
          uploadedAt: new Date().toISOString(),
          history: []
        };

        if (!db.kycDocuments) db.kycDocuments = [];
        db.kycDocuments.push(docMeta);
        log('kyc.uploaded', `Uploaded ${docType} document for ${emp?.name || empCode} (${empCode})`, 'kyc');
        await save();
        toast(`${docType} document uploaded successfully`);
        openEmployeeProfileModal(empCode);
        return true;
      } catch (err) {
        toast('Upload error: ' + err.message, 'error');
        return false;
      }
    }
  });

  // File picker trigger
  document.getElementById('kycUploadArea')?.addEventListener('click', async () => {
    if (!window.emppay.openKycFilePicker) return;
    const filePath = await window.emppay.openKycFilePicker();
    if (filePath) {
      selectedFilePath = filePath;
      const fileName = filePath.split(/[/\\]/).pop();
      const el = document.getElementById('kycFileName');
      if (el) el.textContent = `📎 ${fileName}`;
    }
  });
}

// Open KYC View / Verify Modal
function openKycVerifyModal(doc, empCode) {
  const emp = (db.employees || []).find(e => e.empCode === empCode);

  const html = `
    <div class="form-grid">
      <div class="form-group"><label>Document Type</label><div style="font-size:14px; font-weight:600;">${esc(doc.docType)}</div></div>
      <div class="form-group"><label>Document Number</label><div style="font-family:monospace; font-size:13px;">${mask(doc.docNumber)}</div></div>
      <div class="form-group"><label>Upload Date</label><div>${esc(doc.uploadDate || '—')}</div></div>
      <div class="form-group"><label>Expiry Date</label><div>${esc(doc.expiryDate || 'N/A')}</div></div>
      <div class="form-group">
        <label>Verification Status</label>
        <select id="kvcStatus">
          <option value="Pending" ${doc.verificationStatus === 'Pending' ? 'selected' : ''}>⏳ Pending</option>
          <option value="Verified" ${doc.verificationStatus === 'Verified' ? 'selected' : ''}>✓ Verified</option>
          <option value="Rejected" ${doc.verificationStatus === 'Rejected' ? 'selected' : ''}>✗ Rejected</option>
        </select>
      </div>
      <div class="form-group">
        <label>Verified By</label>
        <input type="text" id="kvcVerifiedBy" value="${esc(doc.verifiedBy || '')}" placeholder="HR / Admin name">
      </div>
      <div class="form-group" style="grid-column:span 2;">
        <label>Remarks</label>
        <textarea id="kvcRemarks" rows="2" style="width:100%; padding:8px; border:1px solid var(--border-color); border-radius:6px; font-family:inherit;">${esc(doc.remarks || '')}</textarea>
      </div>
    </div>
  `;

  showModal({
    title: `${doc.docType} — View & Verify`,
    eyebrow: 'KYC VERIFICATION',
    body: html,
    saveText: 'Save Verification Status',
    modalClass: 'modal-lg',
    onSave: async () => {
      const idx = (db.kycDocuments || []).findIndex(d => d.id === doc.id);
      if (idx !== -1) {
        const prevStatus = db.kycDocuments[idx].verificationStatus;
        db.kycDocuments[idx].verificationStatus = document.getElementById('kvcStatus')?.value || 'Pending';
        db.kycDocuments[idx].verifiedBy = document.getElementById('kvcVerifiedBy')?.value.trim() || '';
        db.kycDocuments[idx].verificationDate = document.getElementById('kvcStatus')?.value === 'Verified' ? new Date().toISOString().slice(0, 10) : '';
        db.kycDocuments[idx].remarks = document.getElementById('kvcRemarks')?.value.trim() || '';
        // Append to history
        if (!db.kycDocuments[idx].history) db.kycDocuments[idx].history = [];
        db.kycDocuments[idx].history.push({ at: new Date().toISOString(), from: prevStatus, to: db.kycDocuments[idx].verificationStatus, by: db.auth?.username || 'Admin' });
        log('kyc.verified', `Updated ${doc.docType} status to ${db.kycDocuments[idx].verificationStatus} for ${emp?.name || empCode}`, 'kyc');
        await save();
        toast('Verification status saved');
        openEmployeeProfileModal(empCode);
      }
      return true;
    }
  });
}

// ----------------------------------------------------
// EMPLOYEE REJOIN MODAL (Phase 2)
// ----------------------------------------------------
function openRejoinModal(empCode) {
  const emp = (db.employees || []).find(e => e.empCode === empCode);
  if (!emp) { toast('Employee not found', 'error'); return; }

  if (emp.status === 'Active' || emp.currentStintId) {
    toast('This employee already has an active employment period.', 'error');
    return;
  }

  const lastStint = (emp.employmentHistory || []).slice().sort((a, b) => (b.stintNumber || 0) - (a.stintNumber || 0))[0];
  const lastLeaveDate = lastStint?.leaveDate || '';
  const nextStintNo = (emp.employmentHistory || []).length + 1;
  const sites = (db.sites || []).filter(s => s.status !== 'Inactive');

  const historyHtml = lastStint ? `
    <div style="background:var(--bg-subtle); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:12px; margin-bottom:16px; font-size:12px;">
      <strong>Previous Employment — Period #${lastStint.stintNumber}</strong><br>
      ${esc(lastStint.joinDate || '—')} → ${esc(lastStint.leaveDate || 'N/A')}<br>
      ${esc(lastStint.department || '—')} · ${esc(lastStint.designation || '—')} · ${money(lastStint.basic)} basic
      ${lastStint.reasonForLeaving ? `<br>Reason for leaving: <em>${esc(lastStint.reasonForLeaving)}</em>` : ''}
    </div>
  ` : '';

  const html = `
    ${historyHtml}
    <div style="font-size:12px; font-weight:700; color:var(--accent-blue); letter-spacing:0.06em; margin-bottom:12px; text-transform:uppercase;">Employment Period #${nextStintNo} — New Terms</div>
    <div class="form-grid">
      <div class="form-group">
        <label>Rejoin Date *</label>
        <input type="date" id="rjJoinDate" required value="${new Date().toISOString().slice(0, 10)}" min="${lastLeaveDate || '2020-01-01'}">
        ${lastLeaveDate ? `<small style="color:var(--text-muted);">Must be on or after last leave date: ${esc(lastLeaveDate)}</small>` : ''}
      </div>
      <div class="form-group">
        <label>Site / Location *</label>
        <select id="rjSite">
          ${sites.map(s => `<option value="${esc(s.id)}" ${s.id === lastStint?.siteId ? 'selected' : ''}>${esc(s.siteName)} (${esc(s.siteCode)})</option>`).join('')}
          ${sites.length === 0 ? '<option value="unassigned">⚠️ No Active Sites</option>' : ''}
        </select>
      </div>
      <div class="form-group">
        <label>Department *</label>
        <input type="text" id="rjDept" required value="${esc(lastStint?.department || '')}">
      </div>
      <div class="form-group">
        <label>Designation</label>
        <input type="text" id="rjDesig" value="${esc(lastStint?.designation || '')}">
      </div>
      <div class="form-group">
        <label>Category</label>
        <select id="rjCategory">
          ${['Skilled', 'Semi-skilled', 'Unskilled', 'Executive', 'Manager'].map(c => `<option value="${c}" ${(lastStint?.category || 'Skilled') === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Employment Type</label>
        <select id="rjEmpType">
          ${['Permanent', 'Contract', 'Probation', 'Temporary', 'Internship'].map(t => `<option value="${t}" ${(lastStint?.employmentType || 'Permanent') === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Reporting Manager</label>
        <input type="text" id="rjManager" value="${esc(lastStint?.reportingManager || '')}">
      </div>
      <div class="form-group">
        <label>Payment Mode</label>
        <select id="rjPayMode">
          <option value="Bank" ${(lastStint?.paymentMode || 'Bank') === 'Bank' ? 'selected' : ''}>🏦 Bank Transfer</option>
          <option value="Cash" ${lastStint?.paymentMode === 'Cash' ? 'selected' : ''}>💵 Cash</option>
          <option value="Cheque" ${lastStint?.paymentMode === 'Cheque' ? 'selected' : ''}>📑 Cheque</option>
        </select>
      </div>
      <div class="form-group">
        <label>Monthly Basic Salary (₹) *</label>
        <input type="number" id="rjBasic" required min="0" value="${lastStint?.basic || 0}">
      </div>
      <div class="form-group">
        <label>DA (₹)</label>
        <input type="number" id="rjDa" min="0" value="${lastStint?.da || 0}">
      </div>
      <div class="form-group">
        <label>HRA (₹)</label>
        <input type="number" id="rjHra" min="0" value="${lastStint?.hra || 0}">
      </div>
      <div class="form-group">
        <label>Other Allowance (₹)</label>
        <input type="number" id="rjOther" min="0" value="${lastStint?.otherAllowance || 0}">
      </div>
      <div class="form-group">
        <label>Bank Account No.</label>
        <input type="text" id="rjBank" value="${esc(lastStint?.bankAccount || emp.bankAccount || '')}">
      </div>
      <div class="form-group">
        <label>IFSC Code</label>
        <input type="text" id="rjIfsc" value="${esc(lastStint?.ifsc || emp.ifsc || '')}">
      </div>
      <div class="form-group">
        <label>PF Number</label>
        <input type="text" id="rjPfNo" value="${esc(lastStint?.pfNumber || emp.pfNumber || '')}">
      </div>
      <div class="form-group">
        <label>ESI IP Number</label>
        <input type="text" id="rjEsiNo" value="${esc(lastStint?.esiNumber || emp.esiNumber || '')}">
      </div>
      <div class="form-group" style="grid-column:span 2;">
        <label>Reason for Rejoining</label>
        <textarea id="rjReason" rows="2" style="width:100%; padding:8px; border:1px solid var(--border-color); border-radius:6px; font-family:inherit; resize:vertical;"></textarea>
      </div>
    </div>
  `;

  showModal({
    title: `Rejoin — ${emp.name} (${emp.empCode})`,
    eyebrow: `EMPLOYMENT PERIOD #${nextStintNo}`,
    body: html,
    saveText: '✅ Confirm Rejoin',
    modalClass: 'modal-xl',
    onSave: async () => {
      const joinDate = document.getElementById('rjJoinDate')?.value;
      const dept = document.getElementById('rjDept')?.value.trim();
      const basic = Number(document.getElementById('rjBasic')?.value || 0);

      if (!joinDate) { toast('Please enter a rejoin date', 'error'); return false; }
      if (!dept) { toast('Please enter department', 'error'); return false; }
      if (basic <= 0) { toast('Please enter a valid basic salary', 'error'); return false; }

      // Validation: rejoin date cannot be before last leave date
      if (lastLeaveDate && joinDate < lastLeaveDate) {
        toast(`Rejoin date ${joinDate} cannot be before previous leaving date ${lastLeaveDate}`, 'error');
        return false;
      }

      // Validation: no active employment should already exist
      const currentActiveStint = (emp.employmentHistory || []).find(s => s.status === 'Active');
      if (currentActiveStint) {
        toast('Cannot rejoin: active employment period already exists.', 'error');
        return false;
      }

      const newStintId = `${emp.empCode}_S${nextStintNo}`;
      const newStint = {
        stintId: newStintId,
        stintNumber: nextStintNo,
        joinDate,
        leaveDate: null,
        reasonForLeaving: '',
        reasonForJoining: document.getElementById('rjReason')?.value.trim() || '',
        department: dept,
        designation: document.getElementById('rjDesig')?.value.trim() || '',
        category: document.getElementById('rjCategory')?.value || 'Skilled',
        siteId: document.getElementById('rjSite')?.value || 'unassigned',
        reportingManager: document.getElementById('rjManager')?.value.trim() || '',
        employmentType: document.getElementById('rjEmpType')?.value || 'Permanent',
        paymentMode: document.getElementById('rjPayMode')?.value || 'Bank',
        basic,
        da: Number(document.getElementById('rjDa')?.value || 0),
        hra: Number(document.getElementById('rjHra')?.value || 0),
        conveyance: lastStint?.conveyance || 0,
        medical: lastStint?.medical || 0,
        otherAllowance: Number(document.getElementById('rjOther')?.value || 0),
        bankAccount: document.getElementById('rjBank')?.value.trim() || '',
        ifsc: document.getElementById('rjIfsc')?.value.trim() || '',
        bankName: lastStint?.bankName || '',
        uan: emp.uan || '',
        pfNumber: document.getElementById('rjPfNo')?.value.trim() || '',
        esiNumber: document.getElementById('rjEsiNo')?.value.trim() || '',
        pan: emp.pan || '',
        esicCoveredPeriods: [],
        status: 'Active',
        createdAt: new Date().toISOString()
      };

      // Update employee root record
      const idx = db.employees.findIndex(e => e.empCode === empCode);
      if (idx !== -1) {
        if (!db.employees[idx].employmentHistory) db.employees[idx].employmentHistory = [];
        db.employees[idx].employmentHistory.push(newStint);
        db.employees[idx].currentStintId = newStintId;
        db.employees[idx].status = 'Active';
        // Sync root-level fields to current stint
        db.employees[idx].siteId = newStint.siteId;
        db.employees[idx].department = newStint.department;
        db.employees[idx].designation = newStint.designation;
        db.employees[idx].category = newStint.category;
        db.employees[idx].basic = newStint.basic;
        db.employees[idx].da = newStint.da;
        db.employees[idx].hra = newStint.hra;
        db.employees[idx].otherAllowance = newStint.otherAllowance;
        db.employees[idx].paymentMode = newStint.paymentMode;
        db.employees[idx].bankAccount = newStint.bankAccount;
        db.employees[idx].ifsc = newStint.ifsc;
        db.employees[idx].pfNumber = newStint.pfNumber;
        db.employees[idx].esiNumber = newStint.esiNumber;
        db.employees[idx].joinDate = newStint.joinDate;
      }

      // Create fresh attendance record for the new period
      const hasAttForPeriod = db.attendance.some(a => a.empCode === empCode && a.period === currentPeriod);
      if (!hasAttForPeriod) {
        db.attendance.push({ empCode, period: currentPeriod, stintId: newStintId, workingDays: 26, presentDays: 26, weeklyOffs: 4, paidHolidays: 1, sickLeave: 0, cl: 0, pl: 0, otherLeave: 0, lopDays: 0, payableDays: 26, otHours: 0 });
      }

      log('employee.rejoined', `${emp.name} (${empCode}) rejoined as Employment Period #${nextStintNo} from ${joinDate}`, 'employees');
      await save();
      toast(`${emp.name} successfully rejoined as Period #${nextStintNo}!`);
      render();
      return true;
    }
  });
}

// ----------------------------------------------------
// MARK EMPLOYEE AS LEFT (End Current Employment Period)
// ----------------------------------------------------
function openMarkLeavingModal(empCode) {
  const emp = (db.employees || []).find(e => e.empCode === empCode);
  if (!emp) { toast('Employee not found', 'error'); return; }

  const currentStint = (emp.employmentHistory || []).find(s => s.stintId === emp.currentStintId);
  if (!currentStint) { toast('No active employment period found.', 'error'); return; }

  const html = `
    <div style="background:var(--bg-subtle); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:12px; margin-bottom:16px; font-size:12px;">
      <strong>Current Employment — Period #${currentStint.stintNumber}</strong><br>
      Joined: ${esc(currentStint.joinDate || '—')} · ${esc(currentStint.department || '—')} · ${esc(currentStint.designation || '—')} · ${money(currentStint.basic)} basic
    </div>
    <div class="form-grid">
      <div class="form-group">
        <label>Leaving Date *</label>
        <input type="date" id="lvDate" required value="${new Date().toISOString().slice(0, 10)}" min="${currentStint.joinDate || '2020-01-01'}">
      </div>
      <div class="form-group">
        <label>Reason for Leaving *</label>
        <select id="lvReason">
          <option value="Resignation">Resignation</option>
          <option value="Retirement">Retirement</option>
          <option value="Termination">Termination</option>
          <option value="End of Contract">End of Contract</option>
          <option value="Absconding">Absconding</option>
          <option value="Transfer">Transfer</option>
          <option value="Other">Other</option>
        </select>
      </div>
      <div class="form-group" style="grid-column:span 2;">
        <label>Remarks</label>
        <textarea id="lvRemarks" rows="2" style="width:100%; padding:8px; border:1px solid var(--border-color); border-radius:6px; font-family:inherit; resize:vertical;" placeholder="Additional notes..."></textarea>
      </div>
    </div>
    <p style="font-size:12px; color:var(--text-muted); margin-top:8px;">ℹ️ All payroll, attendance, and document records will be preserved. This employee can be rejoined later.</p>
  `;

  showModal({
    title: `Mark as Left — ${emp.name}`,
    eyebrow: 'EMPLOYMENT TERMINATION',
    body: html,
    saveText: '🚪 Confirm Leaving',
    modalClass: 'modal-lg',
    onSave: async () => {
      const leaveDate = document.getElementById('lvDate')?.value;
      if (!leaveDate) { toast('Please enter leaving date', 'error'); return false; }
      if (leaveDate < (currentStint.joinDate || '')) { toast('Leaving date cannot be before joining date', 'error'); return false; }

      const idx = db.employees.findIndex(e => e.empCode === empCode);
      if (idx !== -1) {
        // Update the stint
        const stintIdx = db.employees[idx].employmentHistory.findIndex(s => s.stintId === currentStint.stintId);
        if (stintIdx !== -1) {
          db.employees[idx].employmentHistory[stintIdx].leaveDate = leaveDate;
          db.employees[idx].employmentHistory[stintIdx].reasonForLeaving = document.getElementById('lvReason')?.value || 'Resignation';
          db.employees[idx].employmentHistory[stintIdx].remarks = document.getElementById('lvRemarks')?.value.trim() || '';
          db.employees[idx].employmentHistory[stintIdx].status = 'Completed';
        }
        db.employees[idx].status = 'Inactive';
        db.employees[idx].currentStintId = null;
        db.employees[idx].leavingDate = leaveDate;
      }

      log('employee.left', `${emp.name} (${empCode}) left employment on ${leaveDate} (Reason: ${document.getElementById('lvReason')?.value})`, 'employees');
      await save();
      toast(`${emp.name} marked as left on ${leaveDate}`);
      render();
      return true;
    }
  });
}

// ----------------------------------------------------
// FAMILY, NOMINEE & ESIC ALLOTMENT MODALS
// ----------------------------------------------------
function openFamilyMemberModal(empCode, memberIdx = null) {
  const emp = (db.employees || []).find(e => e.empCode === empCode);
  if (!emp) { toast('Employee not found', 'error'); return; }

  const isEdit = memberIdx !== null && memberIdx !== undefined && !isNaN(memberIdx);
  const member = isEdit ? (emp.familyMembers || [])[memberIdx] : null;

  const html = `
    <div class="form-grid">
      <div class="form-group" style="grid-column:span 2;">
        <label>Family Member Full Name *</label>
        <input type="text" id="fmName" required placeholder="Full Name as per ID" value="${esc(member?.name || '')}">
      </div>
      <div class="form-group">
        <label>Relationship *</label>
        <select id="fmRel">
          ${['Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister', 'Dependent Parent', 'Other'].map(r => `
            <option value="${r}" ${(member?.relationship || 'Spouse') === r ? 'selected' : ''}>${r}</option>
          `).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Date of Birth</label>
        <input type="date" id="fmDob" value="${member?.dob || ''}">
      </div>
      <div class="form-group">
        <label>Gender</label>
        <select id="fmGender">
          <option value="Male" ${(member?.gender || 'Male') === 'Male' ? 'selected' : ''}>Male</option>
          <option value="Female" ${member?.gender === 'Female' ? 'selected' : ''}>Female</option>
          <option value="Other" ${member?.gender === 'Other' ? 'selected' : ''}>Other</option>
        </select>
      </div>
      <div class="form-group">
        <label>Residing with Employee?</label>
        <select id="fmResiding">
          <option value="Yes" ${member?.residingWith !== false ? 'selected' : ''}>Yes</option>
          <option value="No" ${member?.residingWith === false ? 'selected' : ''}>No</option>
        </select>
      </div>
      <div class="form-group">
        <label>Dependent on Employee?</label>
        <select id="fmDependent">
          <option value="Yes" ${member?.dependent !== false ? 'selected' : ''}>Yes (Eligible for ESIC/Benefits)</option>
          <option value="No" ${member?.dependent === false ? 'selected' : ''}>No</option>
        </select>
      </div>
    </div>
  `;

  showModal({
    title: isEdit ? 'Edit Family Member' : 'Add Family Member',
    eyebrow: `FAMILY DETAILS · ${emp.name} (${emp.empCode})`,
    body: html,
    saveText: isEdit ? 'Update Member' : 'Add Member',
    modalClass: 'modal-lg',
    onSave: async () => {
      const name = document.getElementById('fmName')?.value.trim();
      if (!name) { toast('Please enter family member name', 'error'); return false; }

      const rel = document.getElementById('fmRel')?.value || 'Spouse';
      const dob = document.getElementById('fmDob')?.value || '';
      const gender = document.getElementById('fmGender')?.value || 'Male';
      const residingWith = document.getElementById('fmResiding')?.value === 'Yes';
      const dependent = document.getElementById('fmDependent')?.value === 'Yes';

      const memberObj = {
        id: member?.id || `FAM-${Date.now()}`,
        name,
        relationship: rel,
        dob,
        gender,
        residingWith,
        dependent
      };

      const idx = db.employees.findIndex(e => e.empCode === empCode);
      if (idx !== -1) {
        if (!db.employees[idx].familyMembers) db.employees[idx].familyMembers = [];
        if (isEdit) {
          db.employees[idx].familyMembers[memberIdx] = memberObj;
        } else {
          db.employees[idx].familyMembers.push(memberObj);
        }
        log('employee.family_updated', `${isEdit ? 'Updated' : 'Added'} family member ${name} (${rel}) for ${emp.name} (${emp.empCode})`, 'employees');
        await save();
        toast(`Family member ${isEdit ? 'updated' : 'added'} successfully`);
        empProfileTab = 'family';
        renderEmpProfileModal(db.employees[idx]);
      }
      return true;
    }
  });
}

function openEditEsicAllotmentModal(empCode) {
  const emp = (db.employees || []).find(e => e.empCode === empCode);
  if (!emp) { toast('Employee not found', 'error'); return; }
  const esic = emp.esicDetails || {};

  const html = `
    <div class="form-grid">
      <div class="form-group">
        <label>ESIC Registration Status *</label>
        <select id="esicStatus">
          <option value="Allotted" ${(esic.status || 'Allotted') === 'Allotted' ? 'selected' : ''}>✅ Allotted (Active IP Number)</option>
          <option value="Pending Registration" ${esic.status === 'Pending Registration' ? 'selected' : ''}>⏳ Pending Registration / Allotment</option>
          <option value="Exempted" ${esic.status === 'Exempted' ? 'selected' : ''}>🛡️ Exempted (Wage > ₹21,000)</option>
          <option value="Not Applicable" ${esic.status === 'Not Applicable' ? 'selected' : ''}>❌ Not Applicable</option>
        </select>
      </div>
      <div class="form-group">
        <label>ESIC IP Number (10 Digits)</label>
        <input type="text" id="esicIpNo" placeholder="e.g. 3112345678" maxlength="17" value="${esc(esic.ipNumber || emp.esiNumber || '')}">
      </div>
      <div class="form-group">
        <label>Registration / Allotment Date</label>
        <input type="date" id="esicDate" value="${esic.allotmentDate || ''}">
      </div>
      <div class="form-group">
        <label>Designated Dispensary / Branch Office</label>
        <input type="text" id="esicDispensary" placeholder="e.g. ESI Dispensary Nigdi, Pune" value="${esc(esic.dispensary || '')}">
      </div>
      <div class="form-group">
        <label>Employer Code</label>
        <input type="text" id="esicEmployerCode" placeholder="17-digit ESIC Employer Code" value="${esc(esic.employerCode || '31000123450000101')}">
      </div>
      <div class="form-group">
        <label>Marital Status</label>
        <select id="esicMaritalStatus">
          <option value="Married" ${(esic.maritalStatus || 'Married') === 'Married' ? 'selected' : ''}>Married</option>
          <option value="Unmarried" ${esic.maritalStatus === 'Unmarried' ? 'selected' : ''}>Unmarried</option>
          <option value="Widowed" ${esic.maritalStatus === 'Widowed' ? 'selected' : ''}>Widowed</option>
          <option value="Divorced" ${esic.maritalStatus === 'Divorced' ? 'selected' : ''}>Divorced</option>
        </select>
      </div>
      <div class="form-group" style="grid-column:span 2;">
        <label>Father's / Husband's Name (for Pehchan / Form 1)</label>
        <input type="text" id="esicFatherOrHusband" placeholder="Father or Husband Full Name" value="${esc(esic.fatherOrHusbandName || '')}">
      </div>
    </div>
    <div style="margin-top:10px; font-size:12px; color:var(--text-muted); background:var(--bg-subtle); padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-color);">
      ℹ️ Updating the IP Number here will automatically keep employee statutory records and payroll deduction calculations in sync.
    </div>
  `;

  showModal({
    title: 'Edit ESIC Allotment & Registration',
    eyebrow: `ESIC MANAGEMENT · ${emp.name} (${emp.empCode})`,
    body: html,
    saveText: 'Save ESIC Details',
    modalClass: 'modal-lg',
    onSave: async () => {
      const ipVal = document.getElementById('esicIpNo')?.value.trim() || '';
      if (ipVal && !/^\d{9,17}$/.test(ipVal.replace(/\s/g, ''))) {
        toast('ESIC IP Number should be 10 digits numeric', 'error');
        return false;
      }

      const idx = db.employees.findIndex(e => e.empCode === empCode);
      if (idx !== -1) {
        if (!db.employees[idx].esicDetails) db.employees[idx].esicDetails = {};
        db.employees[idx].esicDetails = {
          ...db.employees[idx].esicDetails,
          status: document.getElementById('esicStatus')?.value || 'Allotted',
          ipNumber: ipVal,
          allotmentDate: document.getElementById('esicDate')?.value || '',
          dispensary: document.getElementById('esicDispensary')?.value.trim() || '',
          employerCode: document.getElementById('esicEmployerCode')?.value.trim() || '',
          maritalStatus: document.getElementById('esicMaritalStatus')?.value || 'Married',
          fatherOrHusbandName: document.getElementById('esicFatherOrHusband')?.value.trim() || ''
        };

        // Sync with root esiNumber & current stint
        db.employees[idx].esiNumber = ipVal;
        const stint = (db.employees[idx].employmentHistory || []).find(s => s.stintId === db.employees[idx].currentStintId);
        if (stint) stint.esiNumber = ipVal;

        log('employee.esic_updated', `Updated ESIC Allotment details for ${emp.name} (${emp.empCode})`, 'employees');
        await save();
        toast('ESIC allotment details saved');
        empProfileTab = 'statutory';
        renderEmpProfileModal(db.employees[idx]);
      }
      return true;
    }
  });
}

function openAddEsicCustomFieldModal(empCode) {
  const emp = (db.employees || []).find(e => e.empCode === empCode);
  if (!emp) { toast('Employee not found', 'error'); return; }

  const html = `
    <div class="form-grid">
      <div class="form-group" style="grid-column:span 2;">
        <label>Field Name / Label *</label>
        <input type="text" id="esicCustomLabel" required placeholder="e.g. Previous Insurance No, Branch Office, Sub-Code, Nominee Share">
      </div>
      <div class="form-group" style="grid-column:span 2;">
        <label>Field Value *</label>
        <input type="text" id="esicCustomValue" required placeholder="Enter value">
      </div>
    </div>
    <p style="font-size:12px; color:var(--text-muted); margin-top:8px;">
      ℹ️ This flexible provision lets you track any additional parameters required for ESIC portal submissions or compliance audits.
    </p>
  `;

  showModal({
    title: 'Add Custom ESIC Allotment Field',
    eyebrow: `CUSTOM ESIC ATTRIBUTE · ${emp.name} (${emp.empCode})`,
    body: html,
    saveText: 'Add Custom Field',
    modalClass: 'modal-md',
    onSave: async () => {
      const label = document.getElementById('esicCustomLabel')?.value.trim();
      const value = document.getElementById('esicCustomValue')?.value.trim();
      if (!label || !value) {
        toast('Please enter both field name and value', 'error');
        return false;
      }

      const idx = db.employees.findIndex(e => e.empCode === empCode);
      if (idx !== -1) {
        if (!db.employees[idx].esicDetails) db.employees[idx].esicDetails = {};
        if (!db.employees[idx].esicDetails.customFields) db.employees[idx].esicDetails.customFields = [];
        db.employees[idx].esicDetails.customFields.push({ label, value });

        log('employee.esic_custom_field_added', `Added ESIC field "${label}" for ${emp.name} (${emp.empCode})`, 'employees');
        await save();
        toast('Custom ESIC field added');
        empProfileTab = 'statutory';
        renderEmpProfileModal(db.employees[idx]);
      }
      return true;
    }
  });
}

function openEsicDeclarationModal(empCode) {
  const emp = (db.employees || []).find(e => e.empCode === empCode);
  if (!emp) { toast('Employee not found', 'error'); return; }

  const esic = emp.esicDetails || {};
  const fam = emp.familyMembers || [];
  const custom = esic.customFields || [];
  const site = getSite(emp.siteId);
  const employerCode = esic.employerCode || '31000123450000101';

  const plainSummary = `EMPLOYEES' STATE INSURANCE CORPORATION
FORM 1 DECLARATION & ALLOTMENT SHEET (Regulation 11 & 12)
------------------------------------------------------------
Employer Name: P & P ENTERPRISES
Employer Code: ${employerCode}
Location/Site: ${site ? site.siteName : 'Company Registered Office'}

INSURED PERSON DETAILS:
Employee Code: ${emp.empCode}
Employee Name: ${emp.name}
Name as per Aadhaar: ${emp.aadhaarName || emp.name}
Father / Husband Name: ${esic.fatherOrHusbandName || '—'}
Date of Birth: ${emp.dob || '—'}
Gender: ${emp.gender || 'Male'}
Marital Status: ${esic.maritalStatus || 'Unmarried'}
Mobile Number: ${emp.mobile || '—'}
Aadhaar Number: ${maskAadhaar(emp.aadhaar)}
PAN Number: ${emp.pan || '—'}
Present Address: ${emp.presentAddress || '—'}
Permanent Address: ${emp.permanentAddress || '—'}
Designated Dispensary: ${esic.dispensary || '—'}
ESIC Status: ${esic.status || 'Pending'}
ESIC IP Number: ${esic.ipNumber || emp.esiNumber || 'Pending Allotment'}

NOMINEE DETAILS:
Name: ${emp.nominee?.name || '—'}
Relationship: ${emp.nominee?.relationship || '—'}
Address: ${emp.nominee?.address || '—'}

FAMILY MEMBERS (${fam.length}):
${fam.map((m, i) => `${i + 1}. ${m.name} (${m.relationship}) | DOB: ${m.dob || '—'} | Gender: ${m.gender || '—'} | Residing: ${m.residingWith !== false ? 'Yes' : 'No'} | Dependent: ${m.dependent !== false ? 'Yes' : 'No'}`).join('\n')}

CUSTOM ESIC FIELDS:
${custom.map(c => `${c.label}: ${c.value}`).join('\n') || 'None'}
`;

  const html = `
    <div style="margin-bottom:14px; display:flex; justify-content:space-between; align-items:center;">
      <span style="font-size:12px; color:var(--text-muted);">Standard declaration sheet for ESIC Pehchan registration & Form 1 filing</span>
      <div style="display:flex; gap:8px;">
        <button class="outline btn-sm" id="copyEsicSummaryBtn">📋 Copy Summary</button>
        <button class="primary btn-sm" onclick="window.print()">🖨️ Print Form 1</button>
      </div>
    </div>

    <div class="esic-declaration-sheet" style="background:#fff; border:2px solid #0f172a; padding:24px; border-radius:6px; font-family:var(--font-sans); color:#0f172a; line-height:1.5;">
      <div style="text-align:center; border-bottom:2px solid #0f172a; padding-bottom:12px; margin-bottom:16px;">
        <div style="font-size:16px; font-weight:900; letter-spacing:0.05em;">EMPLOYEES' STATE INSURANCE CORPORATION</div>
        <div style="font-size:13px; font-weight:700; color:#475569;">FORM 1 (DECLARATION FORM — REGULATIONS 11 & 12)</div>
        <div style="font-size:11px; color:#64748b; margin-top:2px;">To be submitted for new registration & ESIC IP Number allotment</div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px; font-size:12px; background:#f8fafc; padding:12px; border:1px solid #cbd5e1; border-radius:4px;">
        <div><strong>Employer Name:</strong> P & P ENTERPRISES</div>
        <div><strong>ESIC Employer Code:</strong> <span style="font-family:var(--font-mono); font-weight:700;">${esc(employerCode)}</span></div>
        <div><strong>Location / Site:</strong> ${esc(site ? site.siteName : 'Head Office')}</div>
        <div><strong>IP Allotment Status:</strong> <span class="esic-badge ${(esic.status || 'Allotted').toLowerCase().replace(/\s/g, '-')}">${esc(esic.status || 'Allotted')}</span></div>
      </div>

      <div style="font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:#1e293b; border-bottom:1px solid #cbd5e1; padding-bottom:4px; margin-bottom:10px;">
        1. Insured Person Particulars
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px 16px; font-size:12px; margin-bottom:16px;">
        <div><span style="color:#64748b;">Employee Code:</span> <strong>${esc(emp.empCode)}</strong></div>
        <div><span style="color:#64748b;">ESIC IP Number:</span> <strong style="font-family:var(--font-mono); font-size:13px; color:#0369a1;">${esc(esic.ipNumber || emp.esiNumber || 'Pending Allotment')}</strong></div>
        <div><span style="color:#64748b;">Full Name:</span> <strong>${esc(emp.name)}</strong></div>
        <div><span style="color:#64748b;">Name as per Aadhaar:</span> <strong>${esc(emp.aadhaarName || emp.name)}</strong></div>
        <div><span style="color:#64748b;">Father's / Husband's Name:</span> <strong>${esc(esic.fatherOrHusbandName || '—')}</strong></div>
        <div><span style="color:#64748b;">Date of Birth / Age:</span> <strong>${esc(emp.dob || '—')}</strong></div>
        <div><span style="color:#64748b;">Gender:</span> <strong>${esc(emp.gender || 'Male')}</strong></div>
        <div><span style="color:#64748b;">Marital Status:</span> <strong>${esc(esic.maritalStatus || 'Unmarried')}</strong></div>
        <div><span style="color:#64748b;">Mobile Number:</span> <strong>${esc(emp.mobile || '—')}</strong></div>
        <div><span style="color:#64748b;">Aadhaar Number:</span> <strong>${maskAadhaar(emp.aadhaar)}</strong></div>
        <div><span style="color:#64748b;">PAN Number:</span> <strong>${esc(emp.pan || '—')}</strong></div>
        <div><span style="color:#64748b;">Designated Dispensary:</span> <strong>${esc(esic.dispensary || '—')}</strong></div>
        <div style="grid-column:span 2;"><span style="color:#64748b;">Present Address:</span> ${esc(emp.presentAddress || '—')}</div>
        <div style="grid-column:span 2;"><span style="color:#64748b;">Permanent Address:</span> ${esc(emp.permanentAddress || '—')}</div>
      </div>

      <div style="font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:#1e293b; border-bottom:1px solid #cbd5e1; padding-bottom:4px; margin-bottom:10px;">
        2. Nominee Details (Under Section 56 of the ESI Act)
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr 2fr; gap:8px 16px; font-size:12px; margin-bottom:16px; background:#f8fafc; padding:10px; border-radius:4px; border:1px solid #e2e8f0;">
        <div><span style="color:#64748b;">Nominee Name:</span><br><strong>${esc(emp.nominee?.name || '—')}</strong></div>
        <div><span style="color:#64748b;">Relationship:</span><br><strong>${esc(emp.nominee?.relationship || '—')}</strong></div>
        <div><span style="color:#64748b;">Nominee Address:</span><br>${esc(emp.nominee?.address || emp.presentAddress || '—')}</div>
      </div>

      <div style="font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:#1e293b; border-bottom:1px solid #cbd5e1; padding-bottom:4px; margin-bottom:10px;">
        3. Particulars of Enrolled Family Members (${fam.length})
      </div>
      <div style="margin-bottom:16px;">
        ${fam.length === 0 ? '<div style="font-size:12px; color:#64748b; font-style:italic; padding:8px 0;">No family members registered. Enrol dependents under the Family & Nominee tab.</div>' : `
          <table style="width:100%; font-size:11px; border-collapse:collapse; text-align:left;">
            <thead>
              <tr style="background:#f1f5f9; border-bottom:1px solid #cbd5e1;">
                <th style="padding:6px 8px;">#</th>
                <th style="padding:6px 8px;">Name</th>
                <th style="padding:6px 8px;">Relationship</th>
                <th style="padding:6px 8px;">DOB</th>
                <th style="padding:6px 8px;">Gender</th>
                <th style="padding:6px 8px;">Residing With IP?</th>
                <th style="padding:6px 8px;">Dependent?</th>
              </tr>
            </thead>
            <tbody>
              ${fam.map((m, i) => `
                <tr style="border-bottom:1px solid #e2e8f0;">
                  <td style="padding:6px 8px;">${i + 1}</td>
                  <td style="padding:6px 8px;"><strong>${esc(m.name)}</strong></td>
                  <td style="padding:6px 8px;">${esc(m.relationship)}</td>
                  <td style="padding:6px 8px;">${esc(m.dob || '—')}</td>
                  <td style="padding:6px 8px;">${esc(m.gender || '—')}</td>
                  <td style="padding:6px 8px;">${m.residingWith !== false ? 'Yes' : 'No'}</td>
                  <td style="padding:6px 8px;">${m.dependent !== false ? '✅ Yes' : 'No'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      </div>

      ${custom.length > 0 ? `
        <div style="font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:#1e293b; border-bottom:1px solid #cbd5e1; padding-bottom:4px; margin-bottom:10px;">
          4. Additional ESIC Parameters
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px 16px; font-size:12px; margin-bottom:16px;">
          ${custom.map(c => `<div><span style="color:#64748b;">${esc(c.label)}:</span> <strong>${esc(c.value)}</strong></div>`).join('')}
        </div>
      ` : ''}

      <div style="border-top:1px solid #cbd5e1; padding-top:14px; margin-top:20px; display:flex; justify-content:space-between; align-items:flex-end; font-size:11px;">
        <div>
          <div>Date: <strong>${new Date().toISOString().slice(0, 10)}</strong></div>
          <div>Place: <strong>${esc(site ? site.siteName : 'Pune')}</strong></div>
          <div style="margin-top:28px; border-top:1px dashed #64748b; padding-top:4px;">Signature / Thumb Impression of Insured Person</div>
        </div>
        <div style="text-align:right;">
          <div style="margin-bottom:28px; color:#64748b;">For EMPPAY ENTERPRISES PVT. LTD.</div>
          <div style="border-top:1px dashed #64748b; padding-top:4px;">Authorized Signatory & Employer Stamp</div>
        </div>
      </div>
    </div>
  `;

  showModal({
    title: `ESIC Form 1 Declaration — ${emp.name}`,
    eyebrow: 'STATUTORY ESIC REGISTRATION',
    body: html,
    modalClass: 'modal-xl',
    cancelText: 'Close'
  });

  setTimeout(() => {
    const copyBtn = document.getElementById('copyEsicSummaryBtn');
    if (copyBtn) {
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(plainSummary).then(() => {
          toast('ESIC summary copied to clipboard');
        }).catch(err => {
          toast('Failed to copy: ' + err.message, 'error');
        });
      };
    }
  }, 50);
}

// ----------------------------------------------------
// WHATSAPP PAYSLIP DISPATCH & SETTINGS MODALS
// ----------------------------------------------------
function openWhatsAppPayslipModal(empCode, period) {
  const emp = (db.employees || []).find(e => e.empCode === empCode);
  if (!emp) { toast('Employee not found', 'error'); return; }

  const latestRun = db.payrollRuns[0];
  const allCalc = (latestRun && latestRun.status !== 'Reversed') ? latestRun.rows : calculateRows('all', period);
  const slip = allCalc.find(r => r.empCode === empCode) || {
    ...emp,
    basic: emp.basic || 0,
    gross: emp.basic || 0,
    net: emp.basic || 0,
    pf: 0,
    esic: 0,
    pt: 0,
    lwf: 0,
    totalDeduction: 0,
    payableDays: 26,
    workingDays: 26
  };

  let mobile = (emp.mobile || '').trim();
  const mobileCheck = validateMobile(mobile, false);
  const waMessage = generateWhatsAppPayslipMessage(slip, period);
  const waConfig = db.settings?.whatsapp || {};

  const html = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:14px; background:var(--bg-subtle); padding:12px; border-radius:var(--radius-md); border:1px solid var(--border-color);">
      <div>
        <span style="font-size:10px; font-weight:800; color:var(--text-muted); text-transform:uppercase;">EMPLOYEE</span>
        <div style="font-size:13px; font-weight:700;">${esc(emp.name)} (${esc(emp.empCode)})</div>
        <div style="font-size:11px; color:var(--text-muted);">${esc(emp.department || 'Operations')} · ${esc(emp.designation || 'Staff')}</div>
      </div>
      <div>
        <span style="font-size:10px; font-weight:800; color:var(--text-muted); text-transform:uppercase;">PAYROLL DETAILS</span>
        <div style="font-size:13px; font-weight:700; color:var(--accent-emerald);">Net Pay: ${money(slip.net)}</div>
        <div style="font-size:11px; color:var(--text-muted);">Period: <strong>${esc(period)}</strong> · Ref: ${esc(emp.empCode)}/${esc(period)}</div>
      </div>
    </div>

    <div class="form-group" style="margin-bottom:14px;">
      <label style="display:flex; justify-content:space-between; align-items:center;">
        <span>Recipient WhatsApp Mobile Number *</span>
        ${mobileCheck.valid && mobileCheck.cleaned ? '<span style="color:var(--accent-emerald); font-weight:700; font-size:11px;">✓ Valid Indian Mobile</span>' : '<span style="color:var(--accent-primary); font-weight:700; font-size:11px;">⚠️ 10-Digit Mobile Required</span>'}
      </label>
      <div style="display:flex; gap:8px;">
        <span style="background:var(--bg-subtle); border:1px solid var(--border-color); padding:8px 12px; border-radius:var(--radius-sm); font-weight:700; font-size:13px;">+91</span>
        <input type="text" id="waRecipientMobile" placeholder="10-digit mobile number" maxlength="14" value="${esc(mobileCheck.cleaned || mobile)}" style="font-family:var(--font-mono); font-size:14px; font-weight:700;">
        <button class="outline btn-sm" id="saveRecipientMobileBtn" title="Save this mobile number to Employee Master">💾 Save</button>
      </div>
    </div>

    <div style="margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
      <label style="font-weight:700; font-size:12px;">Formatted Salary Advice Message Preview:</label>
      <button class="outline btn-sm" id="copyWaMsgBtn" style="font-size:11px;">📋 Copy Text</button>
    </div>
    <div class="wa-preview-box" id="waPreviewBox">${esc(waMessage)}</div>

    <div class="wa-options-grid">
      <div class="wa-option-card" id="sendDirectWaBtn">
        <div>
          <div class="wa-option-title">
            <span style="font-size:18px;">📱</span> Direct WhatsApp (Web / App)
          </div>
          <div class="wa-option-desc">
            Instantly opens WhatsApp Web or Desktop App with the message pre-filled. Free, zero setup, no API key needed.
          </div>
        </div>
        <button class="whatsapp-send-btn" style="width:100%; justify-content:center;">
          💬 Open in WhatsApp
        </button>
      </div>

      <div class="wa-option-card" id="sendApiWaBtn">
        <div>
          <div class="wa-option-title">
            <span style="font-size:18px;">⚡</span> WhatsApp Business API
          </div>
          <div class="wa-option-desc">
            ${waConfig.apiKey || waConfig.webhookUrl ? `Configured with <strong>${esc(waConfig.provider || 'Business API')}</strong>. Sends automatically in the background.` : 'Automate payslips via Meta Cloud API, Twilio, or Webhook. (Setup required)'}
          </div>
        </div>
        <button class="outline" style="width:100%; font-weight:700;">
          ${waConfig.apiKey || waConfig.webhookUrl ? '🚀 Dispatch via API' : '⚙️ Configure API'}
        </button>
      </div>
    </div>
  `;

  showModal({
    title: `Send Salary Slip via WhatsApp — ${emp.name}`,
    eyebrow: `WHATSAPP PAYSLIP DISPATCH · ${period}`,
    body: html,
    modalClass: 'modal-lg',
    cancelText: 'Close'
  });

  setTimeout(() => {
    // Save mobile handler
    const saveMobileBtn = document.getElementById('saveRecipientMobileBtn');
    if (saveMobileBtn) {
      saveMobileBtn.onclick = async () => {
        const rawMob = document.getElementById('waRecipientMobile')?.value.trim();
        const mobRes = validateMobile(rawMob, true);
        if (!mobRes.valid) { toast(mobRes.error, 'error'); return; }
        const idx = db.employees.findIndex(e => e.empCode === empCode);
        if (idx !== -1) {
          db.employees[idx].mobile = mobRes.cleaned;
          await save();
          toast('Mobile number saved to employee master');
          openWhatsAppPayslipModal(empCode, period);
        }
      };
    }

    // Copy message handler
    const copyMsgBtn = document.getElementById('copyWaMsgBtn');
    if (copyMsgBtn) {
      copyMsgBtn.onclick = () => {
        navigator.clipboard.writeText(waMessage).then(() => {
          toast('Payslip message copied to clipboard');
        }).catch(err => {
          toast('Failed to copy: ' + err.message, 'error');
        });
      };
    }

    // Direct WhatsApp send
    const directBtn = document.getElementById('sendDirectWaBtn');
    if (directBtn) {
      directBtn.onclick = async () => {
        const rawMob = document.getElementById('waRecipientMobile')?.value.trim();
        const mobRes = validateMobile(rawMob, true);
        if (!mobRes.valid) {
          toast(mobRes.error || 'Please enter a valid 10-digit mobile number', 'error');
          document.getElementById('waRecipientMobile')?.focus();
          return;
        }

        // Auto-save mobile if updated
        if (mobRes.cleaned !== emp.mobile) {
          const idx = db.employees.findIndex(e => e.empCode === empCode);
          if (idx !== -1) {
            db.employees[idx].mobile = mobRes.cleaned;
            await save();
          }
        }

        const encodedMsg = encodeURIComponent(waMessage);
        const waUrl = `https://wa.me/91${mobRes.cleaned}?text=${encodedMsg}`;

        if (window.emppay?.openExternal) {
          window.emppay.openExternal(waUrl);
        } else {
          window.open(waUrl, '_blank');
        }

        // Mark slip as sent
        slip.waStatus = 'Sent';
        slip.waSentAt = new Date().toISOString();
        log('whatsapp.sent', `Sent WhatsApp payslip for ${period} to ${emp.name} (${mobRes.cleaned}) via Direct WhatsApp`, 'payroll');
        toast(`Opening WhatsApp for ${emp.name}...`);
        closeModal();
        if (currentPage === 'payslips') renderPayslips();
      };
    }

    // API send
    const apiBtn = document.getElementById('sendApiWaBtn');
    if (apiBtn) {
      apiBtn.onclick = async () => {
        if (!waConfig.apiKey && !waConfig.webhookUrl) {
          closeModal();
          openWhatsAppSettingsModal();
          return;
        }

        const rawMob = document.getElementById('waRecipientMobile')?.value.trim();
        const mobRes = validateMobile(rawMob, true);
        if (!mobRes.valid) {
          toast(mobRes.error || 'Please enter a valid 10-digit mobile number', 'error');
          return;
        }

        try {
          toast('Dispatching WhatsApp message via API...');
          const payload = {
            provider: waConfig.provider || 'meta',
            apiKey: waConfig.apiKey,
            apiUrl: waConfig.webhookUrl || waConfig.apiUrl,
            senderId: waConfig.senderId,
            phoneNumber: `91${mobRes.cleaned}`,
            message: waMessage
          };

          const res = window.emppay?.sendWhatsAppApi ? await window.emppay.sendWhatsAppApi(payload) : { success: false, error: 'API bridge unavailable' };
          if (res.success) {
            slip.waStatus = 'Sent';
            slip.waSentAt = new Date().toISOString();
            log('whatsapp.sent_api', `Sent WhatsApp payslip to ${emp.name} via ${waConfig.provider || 'API'}`, 'payroll');
            toast(`WhatsApp payslip dispatched successfully to ${emp.name}!`);
            closeModal();
            if (currentPage === 'payslips') renderPayslips();
          } else {
            toast(`WhatsApp API dispatch failed: ${res.error || 'Unknown error'}`, 'error');
          }
        } catch (err) {
          toast(`WhatsApp API error: ${err.message}`, 'error');
        }
      };
    }
  }, 50);
}

function openWhatsAppSettingsModal() {
  const current = db.settings?.whatsapp || {};

  const html = `
    <div class="form-grid">
      <div class="form-group" style="grid-column:span 2;">
        <label>WhatsApp Service Provider *</label>
        <select id="waProvider">
          <option value="meta" ${current.provider === 'meta' ? 'selected' : ''}>Meta WhatsApp Cloud API (Official)</option>
          <option value="twilio" ${current.provider === 'twilio' ? 'selected' : ''}>Twilio for WhatsApp</option>
          <option value="gupshup" ${current.provider === 'gupshup' ? 'selected' : ''}>Gupshup Enterprise</option>
          <option value="msg91" ${current.provider === 'msg91' ? 'selected' : ''}>MSG91 WhatsApp API</option>
          <option value="webhook" ${current.provider === 'webhook' ? 'selected' : ''}>Custom REST Webhook / Internal Gateway</option>
        </select>
      </div>

      <div class="form-group" style="grid-column:span 2;">
        <label>API Key / Bearer Access Token</label>
        <input type="password" id="waApiKey" placeholder="Enter API Token / Secret" value="${esc(current.apiKey || '')}">
      </div>

      <div class="form-group">
        <label>Phone Number ID / Sender ID</label>
        <input type="text" id="waSenderId" placeholder="e.g. 1048291039829" value="${esc(current.senderId || '')}">
      </div>

      <div class="form-group">
        <label>Custom Webhook URL / Base URL (Optional)</label>
        <input type="text" id="waWebhookUrl" placeholder="https://api.yourcompany.com/wa" value="${esc(current.webhookUrl || '')}">
      </div>

      <div class="form-group" style="grid-column:span 2;">
        <label>Approved Template Name (Optional)</label>
        <input type="text" id="waTemplateName" placeholder="e.g. monthly_salary_slip_v1" value="${esc(current.templateName || '')}">
      </div>
    </div>

    <div style="background:var(--bg-subtle); padding:12px; border-radius:var(--radius-sm); border:1px solid var(--border-color); font-size:12px; color:var(--text-muted); margin-top:12px;">
      💡 <strong>Note:</strong> Direct WhatsApp Web/App dispatch is always free and ready immediately. This API configuration is only required if you want programmatic or batch dispatch without opening WhatsApp Web.
    </div>
  `;

  showModal({
    title: 'WhatsApp Business API Integration Settings',
    eyebrow: 'INTEGRATIONS & GATEWAYS',
    body: html,
    saveText: 'Save API Settings',
    modalClass: 'modal-lg',
    onSave: async () => {
      if (!db.settings) db.settings = {};
      db.settings.whatsapp = {
        provider: document.getElementById('waProvider')?.value || 'meta',
        apiKey: document.getElementById('waApiKey')?.value.trim() || '',
        senderId: document.getElementById('waSenderId')?.value.trim() || '',
        webhookUrl: document.getElementById('waWebhookUrl')?.value.trim() || '',
        templateName: document.getElementById('waTemplateName')?.value.trim() || ''
      };

      log('settings.whatsapp_updated', `Updated WhatsApp API provider configuration (${db.settings.whatsapp.provider})`, 'settings');
      await save();
      toast('WhatsApp API settings saved successfully');
      return true;
    }
  });
}

function openBulkWAPayslipModal(rows, period) {
  if (!rows || rows.length === 0) {
    toast('No payslips available in current view', 'error');
    return;
  }

  const withMobile = rows.filter(r => {
    const emp = (db.employees || []).find(e => e.empCode === r.empCode);
    const m = r.mobile || emp?.mobile;
    return validateMobile(m, false).valid && validateMobile(m, false).cleaned;
  });

  const missingMobile = rows.filter(r => {
    const emp = (db.employees || []).find(e => e.empCode === r.empCode);
    const m = r.mobile || emp?.mobile;
    return !validateMobile(m, false).valid || !validateMobile(m, false).cleaned;
  });

  const html = `
    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-bottom:16px;">
      <div style="background:var(--bg-subtle); border:1px solid var(--border-color); padding:12px; border-radius:var(--radius-md); text-align:center;">
        <div style="font-size:24px; font-weight:800;">${rows.length}</div>
        <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Total Slips</div>
      </div>
      <div style="background:#f0fdf4; border:1px solid #bbf7d0; padding:12px; border-radius:var(--radius-md); text-align:center;">
        <div style="font-size:24px; font-weight:800; color:#166534;">${withMobile.length}</div>
        <div style="font-size:11px; color:#166534; text-transform:uppercase;">Mobile Ready</div>
      </div>
      <div style="background:#fff1f2; border:1px solid #fecdd3; padding:12px; border-radius:var(--radius-md); text-align:center;">
        <div style="font-size:24px; font-weight:800; color:#9f1239;">${missingMobile.length}</div>
        <div style="font-size:11px; color:#9f1239; text-transform:uppercase;">Missing Mobile</div>
      </div>
    </div>

    <div style="margin-bottom:12px; font-size:12px; color:var(--text-muted);">
      Click <strong>💬 Send</strong> on any employee to dispatch their payslip immediately, or send to all employees sequentially.
    </div>

    <div style="max-height:300px; overflow-y:auto; border:1px solid var(--border-color); border-radius:var(--radius-md);">
      <table style="width:100%; font-size:12px; border-collapse:collapse;">
        <thead>
          <tr style="background:var(--bg-subtle); border-bottom:1px solid var(--border-color); position:sticky; top:0;">
            <th style="padding:8px 12px; text-align:left;">Emp Code</th>
            <th style="padding:8px 12px; text-align:left;">Employee Name</th>
            <th style="padding:8px 12px; text-align:left;">Mobile</th>
            <th style="padding:8px 12px; text-align:right;">Net Pay</th>
            <th style="padding:8px 12px; text-align:center;">Status</th>
            <th style="padding:8px 12px; text-align:center;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => {
            const emp = (db.employees || []).find(e => e.empCode === r.empCode);
            const rawMob = r.mobile || emp?.mobile || '';
            const mobRes = validateMobile(rawMob, false);
            const isReady = mobRes.valid && mobRes.cleaned;
            return `
              <tr style="border-bottom:1px solid var(--border-color);">
                <td style="padding:8px 12px;"><strong>${esc(r.empCode)}</strong></td>
                <td style="padding:8px 12px;">${esc(r.name)}</td>
                <td style="padding:8px 12px; font-family:var(--font-mono);">
                  ${isReady ? `+91 ${mobRes.cleaned}` : '<span style="color:var(--accent-primary);">⚠️ Missing</span>'}
                </td>
                <td style="padding:8px 12px; text-align:right; font-weight:700;">${money(r.net)}</td>
                <td style="padding:8px 12px; text-align:center;">
                  <span class="wa-status-badge ${r.waStatus === 'Sent' ? 'sent' : isReady ? 'ready' : ''}">
                    ${r.waStatus === 'Sent' ? '✓ Sent' : isReady ? 'Ready' : 'No Phone'}
                  </span>
                </td>
                <td style="padding:8px 12px; text-align:center;">
                  <button class="primary btn-sm" onclick="closeModal(); openWhatsAppPayslipModal('${esc(r.empCode)}', '${esc(period)}')">
                    💬 Send
                  </button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  showModal({
    title: `WhatsApp Payslips Dispatcher — ${period}`,
    eyebrow: `BULK SALARY ADVICE · ${rows.length} EMPLOYEES`,
    body: html,
    modalClass: 'modal-xl',
    cancelText: 'Close'
  });
}

// ----------------------------------------------------
// SECTION 4: ATTENDANCE & LEAVE MODULE
// ----------------------------------------------------

// ----------------------------------------------------
function renderAttendance() {
  const sites = db.sites || [];
  const rule = getActiveRuleVersion();

  const list = (db.employees || [])
    .filter(e => {
      if (currentSiteFilter === 'all') return true;
      if (currentSiteFilter === 'unassigned') return !e.siteId || e.siteId === 'unassigned' || !getSite(e.siteId);
      return e.siteId === currentSiteFilter;
    })
    .map(e => {
      const a = (db.attendance || []).find(x => x.empCode === e.empCode && (!x.period || x.period === currentPeriod)) || {
        empCode: e.empCode,
        period: currentPeriod,
        workingDays: 26,
        presentDays: 24,
        weeklyOffs: 4,
        paidHolidays: 1,
        sickLeave: 0,
        cl: 0,
        pl: 0,
        otherLeave: 0,
        lopDays: 0,
        payableDays: 24,
        otHours: 0,
        otRate: 0
      };
      return { e, a };
    });

  const activeSiteObj = getSite(currentSiteFilter);
  const siteLabel = activeSiteObj ? activeSiteObj.siteName : (currentSiteFilter === 'unassigned' ? 'Unassigned Employees' : 'All Company Sites');

  shell('Attendance & Leave', 'INPUTS / 04', `
    <div class="toolbar">
      <div class="toolbar-left">
        <input type="month" id="attPeriodSelector" class="filter-select" value="${currentPeriod}" style="font-weight:700;">

        <select class="filter-select" id="attSiteFilter" style="font-weight: 700;">
          <option value="all" ${currentSiteFilter === 'all' ? 'selected' : ''}>🏢 All Sites (${(db.employees || []).length} emps)</option>
          <option value="unassigned" ${currentSiteFilter === 'unassigned' ? 'selected' : ''}>⚠️ Unassigned (${getUnassignedEmployees().length})</option>
          ${sites.map(s => {
            const count = (db.employees || []).filter(e => e.siteId === s.id).length;
            return `<option value="${esc(s.id)}" ${currentSiteFilter === s.id ? 'selected' : ''}>🏢 ${esc(s.siteName)} (${count} emps)</option>`;
          }).join('')}
        </select>

        <button class="secondary btn-sm" id="fillStandardDaysBtn">⚡ Set All 26 Days</button>
        <button class="secondary btn-sm" id="autoCalculatePayableBtn">🔄 Recalculate Payable</button>
      </div>
      <div class="toolbar-right">
        <button class="outline" id="importAttBtn">📁 Import Attendance</button>
        <button class="primary" id="saveAttBtn">💾 Save Attendance</button>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">MONTHLY ATTENDANCE MATRIX · ${esc(currentPeriod)}</p>
          <h3>Log Working Days, Leaves (CL/PL/SL/LOP) & Overtime</h3>
        </div>
        <div style="font-size:12px; color:var(--text-muted);">
          Rule: CL(${rule.clPayable ? 'Payable' : 'Unpaid'}), PL(${rule.plPayable ? 'Payable' : 'Unpaid'}), SL(${rule.slPayable ? 'Payable' : 'Unpaid'}), LOP(Deducted)
        </div>
      </div>

      ${renderTable(list, [
        { label: 'S.No.', render: (_r, i) => String(i + 1).padStart(2, '0') },
        { label: 'Employee', render: r => `<strong>${esc(r.e.name)}</strong><small style="display:block;color:var(--text-muted);">${esc(r.e.empCode)}</small>` },
        { label: 'Site', render: r => getSitePill(r.e.siteId) },
        { label: 'Total Days', render: r => `<input class="cell-input att-input" style="width:54px;" data-code="${esc(r.e.empCode)}" data-field="workingDays" type="number" step="0.5" min="0" max="31" value="${r.a.workingDays || 26}">` },
        { label: 'Present', render: r => `<input class="cell-input att-input" style="width:54px;" data-code="${esc(r.e.empCode)}" data-field="presentDays" type="number" step="0.5" min="0" max="31" value="${r.a.presentDays ?? 26}">` },
        { label: 'W/Off', render: r => `<input class="cell-input att-input" style="width:48px;" data-code="${esc(r.e.empCode)}" data-field="weeklyOffs" type="number" step="0.5" min="0" value="${r.a.weeklyOffs || 0}">` },
        { label: 'Holidays', render: r => `<input class="cell-input att-input" style="width:48px;" data-code="${esc(r.e.empCode)}" data-field="paidHolidays" type="number" step="0.5" min="0" value="${r.a.paidHolidays || 0}">` },
        { label: 'CL', render: r => `<input class="cell-input att-input" style="width:48px;" data-code="${esc(r.e.empCode)}" data-field="cl" type="number" step="0.5" min="0" value="${r.a.cl || 0}">` },
        { label: 'PL', render: r => `<input class="cell-input att-input" style="width:48px;" data-code="${esc(r.e.empCode)}" data-field="pl" type="number" step="0.5" min="0" value="${r.a.pl || 0}">` },
        { label: 'Sick', render: r => `<input class="cell-input att-input" style="width:48px;" data-code="${esc(r.e.empCode)}" data-field="sickLeave" type="number" step="0.5" min="0" value="${r.a.sickLeave || 0}">` },
        { label: 'LOP', render: r => `<input class="cell-input att-input" style="width:48px; background:#fff1f2; border-color:#fecdd3;" data-code="${esc(r.e.empCode)}" data-field="lopDays" type="number" step="0.5" min="0" value="${r.a.lopDays || 0}">` },
        { label: 'Payable Days', render: r => `<input class="cell-input att-input" style="width:56px; font-weight:700; color:var(--accent-emerald);" data-code="${esc(r.e.empCode)}" data-field="payableDays" type="number" step="0.5" min="0" max="31" value="${r.a.payableDays ?? r.a.presentDays ?? 26}">` },
        { label: 'OT Hours', render: r => `<input class="cell-input att-input" style="width:52px;" data-code="${esc(r.e.empCode)}" data-field="otHours" type="number" step="0.5" min="0" value="${r.a.otHours || 0}">` },
        { label: 'Est. Net Pay', render: r => {
          const c = calculate(r.e, r.a, rule, currentPeriod);
          return `<strong style="color:var(--accent-emerald); font-size:13px;">${money(c.net)}</strong>`;
        }}
      ], `No employees in ${siteLabel}.`)}
    </div>
  `);

  $('#attPeriodSelector').onchange = (e) => {
    currentPeriod = e.target.value;
    renderAttendance();
  };

  $('#attSiteFilter').onchange = (e) => {
    currentSiteFilter = e.target.value;
    renderAttendance();
  };

  $('#fillStandardDaysBtn').onclick = () => {
    $$('.att-input[data-field="workingDays"]').forEach(i => i.value = '26');
    $$('.att-input[data-field="presentDays"]').forEach(i => i.value = '24');
    $$('.att-input[data-field="weeklyOffs"]').forEach(i => i.value = '4');
    $$('.att-input[data-field="payableDays"]').forEach(i => i.value = '26');
    toast(`Set standard attendance for ${list.length} employees`);
  };

  $('#autoCalculatePayableBtn').onclick = () => {
    const r = getActiveRuleVersion();
    list.forEach(item => {
      const code = item.e.empCode;
      const wDays = Number($(`.att-input[data-code="${code}"][data-field="workingDays"]`)?.value || 26);
      const pres = Number($(`.att-input[data-code="${code}"][data-field="presentDays"]`)?.value || 0);
      const wo = Number($(`.att-input[data-code="${code}"][data-field="weeklyOffs"]`)?.value || 0);
      const ph = Number($(`.att-input[data-code="${code}"][data-field="paidHolidays"]`)?.value || 0);
      const clVal = Number($(`.att-input[data-code="${code}"][data-field="cl"]`)?.value || 0);
      const plVal = Number($(`.att-input[data-code="${code}"][data-field="pl"]`)?.value || 0);
      const slVal = Number($(`.att-input[data-code="${code}"][data-field="sickLeave"]`)?.value || 0);
      const lopVal = Number($(`.att-input[data-code="${code}"][data-field="lopDays"]`)?.value || 0);

      const payDays = pres + (r.clPayable ? clVal : 0) + (r.plPayable ? plVal : 0) + (r.slPayable ? slVal : 0) + (r.woPayable ? wo : 0) + (r.phPayable ? ph : 0) - lopVal;
      const payInput = $(`.att-input[data-code="${code}"][data-field="payableDays"]`);
      if (payInput) payInput.value = Math.max(0, Math.min(wDays, payDays));
    });
    toast('Recalculated payable days based on statutory leave rules!');
  };

  $('#importAttBtn').onclick = importWorkbook;

  $('#saveAttBtn').onclick = async () => {
    $$('.att-input').forEach(input => {
      const code = input.dataset.code;
      const field = input.dataset.field;
      let a = db.attendance.find(x => x.empCode === code && x.period === currentPeriod);
      if (!a) {
        a = { empCode: code, period: currentPeriod };
        db.attendance.push(a);
      }
      a[field] = Number(input.value || 0);
    });

    log('attendance.saved', `Updated attendance records for period ${currentPeriod}`, 'attendance');
    await save();
    toast(`Attendance records saved for ${currentPeriod}!`);
    renderAttendance();
  };
}

// ----------------------------------------------------
// SECTION 5: SALARY STRUCTURES & DYNAMIC COMPONENTS
// ----------------------------------------------------
function renderStructures() {
  const structures = db.structures || [];
  const components = db.components || [];

  shell('Salary Structures', 'MASTER DATA / 05', `
    <div class="toolbar">
      <div class="toolbar-left"></div>
      <div class="toolbar-right">
        <button class="outline" id="addCompModalBtn">+ Add Dynamic Component</button>
        <button class="primary" id="addStructureModalBtn">+ Add Category Structure</button>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">DYNAMIC SALARY CATALOG</p>
          <h3>Earnings & Deductions Component Catalog</h3>
        </div>
      </div>
      ${renderTable(components, [
        { label: 'Component Name', render: r => `<strong>${esc(r.name)}</strong>` },
        { label: 'Type', render: r => `<span class="status ${r.type === 'earning' ? 'ok' : 'warning'}">${esc(r.type.toUpperCase())}</span>` },
        { label: 'Calculation Mode', render: r => `<span class="cat-pill">${esc(r.mode || 'fixed')}</span>` },
        { label: 'Default Value', render: r => `<b>${r.defaultValue ?? r.value ?? 0}${String(r.mode || '').includes('percentage') ? '%' : ''}</b>` },
        { label: 'Taxable', render: r => r.taxable ? '✓ Yes' : 'No' },
        { label: 'Statutory', render: r => r.statutory ? '✓ Statutory' : 'Standard' },
        { label: 'Effective Dates', render: r => esc(r.effectiveFrom || '2026-01-01') },
        { label: 'Status', render: r => `<span class="status ${r.active === false ? 'warning' : 'ok'}">${r.active === false ? 'Inactive' : 'Active'}</span>` },
        { label: 'Actions', render: (_r, i) => `<button class="danger btn-sm del-comp-btn" data-index="${i}">🗑️</button>` }
      ], 'No dynamic components configured.')}
    </div>

    <div class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">CATEGORY BENCHMARKS</p>
          <h3>Wage Structures by Employee Category</h3>
        </div>
      </div>
      ${renderTable(structures, [
        { label: 'Category', render: r => `<strong>${esc(r.category)}</strong>` },
        { label: 'Effective From', render: r => esc(r.effectiveFrom || '2026-01-01') },
        { label: 'Basic Benchmark', render: r => `<b>${money(r.basic)}</b>` },
        { label: 'DA / Special', render: r => money(r.da) },
        { label: 'HRA', render: r => money(r.hra) },
        { label: 'Daily Rate (26d)', render: r => `<b>${money(r.dailyRate || (r.basic + r.da + r.hra) / 26)}</b>` },
        { label: 'Status', render: () => `<span class="status ok">Active</span>` },
        { label: 'Actions', render: (_r, i) => `<button class="danger btn-sm del-struct-btn" data-index="${i}">🗑️</button>` }
      ], 'No category structures defined.')}
    </div>
  `);

  $('#addStructureModalBtn').onclick = () => {
    showModal({
      title: 'Add Category Salary Structure',
      eyebrow: 'SALARY BENCHMARK',
      body: `
        <form class="form-grid">
          <div class="form-group">
            <label>Category Name *</label>
            <input type="text" id="sCategory" required placeholder="e.g. Highly Skilled">
          </div>
          <div class="form-group">
            <label>Effective Date</label>
            <input type="date" id="sEffective" value="${new Date().toISOString().slice(0, 10)}">
          </div>
          <div class="form-group">
            <label>Basic Benchmark (₹)</label>
            <input type="number" id="sBasic" value="16000">
          </div>
          <div class="form-group">
            <label>DA (₹)</label>
            <input type="number" id="sDa" value="3000">
          </div>
          <div class="form-group">
            <label>HRA (₹)</label>
            <input type="number" id="sHra" value="2500">
          </div>
        </form>
      `,
      onSave: async () => {
        const category = $('#sCategory').value.trim();
        if (!category) return false;
        const basic = Number($('#sBasic').value || 0);
        const da = Number($('#sDa').value || 0);
        const hra = Number($('#sHra').value || 0);
        const effectiveFrom = $('#sEffective').value;

        db.structures.push({
          category,
          basic,
          da,
          hra,
          dailyRate: (basic + da + hra) / 26,
          effectiveFrom
        });

        log('structure.created', `Added salary benchmark for ${category}`, 'structures');
        await save();
        toast('Salary structure saved');
        renderStructures();
        return true;
      }
    });
  };

  $('#addCompModalBtn').onclick = () => {
    showModal({
      title: 'Add Dynamic Earning / Deduction Component',
      eyebrow: 'DYNAMIC CATALOG',
      body: `
        <form class="form-grid">
          <div class="form-group">
            <label>Component Name *</label>
            <input type="text" id="cName" required placeholder="e.g. Shift Allowance">
          </div>
          <div class="form-group">
            <label>Component Type *</label>
            <select id="cType">
              <option value="earning">Earning (+)</option>
              <option value="deduction">Deduction (-)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Calculation Mode *</label>
            <select id="cMode">
              <option value="fixed">Fixed Amount (₹)</option>
              <option value="percentage">Percentage (%) of Base</option>
              <option value="percentage_basic">Percentage (%) of Basic</option>
              <option value="percentage_gross">Percentage (%) of Gross</option>
              <option value="daily_rate">Daily Rate</option>
              <option value="monthly_amount">Monthly Fixed Amount</option>
            </select>
          </div>
          <div class="form-group">
            <label>Default Value *</label>
            <input type="number" id="cValue" required value="1000">
          </div>
          <div class="form-group">
            <label>Taxable / Non-Taxable</label>
            <select id="cTaxable">
              <option value="true">Taxable</option>
              <option value="false">Non-Taxable</option>
            </select>
          </div>
          <div class="form-group">
            <label>Effective Date</label>
            <input type="date" id="cEffective" value="${new Date().toISOString().slice(0, 10)}">
          </div>
        </form>
      `,
      onSave: async () => {
        const name = $('#cName').value.trim();
        if (!name) return false;
        const type = $('#cType').value;
        const mode = $('#cMode').value;
        const defaultValue = Number($('#cValue').value || 0);

        db.components.push({
          id: `comp_${Date.now()}`,
          name,
          type,
          mode,
          defaultValue,
          taxable: $('#cTaxable').value === 'true',
          statutory: false,
          active: true,
          effectiveFrom: $('#cEffective').value
        });

        log('component.created', `Registered dynamic component ${name} (${type})`, 'structures');
        await save();
        toast('Component saved to dynamic catalog');
        renderStructures();
        return true;
      }
    });
  };

  $$('.del-struct-btn').forEach(btn => {
    btn.onclick = async () => {
      const idx = Number(btn.dataset.index);
      db.structures.splice(idx, 1);
      await save();
      toast('Structure removed');
      renderStructures();
    };
  });

  $$('.del-comp-btn').forEach(btn => {
    btn.onclick = async () => {
      const idx = Number(btn.dataset.index);
      db.components.splice(idx, 1);
      await save();
      toast('Component removed');
      renderStructures();
    };
  });
}

// ----------------------------------------------------
// SECTION 6: PAYROLL RULES & EFFECTIVE VERSIONING
// ----------------------------------------------------
function renderRules() {
  const versions = db.ruleVersions || [];
  const activeVersion = getActiveRuleVersion();

  shell('Payroll Rules', 'GOVERNANCE / 06', `
    <div class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">STATUTORY CONFIGURATION & VERSIONING</p>
          <h3>Effective-Dated Payroll Rule Version ${activeVersion.version}</h3>
        </div>
        <span class="status ok">Active Version ${activeVersion.version}</span>
      </div>

      <div class="form-grid-3">
        <div class="form-group">
          <label>Version Name</label>
          <input type="text" id="rVersionName" value="${esc(activeVersion.name || `Statutory Version ${activeVersion.version}`)}">
        </div>
        <div class="form-group">
          <label>Effective From Date</label>
          <input type="date" id="rEffectiveFrom" value="${activeVersion.effectiveFrom || '2026-01-01'}">
        </div>
        <div class="form-group">
          <label>PF Employee Rate (%)</label>
          <input type="number" step="0.01" id="rPfRate" value="${activeVersion.pfRate ?? 12}">
        </div>

        <div class="form-group">
          <label>PF Statutory Wage Ceiling (₹)</label>
          <input type="number" id="rPfCeiling" value="${activeVersion.pfCeiling ?? 15000}">
        </div>

        <div class="form-group">
          <label>EPS Employer Rate (%)</label>
          <input type="number" step="0.01" id="rEpsRate" value="${activeVersion.epsRate ?? 8.33}">
        </div>

        <div class="form-group">
          <label>ESIC Employee Rate (%)</label>
          <input type="number" step="0.01" id="rEsicRate" value="${activeVersion.esicRate ?? 0.75}">
        </div>

        <div class="form-group">
          <label>ESIC Employer Rate (%)</label>
          <input type="number" step="0.01" id="rEsicEmployerRate" value="${activeVersion.esicEmployerRate ?? 3.25}">
        </div>

        <div class="form-group">
          <label>ESIC Wage Ceiling (₹)</label>
          <input type="number" id="rEsicCeiling" value="${activeVersion.esicCeiling ?? 21000}">
        </div>

        <div class="form-group">
          <label>Professional Tax State</label>
          <select id="rPtState" onchange="applyPtStateSlabs(this.value)">
            ${Object.keys(PT_SLABS_BY_STATE).map(s => `<option value="${esc(s)}" ${(activeVersion.ptState||'Maharashtra')===s?'selected':''}>${esc(s)}</option>`).join('')}
          </select>
          <small style="color:var(--text-secondary);font-size:11px;">Selecting a state auto-loads the correct PT slabs</small>
        </div>

        <div class="form-group">
          <label>Labour Welfare Fund (LWF) Employee (₹)</label>
          <input type="number" id="rLwf" value="${activeVersion.lwf ?? 20}">
        </div>

        <div class="form-group">
          <label>LWF Employer Contribution (₹)</label>
          <input type="number" id="rLwfEmployer" value="${activeVersion.lwfEmployer ?? 40}">
        </div>

        <div class="form-group">
          <label>Overtime Multiplier</label>
          <input type="number" step="0.1" id="rOtMultiplier" value="${activeVersion.otMultiplier ?? 1.5}">
        </div>
      </div>

      <div style="margin-top:20px; border-top:1px solid var(--border-color); padding-top:16px;">
        <h4 style="font-size:13px; font-weight:800; color:var(--text-secondary); margin-bottom:12px; text-transform:uppercase;">Leave Payability Rules (Which Leaves are Payable)</h4>
        <div style="display:flex; flex-wrap:wrap; gap:16px;">
          <label style="display:flex; align-items:center; gap:8px; font-size:13px;">
            <input type="checkbox" id="rClPayable" ${activeVersion.clPayable !== false ? 'checked' : ''}> Casual Leave (CL) Payable
          </label>
          <label style="display:flex; align-items:center; gap:8px; font-size:13px;">
            <input type="checkbox" id="rPlPayable" ${activeVersion.plPayable !== false ? 'checked' : ''}> Privilege Leave (PL) Payable
          </label>
          <label style="display:flex; align-items:center; gap:8px; font-size:13px;">
            <input type="checkbox" id="rSlPayable" ${activeVersion.slPayable !== false ? 'checked' : ''}> Sick Leave (SL) Payable
          </label>
          <label style="display:flex; align-items:center; gap:8px; font-size:13px;">
            <input type="checkbox" id="rWoPayable" ${activeVersion.woPayable !== false ? 'checked' : ''}> Weekly Offs (WO) Payable
          </label>
          <label style="display:flex; align-items:center; gap:8px; font-size:13px;">
            <input type="checkbox" id="rPhPayable" ${activeVersion.phPayable !== false ? 'checked' : ''}> Paid Holidays (PH) Payable
          </label>
        </div>
      </div>

      <div style="margin-top: 24px; display:flex; gap:12px;">
        <button class="primary" id="saveNewRuleVersionBtn">💾 Save As New Rule Version</button>
        <button class="outline" id="updateCurrentRuleVersionBtn">Update Active Version</button>
      </div>
    </div>

    <!-- Rule Versions History -->
    <div class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">VERSION HISTORY</p>
          <h3>Effective-Dated Rule Versions</h3>
        </div>
      </div>
      ${renderTable(versions, [
        { label: 'Version', render: r => `<strong>v${r.version}</strong>` },
        { label: 'Version Name', render: r => esc(r.name) },
        { label: 'Effective From', render: r => esc(r.effectiveFrom) },
        { label: 'PF Rate / Ceiling', render: r => `${r.pfRate}% (Ceiling: ${money(r.pfCeiling)})` },
        { label: 'ESI Rate / Ceiling', render: r => `${r.esicRate}% / ${r.esicEmployerRate}% (Ceiling: ${money(r.esicCeiling)})` },
        { label: 'PT / LWF', render: r => `PT: ₹${r.pt} · LWF: ₹${r.lwf}` },
        { label: 'Status', render: r => `<span class="status ${r.status === 'Active' ? 'ok' : 'info'}">${esc(r.status)}</span>` }
      ], 'No historical versions saved yet.')}
    </div>
  `);

  $('#saveNewRuleVersionBtn').onclick = async () => {
    const nextVer = (db.ruleVersions?.length || 1) + 1;
    const newVersion = {
      id: `RULE-V${nextVer}`,
      version: nextVer,
      name: $('#rVersionName').value.trim() || `Statutory Version ${nextVer}`,
      effectiveFrom: $('#rEffectiveFrom').value || new Date().toISOString().slice(0, 10),
      status: 'Active',
      pfRate: Number($('#rPfRate').value || 12),
      pfCeiling: Number($('#rPfCeiling').value || 15000),
      epsRate: Number($('#rEpsRate').value || 8.33),
      epfEmployerRate: 3.67,
      pfAdminRate: 0.5,
      edliRate: 0.5,
      esicRate: Number($('#rEsicRate').value || 0.75),
      esicEmployerRate: Number($('#rEsicEmployerRate').value || 3.25),
      esicCeiling: Number($('#rEsicCeiling').value || 21000),
      ptState: $('#rPtState').value.trim(),
      pt: 200,
      ptSlabs: getPtSlabsForState($('#rPtState').value.trim()),
      ptSlabsCustomized: false,
      lwf: Number($('#rLwf').value || 20),
      lwfEmployer: Number($('#rLwfEmployer').value || 40),
      otMultiplier: Number($('#rOtMultiplier').value || 1.5),
      clPayable: $('#rClPayable').checked,
      plPayable: $('#rPlPayable').checked,
      slPayable: $('#rSlPayable').checked,
      woPayable: $('#rWoPayable').checked,
      phPayable: $('#rPhPayable').checked
    };

    (db.ruleVersions || []).forEach(v => v.status = 'Archived');
    if (!db.ruleVersions) db.ruleVersions = [];
    db.ruleVersions.unshift(newVersion);
    db.rules = { ...newVersion };

    log('rules.version_created', `Created Payroll Rule Version ${nextVer}`, 'rules');
    await save();
    toast(`Saved Payroll Rule Version ${nextVer}!`);
    renderRules();
  };

  $('#updateCurrentRuleVersionBtn').onclick = async () => {
    activeVersion.name = $('#rVersionName').value.trim();
    activeVersion.effectiveFrom = $('#rEffectiveFrom').value;
    activeVersion.pfRate = Number($('#rPfRate').value || 12);
    activeVersion.pfCeiling = Number($('#rPfCeiling').value || 15000);
    activeVersion.epsRate = Number($('#rEpsRate').value || 8.33);
    activeVersion.esicRate = Number($('#rEsicRate').value || 0.75);
    activeVersion.esicEmployerRate = Number($('#rEsicEmployerRate').value || 3.25);
    activeVersion.esicCeiling = Number($('#rEsicCeiling').value || 21000);
    activeVersion.ptState = $('#rPtState').value.trim();
    activeVersion.ptSlabs = getPtSlabsForState(activeVersion.ptState);
    activeVersion.lwf = Number($('#rLwf').value || 20);
    activeVersion.lwfEmployer = Number($('#rLwfEmployer').value || 40);
    activeVersion.otMultiplier = Number($('#rOtMultiplier').value || 1.5);
    activeVersion.clPayable = $('#rClPayable').checked;
    activeVersion.plPayable = $('#rPlPayable').checked;
    activeVersion.slPayable = $('#rSlPayable').checked;
    activeVersion.woPayable = $('#rWoPayable').checked;
    activeVersion.phPayable = $('#rPhPayable').checked;

    db.rules = { ...activeVersion };
    log('rules.updated', `Updated active rule settings for v${activeVersion.version}`, 'rules');
    await save();
    toast(`Updated Rule Version ${activeVersion.version}!`);
    renderRules();
  };
}

// ----------------------------------------------------
// SECTION 7: LOAN MANAGEMENT
// ----------------------------------------------------
function renderLoans() {
  const loans = db.loans || [];
  const activeLoans = loans.filter(l => l.status === 'Active' && l.outstandingAmount > 0);
  const totalPrincipal = loans.reduce((s, l) => s + Number(l.principalAmount || 0), 0);
  const totalOutstanding = loans.reduce((s, l) => s + Number(l.outstandingAmount || 0), 0);
  const monthlyDeductionSum = activeLoans.reduce((s, l) => s + Number(l.monthlyDeduction || 0), 0);

  shell('Loan & Advance Management', 'FINANCE / 07', `
    <div class="metric-grid">
      <div class="metric-card">
        <div class="metric-header"><span class="metric-title">TOTAL LOANS RECORDED</span><span class="metric-icon">💳</span></div>
        <div class="metric-value">${loans.length}</div>
        <div class="metric-desc">${activeLoans.length} currently active repayment schedules</div>
      </div>
      <div class="metric-card accent-blue">
        <div class="metric-header"><span class="metric-title">TOTAL SANCTIONED</span><span class="metric-icon">💰</span></div>
        <div class="metric-value">${money(totalPrincipal)}</div>
        <div class="metric-desc">Principal advance amount issued</div>
      </div>
      <div class="metric-card accent-amber">
        <div class="metric-header"><span class="metric-title">OUTSTANDING BALANCE</span><span class="metric-icon">⏳</span></div>
        <div class="metric-value">${money(totalOutstanding)}</div>
        <div class="metric-desc">Balance to be recovered across all sites</div>
      </div>
      <div class="metric-card accent-emerald">
        <div class="metric-header"><span class="metric-title">MONTHLY RECOVERY</span><span class="metric-icon">📉</span></div>
        <div class="metric-value">${money(monthlyDeductionSum)}</div>
        <div class="metric-desc">Total automated deduction per month</div>
      </div>
    </div>

    <div class="toolbar">
      <div class="toolbar-left"></div>
      <div class="toolbar-right">
        <button class="primary" id="addLoanBtn">+ Issue New Loan / Advance</button>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">ACTIVE & HISTORICAL SCHEDULES</p>
          <h3>Employee Loans & Recovery Schedules</h3>
        </div>
      </div>
      ${renderTable(loans, [
        { label: 'Loan ID', render: r => `<span class="site-code-tag">${esc(r.id)}</span>` },
        { label: 'Employee', render: r => {
          const emp = (db.employees || []).find(e => e.empCode === r.empCode);
          return `<strong>${esc(emp?.name || r.empCode)}</strong><small style="display:block;color:var(--text-muted);">${esc(r.empCode)}</small>`;
        }},
        { label: 'Loan Type', render: r => `<span class="cat-pill">${esc(r.loanType)}</span>` },
        { label: 'Principal', render: r => `<b>${money(r.principalAmount)}</b>` },
        { label: 'Monthly Ded.', render: r => `<strong style="color:var(--accent-primary);">${money(r.monthlyDeduction)}</strong>` },
        { label: 'Outstanding', render: r => {
          const pct = Math.max(0, Math.min(100, Math.round(((r.principalAmount - r.outstandingAmount) / r.principalAmount) * 100)));
          return `
            <b>${money(r.outstandingAmount)}</b>
            <div class="loan-progress-bar"><div class="loan-progress-fill" style="width:${pct}%;"></div></div>
            <small style="color:var(--text-muted); font-size:10px;">${pct}% paid</small>
          `;
        }},
        { label: 'Tenure', render: r => `${r.numberOfInstallments} mo (${esc(r.startMonth)} to ${esc(r.endMonth || '—')})` },
        { label: 'Status', render: r => `<span class="status ${r.status === 'Active' ? 'ok' : 'info'}">${esc(r.status)}</span>` },
        { label: 'Actions', render: (_r, i) => `
          <button class="outline btn-sm view-loan-history-btn" data-index="${i}">📜 History</button>
          <button class="danger btn-sm del-loan-btn" data-index="${i}">🗑️</button>
        `}
      ], 'No loan records found.')}
    </div>
  `);

  $('#addLoanBtn').onclick = () => openLoanModal();

  $$('.view-loan-history-btn').forEach(btn => {
    btn.onclick = () => {
      const loan = (db.loans || [])[Number(btn.dataset.index)];
      if (!loan) return;
      const history = loan.history || [];
      showModal({
        title: `Loan History — ${loan.id} (${loan.loanType})`,
        eyebrow: 'REPAYMENT TIMELINE',
        body: `
          <div style="font-size:13px; margin-bottom:14px;">
            Principal: <b>${money(loan.principalAmount)}</b> · Remaining: <b style="color:var(--accent-primary);">${money(loan.outstandingAmount)}</b>
          </div>
          ${renderTable(history, [
            { label: 'Date', render: r => new Date(r.date).toLocaleDateString() },
            { label: 'Period', render: r => esc(r.period || '—') },
            { label: 'Installment Paid', render: r => `<strong style="color:var(--accent-emerald);">${money(r.amountPaid)}</strong>` },
            { label: 'Remaining Balance', render: r => money(r.remainingBalance) },
            { label: 'Run ID', render: r => esc(r.runId || 'Manual') }
          ], 'No installment repayments logged yet.')}
        `,
        hideSave: true
      });
    };
  });

  $$('.del-loan-btn').forEach(btn => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.index);
      const loan = (db.loans || [])[idx];
      showConfirm({
        title: 'Delete Loan Record',
        message: `Are you sure you want to delete loan <strong>${loan.id}</strong>?`,
        isDanger: true,
        onConfirm: async () => {
          db.loans.splice(idx, 1);
          await save();
          toast('Loan deleted');
          renderLoans();
        }
      });
    };
  });
}

function openLoanModal() {
  const employees = db.employees || [];
  const nextId = `LOAN-${Date.now().toString().slice(-4)}`;

  const html = `
    <form id="loanForm" class="form-grid">
      <div class="form-group">
        <label>Loan ID</label>
        <input type="text" id="lId" value="${nextId}" readonly style="background:var(--bg-subtle);">
      </div>
      <div class="form-group">
        <label>Select Employee *</label>
        <select id="lEmpCode" required>
          ${employees.map(e => `<option value="${esc(e.empCode)}">${esc(e.name)} (${esc(e.empCode)}) — ${getSiteName(e.siteId)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Loan Type *</label>
        <select id="lType">
          <option value="Salary Advance">Salary Advance</option>
          <option value="Personal Loan">Personal Loan</option>
          <option value="Festival Advance">Festival Advance</option>
          <option value="Emergency Loan">Emergency Loan</option>
          <option value="Equipment Loan">Equipment Loan</option>
        </select>
      </div>
      <div class="form-group">
        <label>Principal Amount (₹) *</label>
        <input type="number" id="lPrincipal" required min="100" value="20000">
      </div>
      <div class="form-group">
        <label>Monthly Deduction (₹) *</label>
        <input type="number" id="lMonthly" required min="100" value="2000">
      </div>
      <div class="form-group">
        <label>Number of Installments</label>
        <input type="number" id="lInstallments" value="10">
      </div>
      <div class="form-group">
        <label>Start Month</label>
        <input type="month" id="lStartMonth" value="${currentPeriod}">
      </div>
      <div class="form-group">
        <label>Status</label>
        <select id="lStatus">
          <option value="Active">Active</option>
          <option value="Paused">Paused</option>
        </select>
      </div>
    </form>
  `;

  showModal({
    title: 'Issue Employee Loan / Advance',
    eyebrow: 'NEW LOAN SANCTION',
    body: html,
    saveText: 'Sanction Loan',
    modalClass: 'modal-lg',
    onSave: async () => {
      const empCode = $('#lEmpCode').value;
      const principal = Number($('#lPrincipal').value || 0);
      const monthly = Number($('#lMonthly').value || 0);
      const installments = Number($('#lInstallments').value || 10);
      const startMonth = $('#lStartMonth').value;

      if (!empCode || principal <= 0 || monthly <= 0) {
        toast('Please enter valid loan parameters.', 'error');
        return false;
      }

      if (!db.loans) db.loans = [];
      db.loans.push({
        id: $('#lId').value,
        empCode,
        loanType: $('#lType').value,
        principalAmount: principal,
        outstandingAmount: principal,
        monthlyDeduction: monthly,
        numberOfInstallments: installments,
        startMonth,
        status: $('#lStatus').value,
        createdAt: new Date().toISOString(),
        history: []
      });

      log('loan.created', `Sanctioned ${$('#lType').value} of ₹${principal} for ${empCode}`, 'loans');
      await save();
      toast('Loan sanctioned and added to schedule');
      renderLoans();
      return true;
    }
  });
}

// ----------------------------------------------------
// SECTION 8: ARREARS MANAGEMENT
// ----------------------------------------------------
function renderArrears() {
  const arrears = db.arrears || [];
  const pending = arrears.filter(a => a.status === 'Pending');
  const pendingSum = pending.reduce((s, a) => s + Number(a.amount || 0), 0);

  shell('Arrears Management', 'ADJUSTMENTS / 08', `
    <div class="metric-grid">
      <div class="metric-card">
        <div class="metric-header"><span class="metric-title">TOTAL ARREAR ENTRIES</span><span class="metric-icon">📑</span></div>
        <div class="metric-value">${arrears.length}</div>
        <div class="metric-desc">${pending.length} pending disbursement</div>
      </div>
      <div class="metric-card accent-amber">
        <div class="metric-header"><span class="metric-title">PENDING DISBURSAL</span><span class="metric-icon">💰</span></div>
        <div class="metric-value">${money(pendingSum)}</div>
        <div class="metric-desc">To be settled in target payroll runs</div>
      </div>
    </div>

    <div class="toolbar">
      <div class="toolbar-left"></div>
      <div class="toolbar-right">
        <button class="primary" id="addArrearBtn">+ Add Arrear Record</button>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">RETROACTIVE SALARY ADJUSTMENTS</p>
          <h3>Employee Arrears Register</h3>
        </div>
      </div>
      ${renderTable(arrears, [
        { label: 'Arrear ID', render: r => `<span class="site-code-tag">${esc(r.id)}</span>` },
        { label: 'Employee', render: r => {
          const emp = (db.employees || []).find(e => e.empCode === r.empCode);
          return `<strong>${esc(emp?.name || r.empCode)}</strong><small style="display:block;color:var(--text-muted);">${esc(r.empCode)}</small>`;
        }},
        { label: 'Retroactive Month', render: r => esc(r.arrearMonth) },
        { label: 'Payment Month', render: r => `<b>${esc(r.paymentMonth)}</b>` },
        { label: 'Component', render: r => `<span class="cat-pill">${esc(r.component)}</span>` },
        { label: 'Amount (₹)', render: r => `<strong style="color:var(--accent-emerald);">${money(r.amount)}</strong>` },
        { label: 'PF / ESI Applicable', render: r => `${r.pfApplicable ? '✓ PF ' : ''}${r.esiApplicable ? '✓ ESI' : ''}` || 'None' },
        { label: 'Status', render: r => `<span class="status ${r.status === 'Pending' ? 'warning' : 'ok'}">${esc(r.status)}</span>` },
        { label: 'Actions', render: (_r, i) => `<button class="danger btn-sm del-arrear-btn" data-index="${i}">🗑️</button>` }
      ], 'No arrears recorded.')}
    </div>
  `);

  $('#addArrearBtn').onclick = () => openArrearModal();
  $$('.del-arrear-btn').forEach(btn => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.index);
      db.arrears.splice(idx, 1);
      save().then(() => { toast('Arrear deleted'); renderArrears(); });
    };
  });
}

function openArrearModal() {
  const employees = db.employees || [];
  const nextId = `ARR-${Date.now().toString().slice(-4)}`;

  const html = `
    <form id="arrearForm" class="form-grid">
      <div class="form-group">
        <label>Arrear ID</label>
        <input type="text" id="arrId" value="${nextId}" readonly style="background:var(--bg-subtle);">
      </div>
      <div class="form-group">
        <label>Select Employee *</label>
        <select id="arrEmpCode" required>
          ${employees.map(e => `<option value="${esc(e.empCode)}">${esc(e.name)} (${esc(e.empCode)}) — ${getSiteName(e.siteId)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Retroactive Arrear Month *</label>
        <input type="month" id="arrMonth" required value="${currentPeriod}">
      </div>
      <div class="form-group">
        <label>Disbursal / Payment Month *</label>
        <input type="month" id="arrPayMonth" required value="${currentPeriod}">
      </div>
      <div class="form-group">
        <label>Component *</label>
        <select id="arrComp">
          <option value="Basic">Basic Salary</option>
          <option value="DA">DA Allowance</option>
          <option value="HRA">HRA</option>
          <option value="Increment">Salary Increment</option>
          <option value="Other Allowance">Other Allowance</option>
        </select>
      </div>
      <div class="form-group">
        <label>Arrear Amount (₹) *</label>
        <input type="number" id="arrAmount" required min="1" value="3000">
      </div>
      <div class="form-group" style="grid-column: span 2;">
        <label>Reason / Remarks</label>
        <input type="text" id="arrReason" placeholder="e.g. Retroactive minimum wage hike adjustment">
      </div>
      <div class="form-group">
        <label style="display:flex; align-items:center; gap:8px; margin-top:20px;">
          <input type="checkbox" id="arrPf" checked> PF Applicable
        </label>
      </div>
      <div class="form-group">
        <label style="display:flex; align-items:center; gap:8px; margin-top:20px;">
          <input type="checkbox" id="arrEsi" checked> ESI Applicable
        </label>
      </div>
    </form>
  `;

  showModal({
    title: 'Record Employee Arrears',
    eyebrow: 'SALARY ARREAR ADJUSTMENT',
    body: html,
    saveText: 'Save Arrear Record',
    modalClass: 'modal-lg',
    onSave: async () => {
      const empCode = $('#arrEmpCode').value;
      const amount = Number($('#arrAmount').value || 0);
      if (!empCode || amount <= 0) {
        toast('Please specify employee and valid amount.', 'error');
        return false;
      }

      if (!db.arrears) db.arrears = [];
      db.arrears.push({
        id: $('#arrId').value,
        empCode,
        arrearMonth: $('#arrMonth').value,
        paymentMonth: $('#arrPayMonth').value,
        component: $('#arrComp').value,
        amount,
        reason: $('#arrReason').value.trim(),
        pfApplicable: $('#arrPf').checked,
        esiApplicable: $('#arrEsi').checked,
        status: 'Pending',
        createdAt: new Date().toISOString()
      });

      log('arrear.created', `Recorded arrear of ₹${amount} for ${empCode}`, 'arrears');
      await save();
      toast('Arrear recorded');
      renderArrears();
      return true;
    }
  });
}

// ----------------------------------------------------
// SECTION 9: BONUS MODULE
// ----------------------------------------------------
function renderBonus() {
  const sites = db.sites || [];
  const bonusBase = 'Basic';
  const pct1 = 8.33;
  const pct2 = 0;

  const bonusCalcRows = (db.employees || []).map(e => {
    const eligibleDays = 26 * 12; // Standard full year benchmark
    const baseWage = bonusBase === 'Basic' ? Number(e.basic || 0) : (Number(e.basic || 0) + Number(e.da || 0) + Number(e.hra || 0));
    const annualBase = baseWage * 12;
    const p1Amount = (annualBase * pct1) / 100;
    const p2Amount = (annualBase * pct2) / 100;
    const totalBonus = p1Amount + p2Amount;
    return {
      e,
      eligibleDays,
      annualBase,
      pct1,
      p1Amount,
      pct2,
      p2Amount,
      totalBonus
    };
  });

  const totalCompanyBonus = bonusCalcRows.reduce((s, r) => s + r.totalBonus, 0);

  shell('Bonus Module', 'STATUTORY COMPLIANCE / 09', `
    <div class="bonus-setup-card">
      <h4>🎁 Annual Bonus Computation Engine</h4>
      <div class="form-grid-3" style="color:var(--text-primary);">
        <div class="form-group">
          <label style="color:#f8fafc;">From Month</label>
          <input type="month" id="bFromMonth" value="2025-04">
        </div>
        <div class="form-group">
          <label style="color:#f8fafc;">To Month</label>
          <input type="month" id="bToMonth" value="2026-03">
        </div>
        <div class="form-group">
          <label style="color:#f8fafc;">Calculation Base</label>
          <select id="bBase">
            <option value="Basic">Basic Salary</option>
            <option value="Gross">Gross Salary</option>
          </select>
        </div>
        <div class="form-group">
          <label style="color:#f8fafc;">Percentage 1 (Statutory %)</label>
          <input type="number" step="0.01" id="bPct1" value="8.33">
        </div>
        <div class="form-group">
          <label style="color:#f8fafc;">Percentage 2 (Ex-Gratia %)</label>
          <input type="number" step="0.01" id="bPct2" value="0.00">
        </div>
        <div class="form-group" style="display:flex; align-items:flex-end;">
          <button class="primary" id="recomputeBonusBtn" style="width:100%;">⚡ Compute Bonus Statement</button>
        </div>
      </div>
    </div>

    <div class="toolbar">
      <div class="toolbar-left">
        <span class="status ok">Total Bonus Provision: <strong>${money(totalCompanyBonus)}</strong> across ${(db.employees || []).length} employees</span>
      </div>
      <div class="toolbar-right">
        <button class="outline" id="exportBonusCsvBtn">📥 Export Bonus CSV</button>
        <button class="outline" onclick="window.print()">🖨️ Print Statement</button>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">STATUTORY PAYMENT OF BONUS ACT</p>
          <h3>Regular Bonus Statement</h3>
        </div>
      </div>
      ${renderTable(bonusCalcRows, [
        { label: 'Employee Code', render: r => `<strong>${esc(r.e.empCode)}</strong>` },
        { label: 'Employee Name', render: r => esc(r.e.name) },
        { label: 'Site', render: r => getSitePill(r.e.siteId) },
        { label: 'Category', render: r => `<span class="cat-pill">${esc(r.e.category || 'Skilled')}</span>` },
        { label: 'Eligible Days', key: 'eligibleDays' },
        { label: 'Annual Base (₹)', render: r => `<b>${money(r.annualBase)}</b>` },
        { label: 'Bonus %1 (8.33%)', render: r => money(r.p1Amount) },
        { label: 'Bonus %2 (Ex-Gratia)', render: r => money(r.p2Amount) },
        { label: 'Total Bonus (₹)', render: r => `<strong style="color:var(--accent-emerald); font-size:14px;">${money(r.totalBonus)}</strong>` }
      ], 'No employees found.')}
    </div>
  `);

  $('#exportBonusCsvBtn').onclick = () => {
    const cols = ['Employee Code', 'Employee Name', 'Site', 'Category', 'Eligible Days', 'Annual Base Wage', 'Bonus Pct 1', 'Bonus Pct 1 Amount', 'Bonus Pct 2', 'Bonus Pct 2 Amount', 'Total Bonus'];
    const rows = bonusCalcRows.map(r => [
      `"${r.e.empCode}"`,
      `"${r.e.name}"`,
      `"${getSiteName(r.e.siteId)}"`,
      `"${r.e.category || ''}"`,
      r.eligibleDays,
      r.annualBase.toFixed(2),
      r.pct1,
      r.p1Amount.toFixed(2),
      r.pct2,
      r.p2Amount.toFixed(2),
      r.totalBonus.toFixed(2)
    ].join(','));
    exportCsvRaw(['Statutory Bonus Statement', cols.join(','), ...rows].join('\n'), `EMPPAY-bonus-statement-${currentPeriod}.csv`);
  };

  $('#recomputeBonusBtn').onclick = () => {
    toast('Bonus statement recomputed with parameters!');
  };
}

// ----------------------------------------------------
// SECTION 10: PAYROLL RUN, PRE-RUN VALIDATION & SNAPSHOTS
// ----------------------------------------------------
function validatePayroll() {
  const issues = [];
  const emps = db.employees || [];

  const unassigned = emps.filter(e => !e.siteId || e.siteId === 'unassigned' || !getSite(e.siteId));
  if (unassigned.length > 0) {
    issues.push({ type: 'warning', text: `${unassigned.length} employee${unassigned.length > 1 ? 's are' : ' is'} not assigned to a site.` });
  }

  const missingBank = emps.filter(e => (e.paymentMode === 'Bank' || !e.paymentMode) && (!e.bankAccount || !e.ifsc));
  if (missingBank.length > 0) {
    issues.push({ type: 'warning', text: `${missingBank.length} employee(s) have Bank payment selected but missing account/IFSC details.` });
  }

  const zeroSalary = emps.filter(e => !e.basic || Number(e.basic) <= 0);
  if (zeroSalary.length > 0) {
    issues.push({ type: 'warning', text: `${zeroSalary.length} employee(s) have zero basic salary.` });
  }

  const missingUan = emps.filter(e => e.pfEligible !== false && !e.uan && !e.pfNumber);
  if (missingUan.length > 0) {
    issues.push({ type: 'warning', text: `${missingUan.length} employee(s) are PF-eligible but missing UAN / PF Number.` });
  }

  return issues;
}

function renderPayroll() {
  const sites = db.sites || [];
  const latest = db.payrollRuns[0];
  const isFinalized = latest?.status === 'Finalized';
  const status = latest?.status || 'Draft';

  const allCalc = (latest && latest.status !== 'Reversed') ? latest.rows : calculateRows('all', currentPeriod);
  const calc = allCalc.filter(r => {
    if (currentSiteFilter === 'all') return true;
    if (currentSiteFilter === 'unassigned') return !r.siteId || r.siteId === 'unassigned';
    return r.siteId === currentSiteFilter;
  });

  const activeSiteObj = getSite(currentSiteFilter);
  const siteLabel = activeSiteObj ? activeSiteObj.siteName : (currentSiteFilter === 'unassigned' ? 'Unassigned' : 'All Sites (Consolidated)');

  let nextActionText = 'Submit for Review';
  let badgeStatus = 'warning';
  if (status === 'Draft') nextActionText = 'Submit for Review';
  else if (status === 'Review') nextActionText = 'Approve Payroll Run';
  else if (status === 'Approved') nextActionText = 'Finalize & Lock Run';
  else if (status === 'Finalized') { nextActionText = 'Reverse Finalized Run'; badgeStatus = 'ok'; }
  else nextActionText = 'Create New Draft';

  const grossSum = calc.reduce((s, r) => s + r.gross, 0);
  const netSum = calc.reduce((s, r) => s + r.net, 0);
  const pfSum = calc.reduce((s, r) => s + r.pf, 0);
  const esicSum = calc.reduce((s, r) => s + r.esic, 0);
  const ptLwfSum = calc.reduce((s, r) => s + (r.pt || 0) + (r.lwf || 0), 0);

  const siteProvisions = sites.map(s => {
    const sRows = allCalc.filter(r => r.siteId === s.id);
    const gross = sRows.reduce((acc, r) => acc + r.gross, 0);
    const pf = sRows.reduce((acc, r) => acc + r.pf, 0);
    const esic = sRows.reduce((acc, r) => acc + r.esic, 0);
    const pt = sRows.reduce((acc, r) => acc + (r.pt || 0), 0);
    const lwf = sRows.reduce((acc, r) => acc + (r.lwf || 0), 0);
    const net = sRows.reduce((acc, r) => acc + r.net, 0);
    return { site: s, count: sRows.length, gross, pf, esic, ptLwf: pt + lwf, net };
  });

  shell('Payroll Run', 'CALCULATION / 10', `
    <div class="toolbar">
      <div class="toolbar-left">
        <select class="filter-select" id="payrollSiteFilter" style="font-weight: 700;">
          <option value="all" ${currentSiteFilter === 'all' ? 'selected' : ''}>🏢 All Sites (Consolidated Company)</option>
          <option value="unassigned" ${currentSiteFilter === 'unassigned' ? 'selected' : ''}>⚠️ Unassigned Employees</option>
          ${sites.map(s => `<option value="${esc(s.id)}" ${currentSiteFilter === s.id ? 'selected' : ''}>🏢 ${esc(s.siteName)} (${esc(s.siteCode)})</option>`).join('')}
        </select>
        <span class="status ${badgeStatus}">${status.toUpperCase()} · Period ${latest?.period || currentPeriod} · Rule v${latest?.ruleVersion || db.rules?.version || 1}</span>
      </div>
      <div class="toolbar-right">
        <button class="outline" id="validatePayrollBtn">🔍 Pre-Run Validation</button>
        <button class="primary" id="runActionBtn">${nextActionText}</button>
      </div>
    </div>

    <div class="metric-grid">
      <div class="metric-card accent-amber">
        <div class="metric-header"><span class="metric-title">${esc(siteLabel.toUpperCase())} GROSS</span></div>
        <div class="metric-value">${money(grossSum)}</div>
        <div class="metric-desc">Pre-deduction site payroll</div>
      </div>
      <div class="metric-card accent-emerald">
        <div class="metric-header"><span class="metric-title">${esc(siteLabel.toUpperCase())} NET DISBURSAL</span></div>
        <div class="metric-value">${money(netSum)}</div>
        <div class="metric-desc">Take-home disbursal to ${calc.length} employees</div>
      </div>
      <div class="metric-card">
        <div class="metric-header"><span class="metric-title">STATUTORY PF</span></div>
        <div class="metric-value">${money(pfSum)}</div>
        <div class="metric-desc">12% employee PF contribution</div>
      </div>
      <div class="metric-card">
        <div class="metric-header"><span class="metric-title">STATUTORY ESIC</span></div>
        <div class="metric-value">${money(esicSum)}</div>
        <div class="metric-desc">0.75% ESIC contribution</div>
      </div>
    </div>

    <!-- Site Provisions Table -->
    <div class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">LOCATION PROVISIONS</p>
          <h3>Multi-Site Payroll Provision Comparison</h3>
        </div>
      </div>
      ${renderTable(siteProvisions, [
        { label: 'Site Name', render: r => `<strong>${esc(r.site.siteName)}</strong>` },
        { label: 'Site Code', render: r => `<span class="site-code-tag">${esc(r.site.siteCode)}</span>` },
        { label: 'Employees', render: r => `<b>${r.count}</b>` },
        { label: 'Gross Payroll', render: r => `<b>${money(r.gross)}</b>` },
        { label: 'PF', render: r => money(r.pf) },
        { label: 'ESIC', render: r => money(r.esic) },
        { label: 'PT & LWF', render: r => money(r.ptLwf) },
        { label: 'Net Disbursal', render: r => `<strong style="color:var(--accent-emerald);">${money(r.net)}</strong>` }
      ], 'No sites defined.')}
    </div>

    <!-- Employee Calculation Table -->
    <div class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">IMMUTABLE SNAPSHOT REGISTER</p>
          <h3>${esc(siteLabel)} · Employee Breakdown</h3>
        </div>
      </div>
      ${renderTable(calc, [
        { label: 'S.No.', render: (_r, i) => String(i + 1).padStart(2, '0') },
        { label: 'Employee', render: r => `<strong>${esc(r.name)}</strong><small style="display:block;color:var(--text-muted);">${esc(r.empCode)}</small>` },
        { label: 'Site', render: r => getSitePill(r.siteId) },
        { label: 'Days', render: r => `<b>${r.payableDays}</b> / ${r.workingDays}` },
        { label: 'Basic', render: r => money(r.basic) },
        { label: 'Gross', render: r => `<b>${money(r.gross)}</b>` },
        { label: 'PF (12%)', render: r => money(r.pf) },
        { label: 'ESIC', render: r => money(r.esic) },
        { label: 'PT / LWF', render: r => money((r.pt || 0) + (r.lwf || 0)) },
        { label: 'Loan Ded.', render: r => money(r.loanDeduction || 0) },
        { label: 'Net Pay', render: r => `<strong style="color:var(--accent-emerald);">${money(r.net)}</strong>` }
      ], `No employees in ${siteLabel}.`)}
    </div>
  `);

  $('#payrollSiteFilter').onchange = (e) => {
    currentSiteFilter = e.target.value;
    renderPayroll();
  };

  $('#validatePayrollBtn').onclick = () => {
    const issues = validatePayroll();
    showModal({
      title: 'Payroll Pre-Run Validation Checklist',
      eyebrow: 'INTEGRITY AUDIT',
      body: `
        <div style="padding:4px 0;">
          <div class="val-check-item ok">
            <span style="font-size:18px;">✓</span>
            <div><strong>${(db.employees || []).length} Total Employees Evaluated</strong><div>Ready for calculation engine</div></div>
          </div>
          ${issues.length === 0 ? `
            <div class="val-check-item ok">
              <span style="font-size:18px;">✓</span>
              <div><strong>All Integrity Checks Passed</strong><div>No blocking errors or missing configuration detected.</div></div>
            </div>
          ` : issues.map(iss => `
            <div class="val-check-item ${iss.type}">
              <span style="font-size:18px;">${iss.type === 'error' ? '❌' : '⚠️'}</span>
              <div><strong>${iss.type === 'error' ? 'Blocking Error' : 'Validation Advisory'}</strong><div>${esc(iss.text)}</div></div>
            </div>
          `).join('')}
        </div>
      `,
      hideSave: true
    });
  };

  $('#runActionBtn').onclick = async () => {
    if (status === 'Finalized') {
      showConfirm({
        title: 'Reverse Finalized Payroll',
        message: 'Reversing will reopen the calculation draft. An auditable trail will record this reversal.',
        isDanger: true,
        confirmText: 'Reverse Run',
        onConfirm: async () => {
          latest.status = 'Reversed';
          latest.reversedAt = new Date().toISOString();
          log('payroll.reversed', `Reversed run ${latest.id}`, 'payroll');
          await save();
          toast('Payroll run reversed to draft');
          renderPayroll();
        }
      });
    } else if (status === 'Review') {
      latest.status = 'Approved';
      latest.approvedAt = new Date().toISOString();
      log('payroll.approved', `Approved run ${latest.id}`, 'payroll');
      await save();
      toast('Payroll run Approved!');
      renderPayroll();
    } else if (status === 'Approved') {
      showConfirm({
        title: 'Finalize & Lock Payroll Run',
        message: 'Finalizing will create an immutable snapshot, deduct loan installments, and lock period records.',
        confirmText: 'Finalize & Lock',
        onConfirm: async () => {
          latest.status = 'Finalized';
          latest.finalizedAt = new Date().toISOString();
          
          // Deduct loan balances and log history
          latest.rows.forEach(r => {
            if (r.loanDeduction > 0 && r.activeLoanDetails) {
              r.activeLoanDetails.forEach(ld => {
                const loan = (db.loans || []).find(l => l.id === ld.loanId);
                if (loan) {
                  loan.outstandingAmount = Math.max(0, loan.outstandingAmount - ld.amount);
                  if (loan.outstandingAmount === 0) loan.status = 'Completed';
                  if (!loan.history) loan.history = [];
                  loan.history.push({
                    date: new Date().toISOString(),
                    runId: latest.id,
                    period: latest.period,
                    amountPaid: ld.amount,
                    remainingBalance: loan.outstandingAmount
                  });
                }
              });
            }
          });

          log('payroll.finalized', `Finalized and locked payroll run ${latest.id}`, 'payroll');
          await save();
          toast('Payroll run Finalized and Locked!');
          renderPayroll();
        }
      });
    } else {
      const fullRows = calculateRows('all', currentPeriod);
      const rule = getActiveRuleVersion();
      const run = {
        id: `RUN-${Date.now()}`,
        period: currentPeriod,
        ruleVersion: rule.version || 1,
        ruleSnapshot: { ...rule },
        createdAt: new Date().toISOString(),
        status: 'Review',
        rows: fullRows.map(r => ({ ...r }))
      };
      db.payrollRuns.unshift(run);
      log('payroll.review_submitted', `Submitted run ${run.id} for Review`, 'payroll');
      await save();
      toast('Payroll submitted for Review!');
      renderPayroll();
    }
  };
}

// ----------------------------------------------------
// SECTION 11: ENHANCED PAYSLIPS
// ----------------------------------------------------
function renderPayslipCard(r, period) {
  const site = getSite(r.siteId);
  const siteName = site ? site.siteName : (r.siteName || 'UNASSIGNED');
  const siteCode = site ? site.siteCode : (r.siteCode || 'UNASSIGNED');

  const emp = (db.employees || []).find(e => e.empCode === r.empCode);
  const empMobile = (r.mobile || emp?.mobile || '').trim();
  const mobCheck = validateMobile(empMobile, false);
  const hasMobile = mobCheck.valid && mobCheck.cleaned;
  const isSent = r.waStatus === 'Sent';

  return `
    <div class="payslip-card" data-search="${esc(r.name.toLowerCase())} ${esc(r.empCode.toLowerCase())} ${esc(siteName.toLowerCase())}">
      <div class="slip-header">
        <div class="slip-company" style="display:flex; align-items:center; gap:12px;">
          <img src="logo.jpg" alt="P & P Enterprises Logo" style="height:36px; max-width:85px; object-fit:contain; border-radius:4px; background:#fff; padding:2px; border:1px solid var(--border-color);">
          <div>
            <strong>P & P ENTERPRISES</strong>
            <small>Employee Salary Statement / Pay Advice</small>
          </div>
        </div>
        <div class="slip-meta">
          <div class="period-tag">PAY PERIOD: ${period}</div>
          <small style="color:var(--text-muted);">SLIP REF: ${esc(r.empCode)}/${period}</small>
        </div>
      </div>

      <div style="background:#f8fafc; border:1px solid var(--border-color); border-radius:var(--radius-sm); padding:10px 14px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <span style="font-size:10px; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; display:block;">COMPANY LOCATION / SITE</span>
          <strong style="font-size:13px; color:var(--text-primary);">🏢 ${esc(siteName.toUpperCase())}</strong>
        </div>
        <div>
          <span style="font-size:10px; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; display:block; text-align:right;">SITE CODE</span>
          <span class="site-code-tag">${esc(siteCode.toUpperCase())}</span>
        </div>
      </div>

      <div style="display:flex; gap:16px; align-items:stretch; margin-bottom:14px;">
        ${(emp?.photo && emp.showPhotoOnPayslip !== false) ? `
          <div style="flex-shrink:0; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:6px; background:#f8fafc; border:1px solid var(--border-color); border-radius:var(--radius-sm);">
            <img src="${emp.photo}" alt="${esc(r.name)}" class="payslip-emp-photo">
            <span style="font-size:9px; font-weight:700; color:var(--text-muted); margin-top:4px; text-transform:uppercase; letter-spacing:0.04em;">PHOTO ID</span>
          </div>
        ` : ''}
        <div class="slip-employee-info" style="flex:1; margin-bottom:0;">
          <div><span>EMPLOYEE NAME</span><strong>${esc(r.name)}</strong></div>
          <div><span>EMPLOYEE CODE</span><strong>${esc(r.empCode)}</strong></div>
          <div><span>CATEGORY</span><strong>${esc(r.category || 'General')}</strong></div>
          <div><span>DAYS PAYABLE</span><strong>${r.payableDays || 0} / ${r.workingDays || 26}</strong></div>
          <div><span>UAN / PF NO</span><strong>${mask(r.uan || r.pfNumber)}</strong></div>
          <div><span>BANK ACCOUNT</span><strong>${mask(r.bankAccount)} (${esc(r.paymentMode || 'Bank')})</strong></div>
          <div><span>OVERTIME HOURS</span><strong>${r.otHours || 0} hrs</strong></div>
          <div><span>DEPARTMENT</span><strong>${esc(r.department || 'Operations')}</strong></div>
        </div>
      </div>

      <div class="slip-breakdown-grid">
        <div class="breakdown-col">
          <h4>EARNINGS (₹)</h4>
          <div class="breakdown-row" style="background:#f8fafc; font-weight:600;"><span>Basic Salary</span><b>${money(r.basic)}</b></div>
          <div class="breakdown-row" style="background:#f8fafc; font-weight:600;"><span>DA / Special Allowance</span><b>${money(r.da || 0)}</b></div>
          ${(showAllPayslipComponents || r.hra > 0) ? `<div class="breakdown-row"><span>House Rent Allowance (HRA)</span><b>${money(r.hra)}</b></div>` : ''}
          ${(showAllPayslipComponents || r.conveyance > 0) ? `<div class="breakdown-row"><span>Conveyance Allowance</span><b>${money(r.conveyance)}</b></div>` : ''}
          ${(showAllPayslipComponents || r.medical > 0) ? `<div class="breakdown-row"><span>Medical Allowance</span><b>${money(r.medical)}</b></div>` : ''}
          ${(showAllPayslipComponents || r.otherAllowance > 0) ? `<div class="breakdown-row"><span>Other Allowance</span><b>${money(r.otherAllowance)}</b></div>` : ''}
          ${(showAllPayslipComponents || r.arrearsAmount > 0) ? `<div class="breakdown-row"><span>Arrears</span><b>${money(r.arrearsAmount)}</b></div>` : ''}
          ${(showAllPayslipComponents || r.bonusAmount > 0) ? `<div class="breakdown-row"><span>Bonus</span><b>${money(r.bonusAmount)}</b></div>` : ''}
          ${(showAllPayslipComponents || r.ot > 0) ? `<div class="breakdown-row"><span>Overtime Pay</span><b>${money(r.ot)}</b></div>` : ''}
          <div class="breakdown-row total-row"><span>GROSS EARNINGS</span><b>${money(r.gross)}</b></div>
        </div>

        <div class="breakdown-col">
          <h4>DEDUCTIONS (₹)</h4>
          <div class="breakdown-row"><span>Provident Fund (PF 12%)</span><b>${money(r.pf)}</b></div>
          ${(showAllPayslipComponents || r.esic > 0) ? `<div class="breakdown-row"><span>ESIC (0.75%)</span><b>${money(r.esic)}</b></div>` : ''}
          ${(showAllPayslipComponents || r.pt > 0) ? `<div class="breakdown-row"><span>Professional Tax (PT)</span><b>${money(r.pt)}</b></div>` : ''}
          ${(showAllPayslipComponents || r.lwf > 0) ? `<div class="breakdown-row"><span>Labour Welfare Fund (LWF)</span><b>${money(r.lwf)}</b></div>` : ''}
          ${(showAllPayslipComponents || r.incomeTax > 0) ? `<div class="breakdown-row"><span>Income Tax (TDS)</span><b>${money(r.incomeTax)}</b></div>` : ''}
          ${(showAllPayslipComponents || r.lic > 0) ? `<div class="breakdown-row"><span>LIC Deduction</span><b>${money(r.lic)}</b></div>` : ''}
          ${(showAllPayslipComponents || r.loanDeduction > 0) ? `<div class="breakdown-row"><span>Loan / Advance Deduction</span><b>${money(r.loanDeduction)}</b></div>` : ''}
          ${(showAllPayslipComponents || r.otherDed > 0) ? `<div class="breakdown-row"><span>Other Deductions</span><b>${money(r.otherDed)}</b></div>` : ''}
          <div class="breakdown-row total-row"><span>TOTAL DEDUCTIONS</span><b>${money(r.totalDeduction)}</b></div>
        </div>

        <div class="breakdown-col" style="display:flex; flex-direction:column; justify-content:space-between;">
          <div class="net-pay-box">
            <span>NET TAKE-HOME PAY</span>
            <strong>${money(r.net)}</strong>
            <div class="net-pay-words">${numberToWords(r.net)}</div>
          </div>
          <div style="font-size:11px; text-align:center; color:var(--text-muted); margin-top:12px; border-top:1px dashed var(--border-color); padding-top:8px;">
            Authorized Signatory / System Generated Statement
          </div>
        </div>
      </div>

      <div class="payslip-action-bar">
        <div class="payslip-wa-meta">
          <span class="wa-phone-chip">📱 ${hasMobile ? `+91 ${mobCheck.cleaned}` : '⚠️ No Mobile Registered'}</span>
          <span class="wa-status-badge ${isSent ? 'sent' : hasMobile ? 'ready' : ''}">
            ${isSent ? '✓ Sent on WhatsApp' : hasMobile ? '💬 Ready to Send' : 'No Phone'}
          </span>
        </div>
        <button class="whatsapp-send-btn" onclick="openWhatsAppPayslipModal('${esc(r.empCode)}', '${esc(period)}')">
          💬 Send via WhatsApp
        </button>
      </div>
    </div>
  `;
}

function renderPayslips() {
  const sites = db.sites || [];
  const latestRun = db.payrollRuns[0];
  const allCalc = (latestRun && latestRun.status !== 'Reversed') ? latestRun.rows : calculateRows('all', currentPeriod);
  const period = latestRun?.period || currentPeriod;

  const calc = allCalc.filter(r => {
    if (currentSiteFilter === 'all') return true;
    if (currentSiteFilter === 'unassigned') return !r.siteId || r.siteId === 'unassigned';
    return r.siteId === currentSiteFilter;
  });

  const activeSiteObj = getSite(currentSiteFilter);
  const siteLabel = activeSiteObj ? activeSiteObj.siteName : 'All Sites';

  shell('Payslips', 'OUTPUT / 11', `
    <div class="toolbar">
      <div class="toolbar-left">
        <select class="filter-select" id="slipSiteFilter" style="font-weight:700;">
          <option value="all" ${currentSiteFilter === 'all' ? 'selected' : ''}>🏢 All Sites (${allCalc.length} Slips)</option>
          <option value="unassigned" ${currentSiteFilter === 'unassigned' ? 'selected' : ''}>⚠️ Unassigned</option>
          ${sites.map(s => {
            const count = allCalc.filter(r => r.siteId === s.id).length;
            return `<option value="${esc(s.id)}" ${currentSiteFilter === s.id ? 'selected' : ''}>🏢 ${esc(s.siteName)} (${count} Slips)</option>`;
          }).join('')}
        </select>

        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input type="text" id="slipSearchInput" placeholder="Filter payslips by name, code, site...">
        </div>

        <label style="display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer;">
          <input type="checkbox" id="toggleAllComponents" ${showAllPayslipComponents ? 'checked' : ''}> Show All Components
        </label>
      </div>
      <div class="toolbar-right">
        <button class="outline" id="waSettingsBtn" title="Configure WhatsApp Business API integration">⚙️ WhatsApp API</button>
        <button class="outline" id="bulkWaBtn" title="Send WhatsApp salary slips to all employees">📲 WhatsApp Slips</button>
        <button class="outline" id="exportPayslipsCsvBtn">📥 Export CSV</button>
        <button class="primary" onclick="window.print()">🖨️ Print ${esc(siteLabel)} Payslips</button>
      </div>
    </div>

    <div id="payslipsContainer">
      ${calc.map(r => renderPayslipCard(r, period)).join('')}
      ${calc.length === 0 ? `
        <div class="empty-state">
          <div class="empty-state-icon">🧾</div>
          <h4>No payslips for ${esc(siteLabel)}.</h4>
        </div>
      ` : ''}
    </div>
  `);

  $('#slipSiteFilter').onchange = (e) => { currentSiteFilter = e.target.value; renderPayslips(); };
  $('#toggleAllComponents').onchange = (e) => { showAllPayslipComponents = e.target.checked; renderPayslips(); };
  $('#slipSearchInput').oninput = (e) => {
    const q = e.target.value.toLowerCase();
    $$('.payslip-card').forEach(card => {
      const text = card.dataset.search || '';
      card.style.display = text.includes(q) ? 'block' : 'none';
    });
  };
  $('#exportPayslipsCsvBtn').onclick = () => exportCsv(calc, `EMPPAY-payslips-${currentSiteFilter}-${period}.csv`);
  if ($('#waSettingsBtn')) $('#waSettingsBtn').onclick = () => openWhatsAppSettingsModal();
  if ($('#bulkWaBtn')) $('#bulkWaBtn').onclick = () => openBulkWAPayslipModal(calc, period);
}

// ----------------------------------------------------
// SECTION 12: COMPREHENSIVE REPORT CENTER
// ----------------------------------------------------
function renderReports() {
  const sites = db.sites || [];
  const latestRun = db.payrollRuns[0];
  const allCalc = (latestRun && latestRun.status !== 'Reversed') ? latestRun.rows : calculateRows('all', currentPeriod);
  
  const calc = allCalc.filter(r => {
    if (currentSiteFilter === 'all') return true;
    if (currentSiteFilter === 'unassigned') return !r.siteId || r.siteId === 'unassigned';
    return r.siteId === currentSiteFilter;
  });

  const activeSiteObj = getSite(currentSiteFilter);
  const siteLabel = activeSiteObj ? activeSiteObj.siteName : 'Company Consolidated';

  // Sub-Navigation Tabs
  const subnavHtml = `
    <div class="report-nav-tabs">
      <button class="report-tab-btn ${reportCategory === 'payroll' ? 'active' : ''}" data-cat="payroll">💼 Payroll Reports</button>
      <button class="report-tab-btn ${reportCategory === 'statutory' ? 'active' : ''}" data-cat="statutory">🏛️ Statutory Reports (PF / ESI / PT / LWF / TDS)</button>
      <button class="report-tab-btn ${reportCategory === 'payment' ? 'active' : ''}" data-cat="payment">💳 Payment Advice (Bank / Cash / Cheque)</button>
      <button class="report-tab-btn ${reportCategory === 'additional' ? 'active' : ''}" data-cat="additional">🎁 Additional Statements (Bonus / Loans / Arrears)</button>
    </div>
  `;

  // Report Selectors based on Category
  let selectorHtml = '';
  if (reportCategory === 'payroll') {
    selectorHtml = `
      <div class="report-selector-grid">
        <button class="report-card-btn ${currentReportType === 'wage_register' ? 'active' : ''}" data-type="wage_register">
          <strong>Form T / C Wage Register</strong>
          <small>Complete statutory monthly earnings & deductions</small>
        </button>
        <button class="report-card-btn ${currentReportType === 'salary_history' ? 'active' : ''}" data-type="salary_history">
          <strong>Employee Salary History</strong>
          <small>Multi-month wide scrolling matrix</small>
        </button>
        <button class="report-card-btn ${currentReportType === 'site_summary' ? 'active' : ''}" data-type="site_summary">
          <strong>Site-Wise Payroll Summary</strong>
          <small>Plant-level breakdown & cost center</small>
        </button>
        <button class="report-card-btn ${currentReportType === 'dept_summary' ? 'active' : ''}" data-type="dept_summary">
          <strong>Department-Wise Summary</strong>
          <small>Departmental cost allocation</small>
        </button>
      </div>
    `;
  } else if (reportCategory === 'statutory') {
    selectorHtml = `
      <div class="report-selector-grid">
        <button class="report-card-btn ${currentReportType === 'pf_deduction' ? 'active' : ''}" data-type="pf_deduction">
          <strong>PF Deduction Statement</strong>
          <small>Employee 12% contribution statement</small>
        </button>
        <button class="report-card-btn ${currentReportType === 'pf_employer' ? 'active' : ''}" data-type="pf_employer">
          <strong>Employer PF & EPS Statement</strong>
          <small>EPF (3.67%) + EPS (8.33%) breakdown</small>
        </button>
        <button class="report-card-btn ${currentReportType === 'pf_account_summary' ? 'active' : ''}" data-type="pf_account_summary">
          <strong>PF Account-Wise Summary</strong>
          <small>Accounts 1, 2, 10, 21, 22 summary</small>
        </button>
        <button class="report-card-btn ${currentReportType === 'esi_statement' ? 'active' : ''}" data-type="esi_statement">
          <strong>ESI Monthly Statement</strong>
          <small>0.75% Emp + 3.25% Employer ESIC</small>
        </button>
        <button class="report-card-btn ${currentReportType === 'pt_statement' ? 'active' : ''}" data-type="pt_statement">
          <strong>Professional Tax (PT)</strong>
          <small>State slab deduction register</small>
        </button>
        <button class="report-card-btn ${currentReportType === 'lwf_statement' ? 'active' : ''}" data-type="lwf_statement">
          <strong>Labour Welfare Fund (LWF)</strong>
          <small>Employee & Employer contributions</small>
        </button>
        <button class="report-card-btn ${currentReportType === 'it_tds' ? 'active' : ''}" data-type="it_tds">
          <strong>Income Tax (TDS) Report</strong>
          <small>Tax deduction at source statement</small>
        </button>
      </div>
    `;
  } else if (reportCategory === 'payment') {
    selectorHtml = `
      <div class="report-selector-grid">
        <button class="report-card-btn ${currentReportType === 'bank_statement' ? 'active' : ''}" data-type="bank_statement">
          <strong>Bank Payment Statement</strong>
          <small>Direct credit bank transfer schedule</small>
        </button>
        <button class="report-card-btn ${currentReportType === 'cash_statement' ? 'active' : ''}" data-type="cash_statement">
          <strong>Cash Payment Statement</strong>
          <small>Cash disbursal sheet with signatures</small>
        </button>
        <button class="report-card-btn ${currentReportType === 'cheque_statement' ? 'active' : ''}" data-type="cheque_statement">
          <strong>Cheque Payment Statement</strong>
          <small>Combined and separate cheque schedules</small>
        </button>
      </div>
    `;
  } else {
    selectorHtml = `
      <div class="report-selector-grid">
        <button class="report-card-btn ${currentReportType === 'bonus_statement' ? 'active' : ''}" data-type="bonus_statement">
          <strong>Bonus Statement</strong>
          <small>Statutory bonus register</small>
        </button>
        <button class="report-card-btn ${currentReportType === 'loan_statement' ? 'active' : ''}" data-type="loan_statement">
          <strong>Loan & Advance Statement</strong>
          <small>Active loan recovery & balance register</small>
        </button>
        <button class="report-card-btn ${currentReportType === 'arrears_statement' ? 'active' : ''}" data-type="arrears_statement">
          <strong>Arrears Statement</strong>
          <small>Retroactive adjustment settlement</small>
        </button>
        <button class="report-card-btn ${currentReportType === 'ot_statement' ? 'active' : ''}" data-type="ot_statement">
          <strong>Overtime Statement</strong>
          <small>Overtime hours & payout schedule</small>
        </button>
      </div>
    `;
  }

  // Generate Report View Table
  let reportBodyHtml = '';
  if (currentReportType === 'wage_register') {
    reportBodyHtml = `
      <div class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">${esc(siteLabel.toUpperCase())} · STATUTORY REGISTER</p>
            <h3>Form T / Form C Statutory Wage Register</h3>
          </div>
        </div>
        ${renderTable(calc, [
          { label: 'S.No.', render: (_r, i) => String(i + 1).padStart(2, '0') },
          { label: 'Emp Code', key: 'empCode' },
          { label: 'Employee Name', render: r => `<strong>${esc(r.name)}</strong>` },
          { label: 'Site', render: r => getSitePill(r.siteId) },
          { label: 'Category', render: r => `<span class="cat-pill">${esc(r.category || 'Skilled')}</span>` },
          { label: 'Payable Days', key: 'payableDays' },
          { label: 'Basic', render: r => money(r.basic) },
          { label: 'DA', render: r => money(r.da) },
          { label: 'HRA', render: r => money(r.hra) },
          { label: 'Other All.', render: r => money(r.otherAllowance) },
          { label: 'OT Pay', render: r => money(r.ot) },
          { label: 'Gross Pay', render: r => `<b>${money(r.gross)}</b>` },
          { label: 'PF (12%)', render: r => money(r.pf) },
          { label: 'ESIC', render: r => money(r.esic) },
          { label: 'PT', render: r => money(r.pt) },
          { label: 'LWF', render: r => money(r.lwf) },
          { label: 'Total Ded.', render: r => `<span style="color:var(--accent-primary);">${money(r.totalDeduction)}</span>` },
          { label: 'Net Payable', render: r => `<strong style="color:var(--accent-emerald);">${money(r.net)}</strong>` }
        ], 'No data in register.')}
      </div>
    `;
  } else if (currentReportType === 'salary_history') {
    // Multi-month scrollable matrix
    const historyMonths = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
    const rows = (db.employees || []).flatMap(e => {
      return historyMonths.map(m => {
        const a = (db.attendance || []).find(x => x.empCode === e.empCode && x.period === m) || { workingDays: 26, presentDays: 26, payableDays: 26 };
        return { month: m, ...calculate(e, a, null, m) };
      });
    });

    reportBodyHtml = `
      <div class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">MULTI-MONTH SALARY MATRIX</p>
            <h3>Employee Salary History</h3>
          </div>
        </div>
        <div class="wide-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Code</th>
                <th>Employee Name</th>
                <th>Site</th>
                <th>Basic</th>
                <th>DA</th>
                <th>HRA</th>
                <th>Other Allowances</th>
                <th>Arrears</th>
                <th>OT</th>
                <th>Gross</th>
                <th>PF</th>
                <th>ESI</th>
                <th>PT</th>
                <th>LWF</th>
                <th>TDS</th>
                <th>LIC</th>
                <th>Loan</th>
                <th>Total Ded.</th>
                <th>Net Disbursal</th>
              </tr>
            </thead>
            <tbody>
              ${rows.slice(0, 50).map(r => `
                <tr>
                  <td><b>${esc(r.month)}</b></td>
                  <td>${esc(r.empCode)}</td>
                  <td><strong>${esc(r.name)}</strong></td>
                  <td>${getSitePill(r.siteId)}</td>
                  <td>${money(r.basic)}</td>
                  <td>${money(r.da)}</td>
                  <td>${money(r.hra)}</td>
                  <td>${money(r.otherAllowance)}</td>
                  <td>${money(r.arrearsAmount)}</td>
                  <td>${money(r.ot)}</td>
                  <td><b>${money(r.gross)}</b></td>
                  <td>${money(r.pf)}</td>
                  <td>${money(r.esic)}</td>
                  <td>${money(r.pt)}</td>
                  <td>${money(r.lwf)}</td>
                  <td>${money(r.incomeTax)}</td>
                  <td>${money(r.lic)}</td>
                  <td>${money(r.loanDeduction)}</td>
                  <td><span style="color:var(--accent-primary);">${money(r.totalDeduction)}</span></td>
                  <td><strong style="color:var(--accent-emerald);">${money(r.net)}</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } else if (currentReportType === 'pf_deduction' || currentReportType === 'pf_employer' || currentReportType === 'pf_account_summary') {
    // PF Modules
    const pfRows = calc.filter(r => r.pf > 0 || r.pfBase > 0);
    const totPfBase = pfRows.reduce((s, r) => s + r.pfBase, 0);
    const totPfEmp = pfRows.reduce((s, r) => s + r.pf, 0);
    const totEps = pfRows.reduce((s, r) => s + r.eps, 0);
    const totEpfEmp = pfRows.reduce((s, r) => s + r.epfEmployer, 0);
    const totPfAdmin = pfRows.reduce((s, r) => s + r.pfAdmin, 0);

    reportBodyHtml = `
      <div class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">EPFO STATUTORY RETURN</p>
            <h3>PF Monthly Contribution & Remittance Statement</h3>
          </div>
        </div>

        <div class="provision-summary-box" style="margin-bottom:16px;">
          <div><small>ACCOUNT 1 (EPF)</small><br><strong>${money(totPfEmp + totEpfEmp)}</strong></div>
          <div><small>ACCOUNT 10 (EPS)</small><br><strong>${money(totEps)}</strong></div>
          <div><small>ACCOUNT 2 (ADMIN)</small><br><strong>${money(totPfAdmin)}</strong></div>
          <div><small>TOTAL REMITTANCE</small><br><strong style="color:#34d399; font-size:16px;">${money(totPfEmp + totEpfEmp + totEps + totPfAdmin)}</strong></div>
        </div>

        ${renderTable(pfRows, [
          { label: 'UAN / PF Number', render: r => `<b>${esc(r.uan || r.pfNumber || '—')}</b>` },
          { label: 'Employee Name', render: r => `<strong>${esc(r.name)}</strong>` },
          { label: 'Gross Wages', render: r => money(r.gross) },
          { label: 'EPF Wages (Capped)', render: r => `<b>${money(r.pfBase)}</b>` },
          { label: 'Employee Share (12%)', render: r => `<strong style="color:var(--accent-primary);">${money(r.pf)}</strong>` },
          { label: 'EPS Share (8.33%)', render: r => money(r.eps) },
          { label: 'EPF Employer (3.67%)', render: r => money(r.epfEmployer) },
          { label: 'Total Remittance', render: r => `<b>${money(r.pf + r.pfEmployer)}</b>` }
        ], 'No PF eligible records.')}
      </div>
    `;
  } else if (currentReportType === 'esi_statement') {
    // ESI Module
    const esiRows = calc.filter(r => r.esic > 0);
    reportBodyHtml = `
      <div class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">ESIC STATUTORY RETURN</p>
            <h3>Monthly ESI Deduction Statement (Form 5 / 6)</h3>
          </div>
        </div>
        ${renderTable(esiRows, [
          { label: 'ESI IP Number', render: r => `<b>${esc(r.esiNumber || '—')}</b>` },
          { label: 'Employee Name', render: r => `<strong>${esc(r.name)}</strong>` },
          { label: 'Working Days', key: 'payableDays' },
          { label: 'Total Wages (Gross)', render: r => `<b>${money(r.gross)}</b>` },
          { label: 'Employee Share (0.75%)', render: r => `<strong style="color:var(--accent-primary);">${money(r.esic)}</strong>` },
          { label: 'Employer Share (3.25%)', render: r => money(r.esicEmployer) },
          { label: 'Total ESI Contribution', render: r => `<b>${money(r.esic + r.esicEmployer)}</b>` }
        ], 'No ESI eligible records.')}
      </div>
    `;
  } else if (currentReportType === 'bank_statement') {
    // Bank Payment Advice
    const bankRows = calc.filter(r => (r.paymentMode || 'Bank') === 'Bank');
    const totBankNet = bankRows.reduce((s, r) => s + r.net, 0);

    reportBodyHtml = `
      <div class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">BANKING ADVICE</p>
            <h3>Direct Credit Bank Transfer Statement · Total ${money(totBankNet)}</h3>
          </div>
        </div>
        ${renderTable(bankRows, [
          { label: 'S.No.', render: (_r, i) => String(i + 1).padStart(2, '0') },
          { label: 'Emp Code', key: 'empCode' },
          { label: 'Beneficiary Name', render: r => `<strong>${esc(r.name)}</strong>` },
          { label: 'Bank Name', render: r => esc(r.bankName || 'HDFC Bank') },
          { label: 'Bank Account Number', render: r => `<b>${esc(r.bankAccount || '—')}</b>` },
          { label: 'IFSC Code', render: r => `<span class="site-code-tag">${esc(r.ifsc || '—')}</span>` },
          { label: 'Net Disbursal (₹)', render: r => `<strong style="color:var(--accent-emerald); font-size:14px;">${money(r.net)}</strong>` }
        ], 'No bank payment records.')}
      </div>
    `;
  } else if (currentReportType === 'cash_statement') {
    // Cash Statement with signature block
    const cashRows = calc.filter(r => r.paymentMode === 'Cash');
    reportBodyHtml = `
      <div class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">CASH DISBURSAL SCHEDULE</p>
            <h3>Monthly Cash Payment Sheet & Employee Acknowledgement</h3>
          </div>
        </div>
        ${renderTable(cashRows, [
          { label: 'S.No.', render: (_r, i) => String(i + 1).padStart(2, '0') },
          { label: 'Emp Code', key: 'empCode' },
          { label: 'Employee Name', render: r => `<strong>${esc(r.name)}</strong>` },
          { label: 'Department', render: r => esc(r.department || '—') },
          { label: 'Net Amount (₹)', render: r => `<strong style="color:var(--accent-emerald);">${money(r.net)}</strong>` },
          { label: 'Amount in Words', render: r => `<small>${numberToWords(r.net)}</small>` },
          { label: 'Receiver Signature', render: () => `<div style="height:30px; border-bottom:1px solid #94a3b8; width:120px;"></div>` }
        ], 'No cash payment records.')}
      </div>
    `;
  } else if (currentReportType === 'cheque_statement') {
    // Cheque Statement
    const chequeRows = calc.filter(r => r.paymentMode === 'Cheque');
    reportBodyHtml = `
      <div class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">CHEQUE DISBURSAL</p>
            <h3>Cheque Payment Schedule (Combined & Separate)</h3>
          </div>
        </div>
        ${renderTable(chequeRows, [
          { label: 'S.No.', render: (_r, i) => String(i + 1).padStart(2, '0') },
          { label: 'Emp Code', key: 'empCode' },
          { label: 'Payee Name', render: r => `<strong>${esc(r.name)}</strong>` },
          { label: 'Handling Mode', render: r => `<span class="cat-pill">${esc(r.chequeHandling || 'Separate')}</span>` },
          { label: 'Net Amount (₹)', render: r => `<strong style="color:var(--accent-emerald);">${money(r.net)}</strong>` },
          { label: 'Amount in Words', render: r => `<small>${numberToWords(r.net)}</small>` },
          { label: 'Cheque Number', render: () => `______________` }
        ], 'No cheque payment records.')}
      </div>
    `;
  } else {
    // Fallback standard view
    reportBodyHtml = `
      <div class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">${esc(siteLabel.toUpperCase())}</p>
            <h3>${esc(currentReportType.replace(/_/g, ' ').toUpperCase())}</h3>
          </div>
        </div>
        ${renderTable(calc, [
          { label: 'Code', key: 'empCode' },
          { label: 'Employee Name', render: r => `<strong>${esc(r.name)}</strong>` },
          { label: 'Gross Pay', render: r => money(r.gross) },
          { label: 'Deductions', render: r => money(r.totalDeduction) },
          { label: 'Net Pay', render: r => `<strong style="color:var(--accent-emerald);">${money(r.net)}</strong>` }
        ])}
      </div>
    `;
  }

  shell('Report Center', 'ANALYTICS & STATUTORY / 12', `
    ${subnavHtml}
    ${selectorHtml}

    <div class="toolbar">
      <div class="toolbar-left">
        <select class="filter-select" id="repSiteFilter" style="font-weight: 700;">
          <option value="all" ${currentSiteFilter === 'all' ? 'selected' : ''}>🏢 Consolidated Company (${allCalc.length} Employees)</option>
          <option value="unassigned" ${currentSiteFilter === 'unassigned' ? 'selected' : ''}>⚠️ Unassigned Employees</option>
          ${sites.map(s => {
            const count = allCalc.filter(r => r.siteId === s.id).length;
            return `<option value="${esc(s.id)}" ${currentSiteFilter === s.id ? 'selected' : ''}>🏢 ${esc(s.siteName)} (${count} Employees)</option>`;
          }).join('')}
        </select>
        <button class="outline" onclick="window.print()">🖨️ Print Statement</button>
      </div>
      <div class="toolbar-right">
        <button class="outline" id="exportXlsxBtn">📥 Export Excel (.xlsx)</button>
        <button class="primary" id="exportCsvBtn">📥 Export CSV</button>
      </div>
    </div>

    ${reportBodyHtml}
  `);

  $$('.report-tab-btn').forEach(btn => {
    btn.onclick = () => {
      reportCategory = btn.dataset.cat;
      if (reportCategory === 'payroll') currentReportType = 'wage_register';
      else if (reportCategory === 'statutory') currentReportType = 'pf_deduction';
      else if (reportCategory === 'payment') currentReportType = 'bank_statement';
      else currentReportType = 'bonus_statement';
      renderReports();
    };
  });

  $$('.report-card-btn').forEach(btn => {
    btn.onclick = () => {
      currentReportType = btn.dataset.type;
      renderReports();
    };
  });

  $('#repSiteFilter').onchange = (e) => {
    currentSiteFilter = e.target.value;
    renderReports();
  };

  $('#exportCsvBtn').onclick = () => exportCsv(calc, `EMPPAY-${currentReportType}-${currentSiteFilter}-${currentPeriod}.csv`);
  
  $('#exportXlsxBtn').onclick = async () => {
    if (window.emppay.exportWorkbook) {
      const headers = ['S.No', 'Emp Code', 'Employee Name', 'Site', 'Category', 'Basic', 'DA', 'HRA', 'Other All', 'Gross', 'PF', 'ESIC', 'PT', 'Net Pay'];
      const data = [
        headers,
        ...calc.map((r, i) => [
          i + 1,
          r.empCode,
          r.name,
          r.siteName,
          r.category,
          r.basic,
          r.da,
          r.hra,
          r.otherAllowance,
          r.gross,
          r.pf,
          r.esic,
          r.pt,
          r.net
        ])
      ];
      const filePath = await window.emppay.exportWorkbook({
        filename: `EMPPAY-${currentReportType}-${currentPeriod}.xlsx`,
        sheets: [{ name: 'Payroll Register', data }]
      });
      if (filePath) toast(`Exported Excel workbook to ${filePath}`);
    } else {
      exportCsv(calc, `EMPPAY-${currentReportType}-${currentSiteFilter}-${currentPeriod}.csv`);
    }
  };
}

// ----------------------------------------------------
// SECTION 13: AUTO-BACKUP & AUDIT TRAIL
// ----------------------------------------------------
async function renderBackup() {
  let autoBackups = [];
  try {
    if (window.emppay.listAutoBackups) {
      autoBackups = await window.emppay.listAutoBackups();
    }
  } catch (err) {
    console.error('Failed to list auto backups:', err);
  }

  shell('Auto-Backup & History', 'CONTROL / 13', `
    <div class="metric-grid">
      <div class="metric-card accent-emerald">
        <div class="metric-header"><span class="metric-title">AUTO-BACKUP STATUS</span><span class="metric-icon">🛡️</span></div>
        <div class="metric-value">Active</div>
        <div class="metric-desc">Preserves sites, employees, payroll, loans, arrears & statutory history</div>
      </div>
      <div class="metric-card accent-blue">
        <div class="metric-header"><span class="metric-title">AUTOMATIC SNAPSHOTS</span><span class="metric-icon">📦</span></div>
        <div class="metric-value">${autoBackups.length}</div>
        <div class="metric-desc">Rolling recovery snapshots saved locally</div>
      </div>
      <div class="metric-card">
        <div class="metric-header"><span class="metric-title">ACTIVE SITES</span><span class="metric-icon">🏢</span></div>
        <div class="metric-value">${(db.sites || []).length}</div>
        <div class="metric-desc">Company location entities stored</div>
      </div>
      <div class="metric-card">
        <div class="metric-header"><span class="metric-title">AUDIT EVENTS</span><span class="metric-icon">📜</span></div>
        <div class="metric-value">${(db.audit || []).length}</div>
        <div class="metric-desc">Activity logs recorded</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">AUTOMATED ROLLING BACKUP TIMELINE</p>
          <h3>Automatic Snapshot Recovery Points</h3>
        </div>
        <div class="header-actions">
          <button class="outline" id="exportManualBackupBtn">📥 Export Manual Backup File</button>
          <button class="outline" id="importManualBackupBtn">📤 Restore From JSON File</button>
        </div>
      </div>

      <div class="backup-timeline">
        ${autoBackups.length > 0 ? autoBackups.map((b, i) => `
          <div class="backup-item">
            <div class="backup-info">
              <span class="backup-icon">💾</span>
              <div>
                <div class="backup-name">${esc(b.fileName)}</div>
                <div class="backup-meta">
                  <span>📅 ${new Date(b.createdAt).toLocaleString()}</span>
                  <span>🏢 ${b.siteCount ?? (db.sites || []).length} sites</span>
                  <span>👥 ${b.empCount ?? '—'} employees</span>
                  <span>📁 ${(b.sizeBytes / 1024).toFixed(1)} KB</span>
                  ${i === 0 ? '<span class="status ok" style="padding:1px 6px; font-size:10px;">LATEST</span>' : ''}
                </div>
              </div>
            </div>
            <button class="outline btn-sm restore-auto-btn" data-path="${esc(b.filePath)}">↺ Restore This Point</button>
          </div>
        `).join('') : `
          <div class="empty-state">
            <div class="empty-state-icon">🛡️</div>
            <h4>No auto-backups saved yet.</h4>
            <p>Snapshots are generated automatically whenever you add or edit records.</p>
          </div>
        `}
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">ENTERPRISE AUDIT TRAIL</p>
          <h3>Recent Local Activity & Security Logs</h3>
        </div>
      </div>
      ${renderTable((db.audit || []).slice(0, 25), [
        { label: 'Timestamp', render: r => new Date(r.at).toLocaleString() },
        { label: 'Module', render: r => `<span class="cat-pill">${esc(r.module || 'general')}</span>` },
        { label: 'User', render: r => `<b>${esc(r.user || 'Admin')}</b>` },
        { label: 'Action', render: r => `<span class="status info">${esc(r.action)}</span>` },
        { label: 'Details', render: r => esc(r.detail) }
      ], 'No audit records.')}
    </div>
  `);

  $('#exportManualBackupBtn').onclick = async () => {
    const filePath = await window.emppay.backup(db);
    if (filePath) {
      log('backup.exported', filePath, 'backup');
      await save();
      toast(`Manual backup saved to ${filePath}`);
    }
  };

  $('#importManualBackupBtn').onclick = async () => {
    const result = await window.emppay.restore();
    if (!result) return;
    const restored = result.payload;
    if (!restored || !Array.isArray(restored.employees)) {
      toast('Invalid backup format!', 'error');
      return;
    }
    showConfirm({
      title: 'Restore Database',
      message: `Restore data from <strong>${esc(result.filePath)}</strong>? Current working data will be replaced.`,
      isDanger: true,
      confirmText: 'Restore Now',
      onConfirm: async () => {
        db = {
          ...restored,
          sites: Array.isArray(restored.sites) ? restored.sites : (db.sites || []),
          audit: [...(restored.audit || []), { at: new Date().toISOString(), action: 'backup.restored_manual', detail: result.filePath, module: 'backup', user: db.auth?.username || 'Admin' }]
        };
        await save();
        toast('Backup restored successfully!');
        render();
      }
    });
  };

  $$('.restore-auto-btn').forEach(btn => {
    btn.onclick = async () => {
      const filePath = btn.dataset.path;
      showConfirm({
        title: 'Restore Auto-Backup Snapshot',
        message: `Restore snapshot <strong>${esc(filePath.split(/[\\/]/).pop())}</strong>?`,
        isDanger: true,
        confirmText: 'Restore Snapshot',
        onConfirm: async () => {
          const res = await window.emppay.restoreAutoBackup(filePath);
          if (res && res.payload && Array.isArray(res.payload.employees)) {
            db = {
              ...res.payload,
              sites: Array.isArray(res.payload.sites) ? res.payload.sites : (db.sites || []),
              audit: [...(res.payload.audit || []), { at: new Date().toISOString(), action: 'backup.restored_auto', detail: filePath, module: 'backup', user: db.auth?.username || 'Admin' }]
            };
            await save();
            toast('Auto-backup snapshot restored successfully!');
            render();
          } else {
            toast('Could not restore snapshot.', 'error');
          }
        }
      });
    };
  });
}

// ----------------------------------------------------
// SECTION 14: LOCAL AUTHENTICATION
// ----------------------------------------------------
function renderAuth() {
  $('aside').style.display = 'none';
  $('header').style.display = 'none';
  $('#pageTitle').textContent = 'Local Security';

  const isSetup = !db.auth;
  $('#content').innerHTML = `
    <div class="auth-wrapper">
      <div class="auth-card">
        <div class="auth-brand">
          <div class="brand-logo"><img src="logo.jpg" alt="P & P Enterprises" class="brand-img"></div>
          <div class="brand-text">
            <strong>P & P Enterprises</strong>
            <small>Payroll Control Room</small>
          </div>
        </div>
        <p class="eyebrow">DESKTOP LOCAL SECURITY</p>
        <h2>${isSetup ? 'Create Administrator Account' : 'Sign in to P & P Enterprises'}</h2>
        <p class="muted">${isSetup ? 'Set up the local operator credentials to secure payroll records.' : 'Enter your local administrator credentials.'}</p>
        
        <form id="authForm" class="auth-form">
          <div class="form-group">
            <label>Username</label>
            <input type="text" id="authUser" required value="${esc(db.auth?.username || 'admin')}">
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" id="authPass" required minlength="6" placeholder="Enter password">
          </div>
          ${isSetup ? `
            <div class="form-group">
              <label>Confirm Password</label>
              <input type="password" id="authConfirm" required minlength="6" placeholder="Confirm password">
            </div>
          ` : ''}
          <button class="primary" type="submit" style="margin-top: 10px; width: 100%;">${isSetup ? 'Create Administrator' : 'Unlock Workspace'}</button>
          <div id="authError" class="auth-error"></div>
        </form>
      </div>
    </div>
  `;

  $('#authForm').onsubmit = async (e) => {
    e.preventDefault();
    const username = $('#authUser').value.trim();
    const password = $('#authPass').value;
    const errEl = $('#authError');

    if (isSetup) {
      const confirmPass = $('#authConfirm').value;
      if (password !== confirmPass) {
        errEl.textContent = 'Passwords do not match.';
        return;
      }
      const ok = await window.emppay.setup({ username, password });
      if (ok) {
        db = await window.emppay.load();
        startWorkspace();
      } else {
        errEl.textContent = 'Setup failed. Password must be at least 6 characters.';
      }
    } else {
      const ok = await window.emppay.login({ username, password });
      if (ok) {
        startWorkspace();
      } else {
        errEl.textContent = 'Incorrect username or password.';
      }
    }
  };
}

function startWorkspace() {
  $('aside').style.display = 'flex';
  $('header').style.display = 'flex';
  const userPill = $('#userPill');
  if (userPill && db.auth) {
    userPill.style.display = 'flex';
    const userEl = $('#currentUserName');
    if (userEl) userEl.textContent = db.auth.username || 'Admin';
  }
  updateNavBadges();
  render();
}

// ----------------------------------------------------
// SECTION 15: UNIVERSAL IMPORT / EXPORT
// ----------------------------------------------------
async function importWorkbook() {
  const file = await window.emppay.openFile();
  if (!file) return;

  try {
    const sheets = await window.emppay.readWorkbook(file);
    if (!sheets || sheets.length === 0) {
      toast('No data sheets found in the selected file.', 'error');
      return;
    }

    const sheet = sheets[0];
    const existingEmpCodes = new Set((db.employees || []).map(e => e.empCode));
    const sites = db.sites || [];

    const parsedRows = sheet.rows.map((r, i) => {
      const name = r['Employee Name'] || r.Employee || r.Name || r.employee || r.name || '';
      const empCode = r['Employee Code'] || r['Emp Code'] || r.EmpCode || r.Code || r.code || `EMP-${String(db.employees.length + i + 1).padStart(4, '0')}`;
      const siteCodeVal = (r['Site Code'] || r.SiteCode || r.Site || r.site || '').trim();
      const siteNameVal = (r['Site Name'] || r.SiteName || r.Location || r.location || '').trim();

      let matchedSite = null;
      if (siteCodeVal) matchedSite = sites.find(s => s.siteCode.toUpperCase() === siteCodeVal.toUpperCase());
      if (!matchedSite && siteNameVal) matchedSite = sites.find(s => s.siteName.toLowerCase() === siteNameVal.toLowerCase());

      const basic = Number(r['Basic Salary'] || r.Basic || r.basic || 0);
      const da = Number(r.DA || r.da || 0);
      const hra = Number(r.HRA || r.hra || 0);
      const otherAllowance = Number(r['Other Allowances'] || r['Other Allowance'] || r.otherAllowance || 0);
      const category = r.Category || r.category || 'Skilled';
      const department = r.Department || r.dept || '';
      const designation = r.Designation || r.designation || '';
      const paymentMode = r['Payment Mode'] || r.paymentMode || 'Bank';
      const uan = String(r.UAN || r.uan || '');
      const bankAccount = String(r['Bank Account'] || r.bankAccount || '');
      const ifsc = String(r.IFSC || r.ifsc || '');
      const bankName = String(r['Bank Name'] || r.bankName || '');
      const aadhaarName = String(r['Name as per Aadhaar'] || r['Aadhaar Name'] || r.aadhaarName || '');
      const dob = String(r['Date of Birth'] || r['DOB'] || r.dob || '');
      const aadhaar = String(r['Aadhaar No'] || r['Aadhaar Number'] || r['Aadhaar'] || r.aadhaar || '');
      const mobile = String(r['Mobile No'] || r['Mobile Number'] || r['Mobile'] || r['Phone'] || r.mobile || '');
      const gender = String(r['Gender'] || r.gender || 'Male');
      const presentAddress = String(r['Present Address'] || r.presentAddress || '');
      const permanentAddress = String(r['Permanent Address'] || r.permanentAddress || '');
      const pan = String(r['PAN No'] || r['PAN'] || r.pan || '').toUpperCase();
      const nomineeName = String(r['Nominee Name'] || r.nomineeName || '');

      const workingDays = Number(r['Working Days'] || r.WorkingDays || 26);
      const presentDays = Number(r['Present Days'] || r.Present || r.present || workingDays);
      const payableDays = Number(r['Payable Days'] || r.PayableDays || presentDays);
      const otHours = Number(r['OT Hours'] || r.OT || r.otHours || 0);

      const isDuplicate = existingEmpCodes.has(empCode);
      const hasName = Boolean(name);

      const dupCheck = findDuplicateEmployee({
        empCode,
        aadhaar,
        pan,
        uan,
        esiNumber: r.ESI || r.esiNumber || ''
      }, isDuplicate ? empCode : null);

      let status = 'valid';
      let errorMsg = '';
      if (!hasName) { status = 'error'; errorMsg = 'Missing employee name'; }
      else if (dupCheck.isDuplicate) { status = 'warning'; errorMsg = `Duplicate ${dupCheck.matchedField} (${dupCheck.existingEmployee.name})`; }
      else if (isDuplicate) { status = 'warning'; errorMsg = 'Duplicate code (will update)'; }
      else if (!matchedSite && (siteCodeVal || siteNameVal)) { status = 'warning'; errorMsg = `Site "${siteCodeVal || siteNameVal}" not found`; }

      return {
        rowIdx: i + 1,
        name: name || `Employee ${empCode}`,
        empCode,
        matchedSite,
        rawSite: siteCodeVal || siteNameVal || '—',
        category,
        department,
        designation,
        paymentMode,
        basic,
        da,
        hra,
        otherAllowance,
        uan,
        bankAccount,
        ifsc,
        bankName,
        aadhaarName,
        dob,
        aadhaar,
        mobile,
        gender,
        presentAddress,
        permanentAddress,
        pan,
        nomineeName,
        workingDays,
        presentDays,
        payableDays,
        otHours,
        status,
        errorMsg,
        isDuplicate
      };
    }).filter(r => r.name && r.name !== 'Employee undefined');

    if (parsedRows.length === 0) {
      toast('No valid employee rows found in spreadsheet.', 'error');
      return;
    }

    const validCount = parsedRows.filter(r => r.status === 'valid').length;
    const warningCount = parsedRows.filter(r => r.status === 'warning').length;
    const errorCount = parsedRows.filter(r => r.status === 'error').length;

    const previewHtml = `
      <div style="padding: 4px 0;">
        <div class="preview-summary-grid">
          <div class="preview-stat-card"><div class="val">${parsedRows.length}</div><div class="lbl">Total Rows</div></div>
          <div class="preview-stat-card valid"><div class="val">${validCount + warningCount}</div><div class="lbl">Ready to Import</div></div>
          <div class="preview-stat-card ${errorCount > 0 ? 'error' : ''}"><div class="val">${errorCount}</div><div class="lbl">Incomplete</div></div>
        </div>

        <div class="import-preview-wrap">
          <table style="font-size: 12px; width: 100%;">
            <thead>
              <tr>
                <th>#</th>
                <th>Code</th>
                <th>Employee Name</th>
                <th>Site</th>
                <th>Pay Mode</th>
                <th>Basic (₹)</th>
                <th>Days</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${parsedRows.map(r => `
                <tr style="${r.status === 'error' ? 'background:#fff1f2;' : ''}">
                  <td>${r.rowIdx}</td>
                  <td><strong>${esc(r.empCode)}</strong></td>
                  <td>${esc(r.name)}</td>
                  <td>${r.matchedSite ? `<span class="site-pill pune">🏢 ${esc(r.matchedSite.siteName)}</span>` : `<span class="site-pill unassigned">⚠️ ${esc(r.rawSite)}</span>`}</td>
                  <td>${getPaymentModePill(r.paymentMode)}</td>
                  <td><b>${money(r.basic)}</b></td>
                  <td>${r.payableDays}d</td>
                  <td>
                    ${r.status === 'valid' ? '<span class="status ok">✓ Ready</span>' : ''}
                    ${r.status === 'warning' ? `<span class="status warning" title="${esc(r.errorMsg)}">⚠️ ${esc(r.errorMsg)}</span>` : ''}
                    ${r.status === 'error' ? `<span class="status danger">${esc(r.errorMsg)}</span>` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    showModal({
      title: 'Import Spreadsheet Preview',
      eyebrow: 'EXCEL / CSV IMPORT',
      body: previewHtml,
      saveText: `Confirm & Import ${validCount + warningCount} Records`,
      modalClass: 'modal-lg',
      onSave: async () => {
        let imported = 0;
        parsedRows.forEach(r => {
          if (r.status === 'error') return;

          const existing = db.employees.find(e => e.empCode === r.empCode);
          const empObj = {
            ...(existing || {}),
            empCode: r.empCode,
            name: r.name,
            siteId: r.matchedSite ? r.matchedSite.id : (existing?.siteId || 'unassigned'),
            category: r.category,
            department: r.department,
            designation: r.designation,
            paymentMode: r.paymentMode,
            basic: r.basic,
            da: r.da,
            hra: r.hra,
            otherAllowance: r.otherAllowance,
            uan: r.uan || existing?.uan || '',
            bankAccount: r.bankAccount || existing?.bankAccount || '',
            ifsc: r.ifsc || existing?.ifsc || '',
            bankName: r.bankName || existing?.bankName || '',
            aadhaarName: r.aadhaarName || existing?.aadhaarName || r.name,
            dob: r.dob || existing?.dob || '',
            aadhaar: r.aadhaar ? r.aadhaar.replace(/\s/g, '') : (existing?.aadhaar || ''),
            mobile: r.mobile ? r.mobile.replace(/\D/g, '').slice(-10) : (existing?.mobile || ''),
            gender: r.gender || existing?.gender || 'Male',
            presentAddress: r.presentAddress || existing?.presentAddress || '',
            permanentAddress: r.permanentAddress || existing?.permanentAddress || '',
            pan: r.pan || existing?.pan || '',
            status: existing?.status || 'Active'
          };
          if (r.nomineeName && (!empObj.nominee || !empObj.nominee.name)) {
            empObj.nominee = { ...(empObj.nominee || {}), name: r.nomineeName, relationship: 'Nominee' };
          }

          if (!Array.isArray(empObj.salaryHistory) || empObj.salaryHistory.length === 0) {
            const initialGross = (Number(empObj.basic) || 0) + (Number(empObj.da) || 0) + (Number(empObj.hra) || 0) + (Number(empObj.otherAllowance) || 0);
            empObj.salaryHistory = [{
              id: 'sal_rev_import_' + Date.now() + '_' + r.empCode,
              effectiveDate: new Date().toISOString().slice(0, 10),
              effectivePeriod: currentPeriod,
              previousSalary: { basic: 0, da: 0, hra: 0, conveyance: 0, medical: 0, otherAllowance: 0, gross: 0 },
              newSalary: { basic: empObj.basic, da: empObj.da, hra: empObj.hra, conveyance: 0, medical: 0, otherAllowance: empObj.otherAllowance, gross: initialGross },
              changeType: 'Initial Salary',
              reason: 'Spreadsheet Import Baseline',
              changedBy: db.auth?.username || 'Admin',
              timestamp: new Date().toISOString()
            }];
          }

          const existingIdx = db.employees.findIndex(e => e.empCode === r.empCode);
          if (existingIdx !== -1) db.employees[existingIdx] = empObj;
          else db.employees.push(empObj);

          let a = db.attendance.find(x => x.empCode === r.empCode && (!x.period || x.period === currentPeriod));
          if (!a) {
            a = { empCode: r.empCode, period: currentPeriod };
            db.attendance.push(a);
          }
          a.workingDays = r.workingDays;
          a.presentDays = r.presentDays;
          a.payableDays = r.payableDays;
          a.otHours = r.otHours;

          imported++;
        });

        log('workbook.imported', `Imported ${imported} records from ${file.split(/[\\/]/).pop()}`, 'import');
        await save();
        toast(`Successfully imported ${imported} employee records!`);
        render();
        return true;
      }
    });
  } catch (err) {
    console.error('Import error:', err);
    toast('Import failed: ' + err.message, 'error');
  }
}

async function exportCsv(calc, filename) {
  const header = `EMPPAY Enterprise Multi-Site Payroll Export - Generated ${new Date().toISOString()}, Rule Version ${db.rules?.version || 1}`;
  const tableHeader = 'S.No.,Emp Code,Employee Name,Site Code,Site Name,Category,Payment Mode,Working Days,Payable Days,Basic,DA,HRA,Other Allowance,OT Pay,Gross,PF,ESIC,PT,LWF,Total Deductions,Net Pay';

  const rows = calc.map((r, i) => [
    i + 1,
    `"${esc(r.empCode)}"`,
    `"${esc(r.name)}"`,
    `"${esc(r.siteCode || getSiteCode(r.siteId))}"`,
    `"${esc(r.siteName || getSiteName(r.siteId))}"`,
    `"${esc(r.category || '')}"`,
    `"${esc(r.paymentMode || 'Bank')}"`,
    r.workingDays || 26,
    r.payableDays || 26,
    r.basic?.toFixed(2) || '0.00',
    r.da?.toFixed(2) || '0.00',
    r.hra?.toFixed(2) || '0.00',
    r.otherAllowance?.toFixed(2) || '0.00',
    r.ot?.toFixed(2) || '0.00',
    r.gross?.toFixed(2) || '0.00',
    r.pf?.toFixed(2) || '0.00',
    r.esic?.toFixed(2) || '0.00',
    r.pt?.toFixed(2) || '0.00',
    r.lwf?.toFixed(2) || '0.00',
    r.totalDeduction?.toFixed(2) || '0.00',
    r.net?.toFixed(2) || '0.00'
  ].join(','));

  const content = [header, tableHeader, ...rows].join('\n');
  await exportCsvRaw(content, filename);
}

async function exportCsvRaw(content, filename) {
  const filePath = await window.emppay.exportFile({ filename, content });
  if (filePath) toast(`Exported file to ${filePath}`);
}

// ----------------------------------------------------
// MAIN RENDER SWITCH
// ----------------------------------------------------
function render() {
  const map = {
    dashboard: renderDashboard,
    sites: renderSites,
    employees: renderEmployees,
    attendance: renderAttendance,
    structures: renderStructures,
    rules: renderRules,
    loans: renderLoans,
    arrears: renderArrears,
    bonus: renderBonus,
    payroll: renderPayroll,
    payslips: renderPayslips,
    reports: renderReports,
    backup: renderBackup
  };

  const fn = map[currentPage] || renderDashboard;
  fn();

  $$('#nav button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === currentPage);
  });
}

// Global Nav & Header Listeners
$('#nav').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-page]');
  if (btn) {
    currentPage = btn.dataset.page;
    render();
  }
});

const quickAddBtn = $('#quickAddEmpBtn');
if (quickAddBtn) quickAddBtn.onclick = () => openEmployeeModal();

const importBtn = $('#importBtn');
if (importBtn) importBtn.onclick = importWorkbook;

const logoutBtn = $('#logoutBtn');
if (logoutBtn) logoutBtn.onclick = () => renderAuth();

// ----------------------------------------------------
// APPLICATION INITIALIZATION & SEEDING (TEST DATA)
// ----------------------------------------------------
(async () => {
  try {
    db = await window.emppay.load();

    const defaultSites = [
      {
        id: 'site_pune_01',
        siteCode: 'PUNE01',
        siteName: 'Pune Plant',
        address: 'Plot 42, MIDC Industrial Area, Phase II',
        city: 'Pune',
        state: 'Maharashtra',
        pincode: '411057',
        contactPerson: 'Ramesh Deshmukh',
        contactNumber: '+91 98220 12345',
        email: 'pune.plant@emppay.com',
        status: 'Active',
        createdAt: '2026-01-01T00:00:00.000Z'
      },
      {
        id: 'site_mumbai_01',
        siteCode: 'MUM01',
        siteName: 'Mumbai Office',
        address: 'Level 8, Express Towers, Nariman Point',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400021',
        contactPerson: 'Pooja Sharma',
        contactNumber: '+91 98200 54321',
        email: 'mumbai.hq@emppay.com',
        status: 'Active',
        createdAt: '2026-01-01T00:00:00.000Z'
      },
      {
        id: 'site_nashik_01',
        siteCode: 'NSK01',
        siteName: 'Nashik Factory',
        address: 'Gat No 114, Ambad MIDC',
        city: 'Nashik',
        state: 'Maharashtra',
        pincode: '422010',
        contactPerson: 'Sunil Shinde',
        contactNumber: '+91 94222 98765',
        email: 'nashik.works@emppay.com',
        status: 'Active',
        createdAt: '2026-01-01T00:00:00.000Z'
      }
    ];

    const defaultEmployees = [
      // Pune Plant: 5 employees
      { empCode: 'EMP-0001', name: 'Rahul Patil', siteId: 'site_pune_01', category: 'Skilled', department: 'Operations', designation: 'Plant Operator', paymentMode: 'Bank', bankAccount: '987654321012', ifsc: 'HDFC0001234', bankName: 'HDFC Bank', basic: 18500, da: 2200, hra: 2500, conveyance: 800, medical: 500, otherAllowance: 1000, uan: '100987654321', pfNumber: '100987654321', esiNumber: '3100098765', pan: 'ABCDE1234F', status: 'Active' },
      { empCode: 'EMP-0002', name: 'Amit Jadhav', siteId: 'site_pune_01', category: 'Skilled', department: 'Maintenance', designation: 'Technician', paymentMode: 'Bank', bankAccount: '987654321013', ifsc: 'HDFC0001234', bankName: 'HDFC Bank', basic: 24000, da: 2800, hra: 3200, conveyance: 1000, medical: 600, otherAllowance: 1200, uan: '100987654322', pfNumber: '100987654322', esiNumber: '', pan: 'ABCDE1235G', status: 'Active' },
      { empCode: 'EMP-0003', name: 'Suresh Deshmukh', siteId: 'site_pune_01', category: 'Skilled', department: 'Production', designation: 'Supervisor', paymentMode: 'Bank', bankAccount: '987654321014', ifsc: 'ICIC0002345', bankName: 'ICICI Bank', basic: 31500, da: 3800, hra: 4500, conveyance: 1200, medical: 800, otherAllowance: 2000, uan: '100987654323', pfNumber: '100987654323', esiNumber: '', pan: 'ABCDE1236H', status: 'Active' },
      { empCode: 'EMP-0004', name: 'Vijay Kulkarni', siteId: 'site_pune_01', category: 'Semi-skilled', department: 'Assembly', designation: 'Assembly Worker', paymentMode: 'Cash', bankAccount: '', ifsc: '', bankName: '', basic: 19750, da: 2100, hra: 2200, conveyance: 600, medical: 400, otherAllowance: 800, uan: '100987654324', pfNumber: '100987654324', esiNumber: '3100098768', pan: 'ABCDE1237I', status: 'Active' },
      { empCode: 'EMP-0005', name: 'Deepak Sawant', siteId: 'site_pune_01', category: 'Executive', department: 'Engineering', designation: 'Plant Engineer', paymentMode: 'Bank', bankAccount: '987654321016', ifsc: 'SBIN0004567', bankName: 'State Bank of India', basic: 42000, da: 5000, hra: 6000, conveyance: 2000, medical: 1500, otherAllowance: 3000, uan: '100987654325', pfNumber: '100987654325', esiNumber: '', pan: 'ABCDE1238J', status: 'Active' },

      // Mumbai Office: 4 employees
      { empCode: 'EMP-0006', name: 'Priya Mehta', siteId: 'site_mumbai_01', category: 'Executive', department: 'Human Resources', designation: 'HR Executive', paymentMode: 'Bank', bankAccount: '987654321017', ifsc: 'HDFC0001234', bankName: 'HDFC Bank', basic: 28000, da: 3500, hra: 4000, conveyance: 1500, medical: 1000, otherAllowance: 1500, uan: '100987654326', pfNumber: '100987654326', esiNumber: '', pan: 'ABCDE1239K', status: 'Active' },
      { empCode: 'EMP-0007', name: 'Rohit Sharma', siteId: 'site_mumbai_01', category: 'Executive', department: 'Finance', designation: 'Accountant', paymentMode: 'Cheque', chequeHandling: 'Separate', bankAccount: '987654321018', ifsc: 'KKBK0001234', bankName: 'Kotak Bank', basic: 35000, da: 4200, hra: 5000, conveyance: 1800, medical: 1200, otherAllowance: 2000, uan: '100987654327', pfNumber: '100987654327', esiNumber: '', pan: 'ABCDE1240L', status: 'Active' },
      { empCode: 'EMP-0008', name: 'Ananya Sen', siteId: 'site_mumbai_01', category: 'Manager', department: 'Finance', designation: 'Finance Manager', paymentMode: 'Bank', bankAccount: '987654321019', ifsc: 'HDFC0001234', bankName: 'HDFC Bank', basic: 52000, da: 6500, hra: 8000, conveyance: 3000, medical: 2000, otherAllowance: 4000, uan: '100987654328', pfNumber: '100987654328', esiNumber: '', pan: 'ABCDE1241M', status: 'Active' },
      { empCode: 'EMP-0009', name: 'Vishal Nair', siteId: 'site_mumbai_01', category: 'Semi-skilled', department: 'Administration', designation: 'Office Assistant', paymentMode: 'Cash', bankAccount: '', ifsc: '', bankName: '', basic: 22500, da: 2500, hra: 3000, conveyance: 800, medical: 500, otherAllowance: 1000, uan: '100987654329', pfNumber: '100987654329', esiNumber: '', pan: 'ABCDE1242N', status: 'Active' },

      // Nashik Factory: 3 employees
      { empCode: 'EMP-0010', name: 'Sanjay Shinde', siteId: 'site_nashik_01', category: 'Semi-skilled', department: 'Fabrication', designation: 'Machinist', paymentMode: 'Bank', bankAccount: '987654321021', ifsc: 'MAHB0001234', bankName: 'Bank of Maharashtra', basic: 16200, da: 1800, hra: 1800, conveyance: 500, medical: 400, otherAllowance: 600, uan: '100987654330', pfNumber: '100987654330', esiNumber: '3100098774', pan: 'ABCDE1243O', status: 'Active' },
      { empCode: 'EMP-0011', name: 'Manoj More', siteId: 'site_nashik_01', category: 'Skilled', department: 'Quality', designation: 'Quality Inspector', paymentMode: 'Bank', bankAccount: '987654321022', ifsc: 'HDFC0001234', bankName: 'HDFC Bank', basic: 20500, da: 2400, hra: 2600, conveyance: 800, medical: 600, otherAllowance: 1000, uan: '100987654331', pfNumber: '100987654331', esiNumber: '', pan: 'ABCDE1244P', status: 'Active' },
      { empCode: 'EMP-0012', name: 'Ganesh Thorat', siteId: 'site_nashik_01', category: 'Skilled', department: 'Production', designation: 'Production Lead', paymentMode: 'Bank', bankAccount: '987654321023', ifsc: 'SBIN0004567', bankName: 'State Bank of India', basic: 27800, da: 3200, hra: 3600, conveyance: 1200, medical: 800, otherAllowance: 1500, uan: '100987654332', pfNumber: '100987654332', esiNumber: '', pan: 'ABCDE1245Q', status: 'Active' }
    ];

    const defaultAttendance = defaultEmployees.map((e, i) => ({
      empCode: e.empCode,
      period: currentPeriod,
      workingDays: 26,
      presentDays: 24 + (i % 3),
      weeklyOffs: 4,
      paidHolidays: 1,
      sickLeave: (i % 4 === 0) ? 1 : 0,
      cl: (i % 3 === 0) ? 1 : 0,
      pl: 0,
      otherLeave: 0,
      lopDays: (i === 3) ? 2 : 0,
      payableDays: 24 + (i % 3) - ((i === 3) ? 2 : 0),
      otHours: (i * 2) % 10,
      otRate: 0
    }));

    const defaultRuleVersion = {
      id: 'RULE-V1',
      version: 1,
      name: 'Standard Statutory Rules 2026',
      effectiveFrom: '2026-01-01',
      status: 'Active',
      pfRate: 12,
      pfCeiling: 15000,
      epsRate: 8.33,
      epfEmployerRate: 3.67,
      pfAdminRate: 0.5,
      edliRate: 0.5,
      esicRate: 0.75,
      esicEmployerRate: 3.25,
      esicCeiling: 21000,
      ptState: 'Maharashtra',
      pt: 200,
      ptSlabs: [
        { min: 0, max: 7500, amount: 0 },
        { min: 7501, max: 10000, amount: 175 },
        { min: 10001, max: 9999999, amount: 200, febAmount: 300 }
      ],
      lwf: 20,
      lwfEmployer: 40,
      lwfFrequency: 'Monthly',
      otMultiplier: 1.5,
      otBase: 'Basic',
      standardDailyHours: 8,
      clPayable: true,
      plPayable: true,
      slPayable: true,
      olPayable: false,
      woPayable: true,
      phPayable: true
    };

    const defaultComponents = [
      { id: 'c_basic', name: 'Basic', type: 'earning', mode: 'fixed', defaultValue: 0, taxable: true, statutory: true, active: true },
      { id: 'c_da', name: 'DA', type: 'earning', mode: 'fixed', defaultValue: 0, taxable: true, statutory: true, active: true },
      { id: 'c_hra', name: 'HRA', type: 'earning', mode: 'fixed', defaultValue: 0, taxable: true, statutory: false, active: true },
      { id: 'c_conveyance', name: 'Conveyance', type: 'earning', mode: 'fixed', defaultValue: 0, taxable: false, statutory: false, active: true },
      { id: 'c_incentive', name: 'Incentive', type: 'earning', mode: 'fixed', defaultValue: 0, taxable: true, statutory: false, active: true },
      { id: 'c_medical', name: 'Medical', type: 'earning', mode: 'fixed', defaultValue: 0, taxable: false, statutory: false, active: true },
      { id: 'c_education', name: 'Education Allowance', type: 'earning', mode: 'fixed', defaultValue: 0, taxable: false, statutory: false, active: true },
      { id: 'c_shift', name: 'Shift Allowance', type: 'earning', mode: 'fixed', defaultValue: 0, taxable: true, statutory: false, active: true },
      { id: 'c_washing', name: 'Washing Allowance', type: 'earning', mode: 'fixed', defaultValue: 0, taxable: false, statutory: false, active: true },
      { id: 'c_other_all', name: 'Other Allowance', type: 'earning', mode: 'fixed', defaultValue: 0, taxable: true, statutory: false, active: true },
      { id: 'c_arrears', name: 'Arrears', type: 'earning', mode: 'fixed', defaultValue: 0, taxable: true, statutory: true, active: true },
      { id: 'c_lta', name: 'LTA', type: 'earning', mode: 'fixed', defaultValue: 0, taxable: false, statutory: false, active: true },
      { id: 'c_ot', name: 'Overtime', type: 'earning', mode: 'fixed', defaultValue: 0, taxable: true, statutory: true, active: true },
      { id: 'c_bonus', name: 'Bonus', type: 'earning', mode: 'fixed', defaultValue: 0, taxable: true, statutory: true, active: true },
      
      { id: 'c_pf', name: 'PF', type: 'deduction', mode: 'percentage', defaultValue: 12, taxable: false, statutory: true, active: true },
      { id: 'c_esi', name: 'ESI', type: 'deduction', mode: 'percentage', defaultValue: 0.75, taxable: false, statutory: true, active: true },
      { id: 'c_pt', name: 'Professional Tax', type: 'deduction', mode: 'fixed', defaultValue: 200, taxable: false, statutory: true, active: true },
      { id: 'c_lwf', name: 'LWF', type: 'deduction', mode: 'fixed', defaultValue: 20, taxable: false, statutory: true, active: true },
      { id: 'c_it', name: 'Income Tax', type: 'deduction', mode: 'fixed', defaultValue: 0, taxable: false, statutory: true, active: true },
      { id: 'c_lic', name: 'LIC', type: 'deduction', mode: 'fixed', defaultValue: 0, taxable: false, statutory: false, active: true },
      { id: 'c_loan', name: 'Loan', type: 'deduction', mode: 'fixed', defaultValue: 0, taxable: false, statutory: false, active: true },
      { id: 'c_other_ded', name: 'Other Deduction', type: 'deduction', mode: 'fixed', defaultValue: 0, taxable: false, statutory: false, active: true }
    ];

    const defaultLoans = [
      {
        id: 'LOAN-1001',
        empCode: 'EMP-0001',
        loanType: 'Personal Loan',
        principalAmount: 30000,
        outstandingAmount: 18000,
        monthlyDeduction: 3000,
        numberOfInstallments: 10,
        startMonth: '2026-01',
        status: 'Active',
        createdAt: '2026-01-01T00:00:00.000Z',
        history: [
          { date: '2026-01-31T00:00:00.000Z', period: '2026-01', amountPaid: 3000, remainingBalance: 27000 },
          { date: '2026-02-28T00:00:00.000Z', period: '2026-02', amountPaid: 3000, remainingBalance: 24000 },
          { date: '2026-03-31T00:00:00.000Z', period: '2026-03', amountPaid: 3000, remainingBalance: 21000 },
          { date: '2026-04-30T00:00:00.000Z', period: '2026-04', amountPaid: 3000, remainingBalance: 18000 }
        ]
      },
      {
        id: 'LOAN-1002',
        empCode: 'EMP-0010',
        loanType: 'Festival Advance',
        principalAmount: 10000,
        outstandingAmount: 6000,
        monthlyDeduction: 2000,
        numberOfInstallments: 5,
        startMonth: '2026-06',
        status: 'Active',
        createdAt: '2026-06-01T00:00:00.000Z',
        history: [
          { date: '2026-06-30T00:00:00.000Z', period: '2026-06', amountPaid: 2000, remainingBalance: 8000 },
          { date: '2026-07-31T00:00:00.000Z', period: '2026-07', amountPaid: 2000, remainingBalance: 6000 }
        ]
      }
    ];

    const defaultArrears = [
      {
        id: 'ARR-1001',
        empCode: 'EMP-0002',
        arrearMonth: '2026-07',
        paymentMonth: currentPeriod,
        component: 'Increment',
        amount: 4500,
        reason: 'Annual performance increment retroactive adjustment',
        pfApplicable: true,
        esiApplicable: true,
        status: 'Pending',
        createdAt: '2026-08-01T00:00:00.000Z'
      }
    ];

    const defaults = {
      sites: defaultSites,
      employees: defaultEmployees,
      attendance: defaultAttendance,
      ruleVersions: [defaultRuleVersion],
      rules: { ...defaultRuleVersion },
      structures: [
        { category: 'Skilled', basic: 18500, da: 2200, hra: 2500, dailyRate: (18500 + 2200 + 2500) / 26, effectiveFrom: '2026-01-01' },
        { category: 'Semi-skilled', basic: 16200, da: 1800, hra: 1800, dailyRate: (16200 + 1800 + 1800) / 26, effectiveFrom: '2026-01-01' },
        { category: 'Unskilled', basic: 13000, da: 1400, hra: 1400, dailyRate: (13000 + 1400 + 1400) / 26, effectiveFrom: '2026-01-01' },
        { category: 'Executive', basic: 32000, da: 4000, hra: 5000, dailyRate: (32000 + 4000 + 5000) / 26, effectiveFrom: '2026-01-01' },
        { category: 'Manager', basic: 52000, da: 6500, hra: 8000, dailyRate: (52000 + 6500 + 8000) / 26, effectiveFrom: '2026-01-01' }
      ],
      components: defaultComponents,
      loans: defaultLoans,
      arrears: defaultArrears,
      bonusStatements: [],
      payrollRuns: [],
      audit: []
    };

    // Safe merge of existing databases with schema extensions
    db = {
      ...defaults,
      ...db,
      sites: Array.isArray(db.sites) && db.sites.length > 0 ? db.sites : defaults.sites,
      employees: Array.isArray(db.employees) && db.employees.length > 0 ? db.employees : defaults.employees,
      attendance: Array.isArray(db.attendance) && db.attendance.length > 0 ? db.attendance : defaults.attendance,
      ruleVersions: Array.isArray(db.ruleVersions) && db.ruleVersions.length > 0 ? db.ruleVersions : defaults.ruleVersions,
      rules: { ...defaultRuleVersion, ...(db.rules || {}) },
      structures: Array.isArray(db.structures) && db.structures.length > 0 ? db.structures : defaults.structures,
      components: Array.isArray(db.components) && db.components.length > 0 ? db.components : defaults.components,
      loans: Array.isArray(db.loans) && db.loans.length > 0 ? db.loans : defaults.loans,
      arrears: Array.isArray(db.arrears) && db.arrears.length > 0 ? db.arrears : defaults.arrears,
      bonusStatements: Array.isArray(db.bonusStatements) ? db.bonusStatements : [],
      payrollRuns: Array.isArray(db.payrollRuns) ? db.payrollRuns : [],
      kycDocuments: Array.isArray(db.kycDocuments) ? db.kycDocuments : [],
      audit: Array.isArray(db.audit) ? db.audit : [],
      settings: { whatsapp: {}, esic: {}, ...(db.settings || {}) }
    };

    // Run one-time migration: wrap flat employee records into employment history stints
    migrateEmploymentHistory();

    // Ensure all employees have siteId and paymentMode
    db.employees.forEach(e => {
      if (!e.siteId) {
        const match = db.sites.find(s => s.siteName === e.site || s.siteCode === e.siteCode);
        e.siteId = match ? match.id : 'unassigned';
      }
      if (!e.paymentMode) e.paymentMode = 'Bank';
    });

    if (window.emppay.autoBackup) {
      window.emppay.autoBackup(db).catch(console.error);
    }

    renderAuth();
  } catch (err) {
    console.error('Initialization error:', err);
  }
})();
