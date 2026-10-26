// The Remote tab: the Control tab's own controls on one screen, the ones used
// less often behind a sheet from the foot of the page.

/*
 * A control is moved here, not copied: the readouts fill each one by id, and a
 * second copy of a button would be a second lot of state to keep in step.
 * Where it came from is remembered so it can go back when the tab is left.
 */
function remoteBorrow(el, into) {
  if (!el || !into) return;
  if (!el._rmtHome) el._rmtHome = { parent: el.parentNode, next: el.nextSibling };
  into.appendChild(el);
}
function remoteReturn(el) {
  const home = el && el._rmtHome;
  if (home) home.parent.insertBefore(el, home.next);
}

// Each key along the top of the tab, and the control its sheet shows.
const RMT_SHEETS = {
  panel:   { title: () => t('ctl.panel', 'Panel'),            ids: ['pwbtns', 'panelbtns'] },
  source:  { title: () => t('ctl.source', 'Source'),          ids: ['inputs'] },
  apps:    { title: () => t('tab.apps', 'Apps'),              ids: ['apps'] },
  sound:   { title: () => t('ctl.sound', 'Sound'),            ids: ['soundset'] },
  picture: { title: () => t('ctl.picture', 'Picture'),        ids: ['pictureset'] },
  url:     { title: () => t('ctl.openUrl', 'Open a web page'), ids: ['urlset'] },
  keyboard: { title: () => t('rmt.kb', 'Keyboard'),          ids: ['kbset'] }
};
let rmtSheet = null;

function openRemoteSheet(key) {
  const sheet = RMT_SHEETS[key], box = q('rmt-sheet'), body = q('rmt-sheet-body');
  if (!sheet || !box || !body) return;
  if (rmtSheet === key) return closeRemoteSheet();
  closeRemoteSheet();
  rmtSheet = key;
  q('rmt-sheet-title').textContent = sheet.title();
  // Not what the Control tab hides: power, where config.json switches it off.
  sheet.ids.forEach(id => {
    const el = q(id);
    if (el && !el.parentElement.closest('[hidden]:not(.panel)')) remoteBorrow(el, body);
  });
  box.hidden = false;
  document.querySelectorAll('#remotepane [data-sheet]').forEach(b =>
    b.classList.toggle('on', b.dataset.sheet === key));
  const first = body.querySelector('button:not([disabled]), input, select');
  if (first) first.focus();
}

function closeRemoteSheet() {
  const box = q('rmt-sheet');
  if (!rmtSheet || !box) return;
  RMT_SHEETS[rmtSheet].ids.forEach(id => remoteReturn(q(id)));
  rmtSheet = null;
  box.hidden = true;
  document.querySelectorAll('#remotepane [data-sheet]').forEach(b => b.classList.remove('on'));
}

/*
 * Touchpad or D-pad, in the same space: both at once would not fit a phone's
 * screen without scrolling, which is what this tab is for. The choice is kept
 * per browser.
 */
let rmtPad = 'touchpad';
try { if (localStorage.getItem('rmtPad') === 'dpad') rmtPad = 'dpad'; } catch (e) { /* private window */ }

