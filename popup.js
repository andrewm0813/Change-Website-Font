'use strict';

// ─── Cross-browser API shim ───────────────────────────────────────────────
// Firefox exposes `browser`, Chrome/Edge/Opera expose `chrome`.
const api = (typeof browser !== 'undefined') ? browser : chrome;

// ─── Font catalogue ───────────────────────────────────────────────────────
const FONTS = [
  'Abel','Abril Fatface','Acme','Alegreya','Alegreya Sans',
  'Alfa Slab One','Amatic SC','Amiri','Anton','Architects Daughter',
  'Archivo','Archivo Black','Arimo','Arvo','Asap',
  'Assistant','Baloo 2','Barlow','Barlow Condensed','Bebas Neue',
  'Bitter','Cabin','Cairo','Cantarell','Caveat',
  'Chakra Petch','Changa','Cinzel','Comfortaa','Comic Neue',
  'Commissioner','Concert One','Cormorant','Cormorant Garamond','Courgette',
  'Crimson Pro','Crimson Text','Cuprum','DM Mono','DM Sans',
  'DM Serif Display','DM Serif Text','Dancing Script','Dosis','EB Garamond',
  'Encode Sans','Encode Sans Condensed','Exo','Exo 2','Fahkwang',
  'Fira Code','Fira Sans','Fira Sans Condensed','Fjalla One','Francois One',
  'Fraunces','Fredoka One','Great Vibes','Heebo','Hind',
  'IBM Plex Mono','IBM Plex Sans','IBM Plex Serif','Inconsolata','Indie Flower',
  'Inter','Josefin Sans','Josefin Slab','Jost','Julius Sans One',
  'Kanit','Karla','Kaushan Script','Khand','Kreon',
  'Lato','Lexend','Lexend Deca','Libre Baskerville','Libre Franklin',
  'Lilita One','Lobster','Lobster Two','Lora','Lusitana',
  'Manrope','Marcellus','Maven Pro','Merriweather','Merriweather Sans',
  'Montserrat','Montserrat Alternates','Mukta','Mulish','Noto Sans',
  'Noto Serif','Nunito','Nunito Sans','Open Sans','Oswald',
  'Outfit','Overpass','Oxygen','PT Mono','PT Sans',
  'PT Serif','Pacifico','Patrick Hand','Permanent Marker','Philosopher',
  'Play','Playfair Display','Playfair Display SC','Plus Jakarta Sans','Poppins',
  'Prompt','Public Sans','Quicksand','Raleway','Readex Pro',
  'Red Hat Display','Red Hat Text','Righteous','Roboto','Roboto Condensed',
  'Roboto Mono','Roboto Serif','Roboto Slab','Rokkitt','Rubik',
  'Russo One','Sacramento','Saira','Satisfy','Sen',
  'Signika','Signika Negative','Source Code Pro','Source Sans 3','Source Serif 4',
  'Space Grotesk','Space Mono','Spectral','Syne','Teko',
  'Titillium Web','Ubuntu','Ubuntu Condensed','Ubuntu Mono','Unbounded',
  'Urbanist','Varela Round','Vollkorn','Work Sans','Yanone Kaffeesatz',
  'Yeseva One','Zilla Slab',
];

// ─── State ────────────────────────────────────────────────────────────────
let state = {
  theme:        'system',   // 'light' | 'dark' | 'system'
  favorites:    [],          // string[]
  favoritesOpen: true,
  sites:        {},          // { [domain]: { rules: Rule[], forceDarkMode: bool } }
};

// Per-popup session
let currentDomain  = '';
let selectedFont   = null;   // font name highlighted in list
let isPreviewing   = false;  // preview active but not saved

// Tracks which fonts have had their preview link injected into the popup head
const loadedFonts  = new Set();

// ─── DOM refs ─────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const fontSearch      = $('font-search');
const searchClear     = $('search-clear');
const favoritesList   = $('favorites-list');
const allFontsList    = $('all-fonts-list');
const noResults       = $('no-results');
const favoritesToggle = $('favorites-toggle');
const favoritesBadge  = $('favorites-badge');
const rulesList       = $('rules-list');
const ruleTarget      = $('rule-target');
const customSelector  = $('custom-selector');
const addRuleBtn      = $('add-rule-btn');
const forceDark       = $('force-dark');
const previewBtn      = $('preview-btn');
const applyBtn        = $('apply-btn');
const resetBtn        = $('reset-btn');
const selectedHint    = $('selected-hint');
const selectedName    = $('selected-font-name');
const toastEl         = $('toast');
const domainEl        = $('current-domain');
const activeBadge     = $('active-badge');

