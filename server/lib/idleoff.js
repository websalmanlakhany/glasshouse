/*
 * Switches the TV off after a chosen time without a button press, sooner
 * than LG allows: its own setting (noOperationAutoOff, 'time' category)
 * takes only 3, 6, 12 or 24 hours on a G4 (webOS 9), and its menu offers
 * only 4. Off until a time is chosen (config.idleOff.minutes).
 *
 * A remote key, or a command from the dashboard or Home Assistant, counts as
 * a press. When the time is up the TV shows an alert with a Stay on button,
 * and switches off two minutes later unless something is pressed.
 *
 * Strict ES5 for Node 0.12.2 on webOS 4.
 */

// 1 minute is for trying it out.
var CHOICES = [0, 1, 30, 60, 120, 180];
var CHECK_MS = 30000;
var GRACE_MS = 120000;
var WARNING = 'Nothing has been pressed for a while. The TV switches off in 2 minutes. Press any button to keep it on.';

var config = null;
var liveState = null;
/** @type {function(string, any, function(any): void): void} */
var control = function (a, v, cb) { cb({ ok: false }); };
/** @type {function(string, Object, function(any): void, string=): void} */
var luna = function (uri, p, cb) { cb(null); };
var sourceId = '';
// Starts or stops the remote's key watcher for this module.
var watchKeys = function (on) {};
var keysSupported = function () { return false; };
var now = function () { return Date.now(); };
// Runs fn after ms and returns its cancel; a test runs it when it chooses.
var later = function (fn, ms) {
  var timer = setTimeout(fn, ms);
  return function () { clearTimeout(timer); };
};
var checkTimer = null;
var lastActivity = 0;
// The warning shown and its two minutes running: { cancel, alertId }.
var pending = null;

function minutes() {
  var m = config && config.idleOff && config.idleOff.minutes;
  return CHOICES.indexOf(m) !== -1 ? m : 0;
}

function tvOn() {
  var p = (liveState && liveState.state.snapshot().power) || {};
  return p.systemOn === true;
}

function closeWarning() {
  if (!pending) return;
  pending.cancel();
  if (pending.alertId) luna('com.webos.notification/closeAlert', { alertId: pending.alertId }, function () {}, sourceId);
  pending = null;
}

function warn() {
  var mine = {
    alertId: null,
    cancel: later(function () {
      if (pending !== mine) return;
      pending = null;
      // The TV reports itself off a second or so later; until then a check
      // would warn again.
      lastActivity = now();
      console.log('idleoff: no button pressed, switching off');
      control('powerOff', null, function (r) {
        if (!r || !r.ok) console.error('idleoff: power off failed: ' + ((r && r.error) || 'no answer'));
      });
    }, GRACE_MS)
  };
  pending = mine;
  console.log('idleoff: ' + minutes() + ' minutes without a button press, warning');
  luna('com.webos.notification/createAlert', {
    sourceId: sourceId,
    message: WARNING,
    buttons: [{ label: 'Stay on' }]
  }, function (r) {
    if (r && r.returnValue && r.alertId) {
      if (pending === mine) mine.alertId = r.alertId;
      else luna('com.webos.notification/closeAlert', { alertId: r.alertId }, function () {}, sourceId);
      return;
    }
    // No alert: a toast says the same, without the button.
    control('toast', WARNING, function () {});
  }, sourceId);
}

/*
 * A button pressed, on the remote or in Glasshouse. What restarts the count
 * after a minute or more without one is logged, so a switch-off that comes
 * late can be traced.
 */
function activity(source) {
  if (minutes() && now() - lastActivity >= 60000) console.log('idleoff: count restarted by ' + source);
  lastActivity = now();
  closeWarning();
}

function check() {
  if (!minutes() || !tvOn()) {
    lastActivity = now();
    return closeWarning();
  }
  if (!pending && now() - lastActivity >= minutes() * 60000) warn();
}

function start() {
  if (checkTimer || !minutes()) return;
  lastActivity = now();
  watchKeys(true);
  checkTimer = setInterval(check, CHECK_MS);
  console.log('idleoff: switching off after ' + minutes() + ' minutes without a button press');
}

function stop() {
  if (checkTimer) { clearInterval(checkTimer); checkTimer = null; }
  watchKeys(false);
  closeWarning();
}

// For the dashboard: the time chosen, and whether the TV can do it at all.
function status() {
  return { minutes: minutes(), available: !!(config && config.allowPower) && keysSupported() };
}

function apply(m) {
  if (config) config.idleOff = { minutes: m };
  stop();
  start();
}

/**
 * @param {Object} opts
 * @param {any} opts.config the server's config
 * @param {any} opts.liveState state.init()'s result
 * @param {function(string, any, function(any): void): void} opts.control controls.doControl
 * @param {function(string, Object, function(any): void, string=): void} opts.luna
 * @param {string} opts.sourceId the app the alert is shown as
 * @param {function(boolean): void} opts.watchKeys
 * @param {function(): boolean} opts.keysSupported whether the remote's keys can be watched
 * @param {function(): number} [opts.now] for tests
 * @param {function(function(): void, number): function(): void} [opts.later] for tests
 */
function init(opts) {
  stop();
  config = opts.config;
  liveState = opts.liveState;
  control = opts.control;
  luna = opts.luna;
  sourceId = opts.sourceId;
  watchKeys = opts.watchKeys;
  keysSupported = opts.keysSupported;
  if (opts.now) now = opts.now;
  if (opts.later) later = opts.later;
}

module.exports = {
  CHOICES: CHOICES,
  init: init,
  start: start,
  stop: stop,
  apply: apply,
  check: check,
  activity: activity,
  minutes: minutes,
  status: status
};