function showRemotePad(which) {
  rmtPad = which === 'dpad' ? 'dpad' : 'touchpad';
  try { localStorage.setItem('rmtPad', rmtPad); } catch (e) { /* private window */ }
  const stage = q('rmt-stage');
  if (!stage) return;
  const shown = q(rmtPad === 'dpad' ? 'dpadgrid' : 'touchpad-row');
  const other = q(rmtPad === 'dpad' ? 'touchpad-row' : 'dpadgrid');
  remoteReturn(other);
  remoteBorrow(shown, stage);
  document.querySelectorAll('#remotepane [data-pad]').forEach(b => {
    const on = b.dataset.pad === rmtPad;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

/*
 * The tab fills the screen: it takes whatever height is left once the masthead,
 * the menu bar and the footer have had theirs.
 *
 * In the Android app it is a pixel taller and kept scrolled by that pixel. The
 * app reloads the page on a pull down from the very top, and with nothing to
 * scroll the page is always there, so every downward drag on the touchpad
 * became a pull and the pointer stopped.
 */
const RMT_APP_NUDGE = /Glasshouse-Android\//.test(navigator.userAgent) ? 1 : 0;
function sizeRemote() {
  const panel = q('remotepane');
  if (!panel || panel.hidden) return;
  panel.style.height = '';
  const box = panel.getBoundingClientRect();
  // The page's own height is no help: it never reports less than the screen.
  const below = document.body.getBoundingClientRect().bottom - box.bottom;
  panel.style.height = Math.max(420, window.innerHeight - box.top - below) + RMT_APP_NUDGE + 'px';
  if (RMT_APP_NUDGE && window.scrollY < RMT_APP_NUDGE) window.scrollTo(0, RMT_APP_NUDGE);
}

// Called by showTab: the borrowed controls go back to the Control tab on leaving.
function remoteSlots(on) {
  if (!q('remotepane')) return;
  const slots = [['dpadnav', 'rmt-nav'], ['playbackbtns', 'rmt-playback'], ['mute', 'rmt-mute']];
  if (!on) {
    closeRemoteSheet();
    slots.forEach(pair => remoteReturn(q(pair[0])));
    remoteReturn(q('touchpad-row'));
    remoteReturn(q('dpadgrid'));
    return;
  }
  slots.forEach(pair => remoteBorrow(q(pair[0]), q(pair[1])));
  showRemotePad(rmtPad);
  pollKeyboard();
  // After the panel is shown and filled, so there is something to measure.
  setTimeout(sizeRemote, 0);
}

/*
 * The keyboard: while this tab is open the server is asked, once a second,
 * whether a text field on the TV has focus, and the sheet opens when one
 * gains it, as LG's ThinQ app does. What is typed replaces the field's text.
 */
const KB_POLL_MS = 1000;
const KB_INPUT_TYPES = { url: 'url', email: 'email', number: 'tel', phonenumber: 'tel' };
let kbFocus = false;
let kbTimer = null;

async function pollKeyboard() {
  clearTimeout(kbTimer);
  kbTimer = null;
  if (activeTab !== 'remote') return;
  if (!document.hidden) {
    try {
      const k = await (await fetch(api('/api/keyboard'), { cache: 'no-store' })).json();
      const input = q('kb-input');
      if (k.focus && !kbFocus) {
        input.type = k.hidden ? 'password' : (KB_INPUT_TYPES[k.contentType] || 'text');
        input.value = '';
        if (rmtSheet !== 'keyboard') openRemoteSheet('keyboard');
      } else if (!k.focus && kbFocus && rmtSheet === 'keyboard' && !input.value) {
        closeRemoteSheet();
      }
      kbFocus = !!k.focus;
    } catch (e) { /* the next tick tries again */ }
  }
  if (activeTab === 'remote') kbTimer = setTimeout(pollKeyboard, KB_POLL_MS);
}

async function sendKeyboard() {
  const input = q('kb-input');
  if (!kbFocus) return showErr(t('rmt.kb.noField', 'Select a text field on the TV first.'));
  const r = await sendCommand('type', { text: input.value, enter: true });
  if (r && r.ok) {
    input.value = '';
    closeRemoteSheet();
  }
}

(function initRemote() {
  if (!q('remotepane')) return;
  document.querySelectorAll('#remotepane [data-sheet]').forEach(b =>
    b.addEventListener('click', () => openRemoteSheet(b.dataset.sheet)));
  document.querySelectorAll('#remotepane [data-pad]').forEach(b =>
    b.addEventListener('click', () => showRemotePad(b.dataset.pad)));
  q('rmt-sheet-back').addEventListener('click', closeRemoteSheet);
  q('rmt-sheet-x').addEventListener('click', closeRemoteSheet);
  q('kb-form').addEventListener('submit', e => { e.preventDefault(); sendKeyboard(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeRemoteSheet(); });
  window.addEventListener('resize', sizeRemote);
  if (RMT_APP_NUDGE) {
    window.addEventListener('scroll', () => {
      if (activeTab === 'remote' && window.scrollY < RMT_APP_NUDGE) window.scrollTo(0, RMT_APP_NUDGE);
    }, { passive: true });
  }
})();