// ─── Helpers ──────────────────────────────────────────────────────────────
function siteData() {
  if (!state.sites[currentDomain]) {
    state.sites[currentDomain] = { rules: [], forceDarkMode: false };
  }
  return state.sites[currentDomain];
}

function showToast(msg, duration = 1800) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove('show'), duration);
}

function googleFontsUrl(fontName) {
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;700&display=swap`;
}

function loadFontInPopup(fontName) {
  if (loadedFonts.has(fontName)) return;
  loadedFonts.add(fontName);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = googleFontsUrl(fontName);
  document.head.appendChild(link);
}

// ─── Apply theme ──────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
}

// ─── Lazy-load font previews (IntersectionObserver) ───────────────────────
let fontObserver = null;

function observeFontItems(container) {
  if (fontObserver) fontObserver.disconnect();
  fontObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const font = entry.target.dataset.font;
        if (font) {
          loadFontInPopup(font);
          entry.target.querySelector('.font-name').style.fontFamily = `'${font}', sans-serif`;
        }
        fontObserver.unobserve(entry.target);
      }
    });
  }, { root: $('font-list-container'), rootMargin: '60px' });

  container.querySelectorAll('.font-item[data-font]').forEach(el => fontObserver.observe(el));
}

// ─── Render font list ─────────────────────────────────────────────────────
function buildFontItem(fontName) {
  const isStarred = state.favorites.includes(fontName);
  const isSelected = selectedFont === fontName;

  const div = document.createElement('div');
  div.className = 'font-item' + (isSelected ? ' selected' : '');
  div.dataset.font = fontName;
  div.setAttribute('role', 'listitem');

  div.innerHTML = `
    <button class="star-btn ${isStarred ? 'starred' : ''}" title="${isStarred ? 'Remove from favorites' : 'Add to favorites'}" aria-label="${isStarred ? 'Remove from favorites' : 'Add to favorites'}">
      ${isStarred ? '★' : '☆'}
    </button>
    <div class="font-name-wrap">
      <span class="font-name">${fontName}</span>
    </div>
    <button class="select-btn ${isSelected ? 'selected-active' : ''}" aria-label="Select ${fontName}">
      ${isSelected ? 'Selected' : 'Select'}
    </button>
  `;

  div.querySelector('.star-btn').addEventListener('click', e => {
    e.stopPropagation();
    toggleFavorite(fontName);
  });

  div.querySelector('.select-btn').addEventListener('click', () => selectFont(fontName));
  div.addEventListener('click', () => selectFont(fontName));

  return div;
}

function renderFontList() {
  const query = fontSearch.value.trim().toLowerCase();
  const filtered = query
    ? FONTS.filter(f => f.toLowerCase().includes(query))
    : FONTS;

  // ─ Favorites ─
  favoritesBadge.textContent = state.favorites.length;
  favoritesList.innerHTML = '';

  const favFiltered = query
    ? state.favorites.filter(f => f.toLowerCase().includes(query))
    : state.favorites;

  if (favFiltered.length === 0) {
    favoritesList.innerHTML = '<div class="empty-msg">No favorites yet — star a font to save it here.</div>';
  } else {
    const frag = document.createDocumentFragment();
    favFiltered.forEach(f => frag.appendChild(buildFontItem(f)));
    favoritesList.appendChild(frag);
  }

  // ─ All fonts ─
  allFontsList.innerHTML = '';

  // Exclude already-shown favorites when showing all
  const nonFav = filtered.filter(f => !state.favorites.includes(f));
  const frag = document.createDocumentFragment();
  nonFav.forEach(f => frag.appendChild(buildFontItem(f)));
  allFontsList.appendChild(frag);

  noResults.style.display = (filtered.length === 0) ? 'block' : 'none';

  // Start lazy-loading font previews
  observeFontItems($('font-list-container'));
}

// ─── Toggle favorite ──────────────────────────────────────────────────────
function toggleFavorite(fontName) {
  const idx = state.favorites.indexOf(fontName);
  if (idx === -1) {
    state.favorites.push(fontName);
  } else {
    state.favorites.splice(idx, 1);
  }
  saveState();
  renderFontList();
}

// ─── Select font ──────────────────────────────────────────────────────────
function selectFont(fontName) {
  selectedFont = (selectedFont === fontName) ? null : fontName;
  addRuleBtn.disabled = !selectedFont;
  selectedHint.classList.toggle('visible', !!selectedFont);
  selectedName.textContent = selectedFont || '—';
  renderFontList();
}

// ─── Favorites collapse / expand ──────────────────────────────────────────
function toggleFavoritesSection() {
  state.favoritesOpen = !state.favoritesOpen;
  favoritesList.classList.toggle('collapsed', !state.favoritesOpen);
  favoritesToggle.classList.toggle('collapsed', !state.favoritesOpen);
  favoritesToggle.setAttribute('aria-expanded', state.favoritesOpen);
}

// ─── Rules ────────────────────────────────────────────────────────────────
const TARGET_LABELS = {
  '*': 'All Text',
  'body, p, span, div, li, td, th, label, blockquote': 'Body Text',
  'h1, h2, h3, h4, h5, h6': 'Headings',
  'nav, header, nav a, .nav, .navbar, .menu': 'Navigation',
  'button, .btn, input[type="button"], input[type="submit"], [role="button"]': 'Buttons',
  'a': 'Links',
  'code, pre, kbd, samp': 'Code',
};

function targetLabel(selector) {
  return TARGET_LABELS[selector] || selector;
}

function renderRules() {
  const rules = siteData().rules;
  rulesList.innerHTML = '';

  if (rules.length === 0) {
    rulesList.innerHTML = '<div class="empty-msg" style="padding:8px 0 4px">No rules yet — select a font and click <strong>+ Add Rule</strong>.</div>';
    return;
  }

  rules.forEach((rule, i) => {
    const div = document.createElement('div');
    div.className = 'rule-item';
    div.innerHTML = `
      <span class="rule-target" title="${rule.selector}">${targetLabel(rule.selector)}</span>
      <span class="rule-arrow">→</span>
      <span class="rule-font" title="${rule.font}">${rule.font}</span>
      <button class="rule-remove" title="Remove rule" aria-label="Remove rule">×</button>
    `;
    div.querySelector('.rule-remove').addEventListener('click', () => removeRule(i));
    rulesList.appendChild(div);
  });
}

function addRule() {
  if (!selectedFont) return;
  const targetVal = ruleTarget.value;
  const selector = targetVal === 'custom'
    ? (customSelector.value.trim() || 'body')
    : targetVal;

  const rules = siteData().rules;
  const existing = rules.findIndex(r => r.selector === selector);
  if (existing !== -1) {
    rules[existing].font = selectedFont;
  } else {
    rules.push({ selector, font: selectedFont });
  }

  renderRules();
  showToast(`Rule added: ${targetLabel(selector)} → ${selectedFont}`);
}

function removeRule(index) {
  siteData().rules.splice(index, 1);
  renderRules();
}

// ─── Send message to content script ──────────────────────────────────────
async function sendToContent(message) {
  try {
    const tabs = await api.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]) return false;
    // First try injecting the content script in case it's not running
    // (e.g., on pages opened before the extension was installed).
    try {
      await api.scripting.executeScript({
        target: { tabId: tabs[0].id },
        files: ['content.js'],
      });
    } catch (_) { /* already injected — ignore */ }

    return new Promise(resolve => {
      api.tabs.sendMessage(tabs[0].id, message, response => {
        if (api.runtime.lastError) resolve(false);
        else resolve(response);
      });
    });
  } catch (e) {
    return false;
  }
}

// ─── Preview ──────────────────────────────────────────────────────────────
async function preview() {
  const rules      = siteData().rules;
  const darkMode   = siteData().forceDarkMode;

  await sendToContent({ type: 'PREVIEW_FONTS',   rules });
  await sendToContent({ type: 'APPLY_DARK_MODE', enabled: darkMode });

  isPreviewing = true;
  showToast('Preview applied — click Apply & Save to keep it.');
}

// ─── Apply & save ─────────────────────────────────────────────────────────
async function applyAndSave() {
  const data = siteData();
  await sendToContent({ type: 'APPLY_FONTS',     rules: data.rules });
  await sendToContent({ type: 'APPLY_DARK_MODE', enabled: data.forceDarkMode });
  await saveState();
  isPreviewing = false;

  // Update domain badge
  const hasActive = data.rules.length > 0 || data.forceDarkMode;
  activeBadge.style.display = hasActive ? '' : 'none';

  showToast('Saved! Settings will persist on this site.');
}

// ─── Reset ────────────────────────────────────────────────────────────────
async function resetToDefault() {
  state.sites[currentDomain] = { rules: [], forceDarkMode: false };
  forceDark.checked = false;
  selectedFont = null;
  addRuleBtn.disabled = true;
  selectedHint.classList.remove('visible');
  activeBadge.style.display = 'none';

  await sendToContent({ type: 'REMOVE_FONTS' });
  await sendToContent({ type: 'APPLY_DARK_MODE', enabled: false });
  await saveState();

  renderRules();
  showToast('Reset to defaults.');
}

// ─── Storage ──────────────────────────────────────────────────────────────
async function loadState() {
  return new Promise(resolve => {
    api.storage.local.get(['theme', 'favorites', 'favoritesOpen', 'sites'], result => {
      // Defaults — theme defaults to 'dark'
      state.theme        = result.theme        ?? 'dark';
      state.favorites    = result.favorites    ?? [];
      state.favoritesOpen = result.favoritesOpen !== false; // default open
      state.sites        = result.sites        ?? {};
      resolve();
    });
  });
}

async function saveState() {
  return new Promise(resolve => {
    api.storage.local.set({
      theme:         state.theme,
      favorites:     state.favorites,
      favoritesOpen: state.favoritesOpen,
      sites:         state.sites,
    }, resolve);
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────
async function init() {
  await loadState();

  // Apply theme immediately (defaults to 'system')
  applyTheme(state.theme);

  // Apply favorites section open/closed state
  if (!state.favoritesOpen) {
    favoritesList.classList.add('collapsed');
    favoritesToggle.classList.add('collapsed');
    favoritesToggle.setAttribute('aria-expanded', 'false');
  }

  // Get current tab domain
  try {
    const tabs = await api.tabs.query({ active: true, currentWindow: true });
    if (tabs[0] && tabs[0].url) {
      const url = new URL(tabs[0].url);
      currentDomain = url.hostname || 'unknown';
    }
  } catch (_) {
    currentDomain = 'unknown';
  }

  domainEl.textContent = currentDomain || 'unknown';

  // Restore site-specific state
  const data = siteData();
  forceDark.checked = data.forceDarkMode;

  const hasActive = data.rules.length > 0 || data.forceDarkMode;
  activeBadge.style.display = hasActive ? '' : 'none';

  renderFontList();
  renderRules();

  // ── Event listeners ──

  // Theme buttons
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.theme = btn.dataset.theme;
      applyTheme(state.theme);
      saveState();
    });
  });

  // System-theme live update (when user hasn't manually overridden)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.theme === 'system') {
      applyTheme('system'); // CSS handles the rest via the media query
    }
  });

  // Search
  fontSearch.addEventListener('input', () => {
    searchClear.classList.toggle('visible', fontSearch.value.length > 0);
    renderFontList();
  });

  searchClear.addEventListener('click', () => {
    fontSearch.value = '';
    searchClear.classList.remove('visible');
    renderFontList();
    fontSearch.focus();
  });

  // Favorites toggle
  favoritesToggle.addEventListener('click', () => {
    toggleFavoritesSection();
    saveState();
  });

  // Rule target dropdown
  ruleTarget.addEventListener('change', () => {
    const isCustom = ruleTarget.value === 'custom';
    customSelector.classList.toggle('visible', isCustom);
    if (isCustom) customSelector.focus();
  });

  // Add rule
  addRuleBtn.addEventListener('click', addRule);

  // Force dark mode toggle
  forceDark.addEventListener('change', () => {
    siteData().forceDarkMode = forceDark.checked;
    // Apply immediately so user sees the toggle work live
    sendToContent({ type: 'APPLY_DARK_MODE', enabled: forceDark.checked });
  });

  // Action buttons
  previewBtn.addEventListener('click', preview);
  applyBtn.addEventListener('click', applyAndSave);
  resetBtn.addEventListener('click', resetToDefault);

  // Auto-save when popup is about to close
  window.addEventListener('beforeunload', () => {
    siteData().forceDarkMode = forceDark.checked;
    api.storage.local.set({
      theme:         state.theme,
      favorites:     state.favorites,
      favoritesOpen: state.favoritesOpen,
      sites:         state.sites,
    });
  });

  // Auto-save state when tab/window is closed from the browser side
  // (content script already applied the fonts; this persists the record)
  api.runtime?.onSuspend?.addListener?.(() => {
    api.storage.local.set({ sites: state.sites });
  });
}

// ─── Kick off ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
