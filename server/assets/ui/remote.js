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
  url:     { title: () => t('ctl.openUrl', 'Open a web page'), ids: ['urlset'] }
};
let rmtSheet = null;

function openRemoteSheet(key) {
  const sheet = RMT_SHEETS[key], box = q('rmt-sheet'), body = q('rmt-sheet-body');
  if (!sheet || !box || !body) return;
  if (rmtSheet === key) return closeRemoteSheet();
  closeRemoteSheet();
  rmtSheet = key;
  q('rmt-sheet-title').textContent = sheet.title();
  sheet.ids.forEach(id => remoteBorrow(q(id), body));
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

/* The tab fills the screen: it takes whatever height is left once the masthead,
   the menu bar and the footer have had theirs. */
function sizeRemote() {
  const panel = q('remotepane');
  if (!panel || panel.hidden) return;
  panel.style.height = '';
  const box = panel.getBoundingClientRect();
  // The page's own height is no help: it never reports less than the screen.
  const below = document.body.getBoundingClientRect().bottom - box.bottom;
  panel.style.height = Math.max(420, window.innerHeight - box.top - below) + 'px';
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
  // After the panel is shown and filled, so there is something to measure.
  setTimeout(sizeRemote, 0);
}

(function initRemote() {
  if (!q('remotepane')) return;
  document.querySelectorAll('#remotepane [data-sheet]').forEach(b =>
    b.addEventListener('click', () => openRemoteSheet(b.dataset.sheet)));
  document.querySelectorAll('#remotepane [data-pad]').forEach(b =>
    b.addEventListener('click', () => showRemotePad(b.dataset.pad)));
  q('rmt-sheet-back').addEventListener('click', closeRemoteSheet);
  q('rmt-sheet-x').addEventListener('click', closeRemoteSheet);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeRemoteSheet(); });
  window.addEventListener('resize', sizeRemote);
})();
