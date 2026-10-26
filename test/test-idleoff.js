/**
 * test/test-idleoff.js - Switching off after no button is pressed
 */

var assert = require('assert');
var idleoff = require('../server/lib/idleoff');
var StateManager = require('../server/lib/state').StateManager;

console.log('Running test-idleoff.js ...');

function setup(minutes) {
  var clock = { t: 1000000 };
  var state = new StateManager();
  state.update('power', 'systemOn', true);
  var config = { allowPower: true, idleOff: { minutes: minutes } };
  var calls = [], lunaCalls = [], waiting = [], watching = [];
  idleoff.init({
    config: config,
    liveState: { state: state },
    control: function (action, value, cb) { calls.push(action); cb({ ok: true }); },
    luna: function (uri, p, cb) {
      lunaCalls.push(uri);
      cb(uri === 'com.webos.notification/createAlert' ? { returnValue: true, alertId: 'a1' } : { returnValue: true });
    },
    sourceId: 'com.webos.app.home',
    watchKeys: function (on) { watching.push(on); },
    keysSupported: function () { return true; },
    now: function () { return clock.t; },
    later: function (fn, ms) {
      var entry = { fn: fn, ms: ms, cancelled: false };
      waiting.push(entry);
      return function () { entry.cancelled = true; };
    }
  });
  idleoff.start();
  return {
    state: state, calls: calls, lunaCalls: lunaCalls, watching: watching, config: config,
    advance: function (ms) { clock.t += ms; idleoff.check(); },
    elapse: function () {
      var due = waiting;
      waiting = [];
      due.forEach(function (e) { if (!e.cancelled) e.fn(); });
    }
  };
}

// An hour without a press: the warning, then off two minutes later.
var s = setup(60);
assert.deepEqual(s.watching, [true]);
s.advance(59 * 60000);
assert.deepEqual(s.lunaCalls, []);
s.advance(60000);
assert.deepEqual(s.lunaCalls, ['com.webos.notification/createAlert']);
s.advance(30000);
assert.strictEqual(s.lunaCalls.length, 1, 'warned once');
s.elapse();
assert.deepEqual(s.calls, ['powerOff']);
// Still reported on just after: no second warning.
s.advance(30000);
assert.strictEqual(s.lunaCalls.length, 1, 'no warning while the TV switches off');

// A press during the warning closes it and keeps the TV on.
s = setup(60);
s.advance(60 * 60000);
idleoff.activity('test');
assert.deepEqual(s.lunaCalls, ['com.webos.notification/createAlert', 'com.webos.notification/closeAlert']);
s.elapse();
assert.deepEqual(s.calls, []);
s.advance(59 * 60000);
assert.strictEqual(s.lunaCalls.length, 2, 'the hour starts again from the press');

// The remote's own event every 3 minutes is not a press.
s = setup(60);
s.advance(59 * 60000);
idleoff.keyPressed(1199);
s.advance(60000);
assert.strictEqual(s.lunaCalls.length, 1, 'key 1199 does not restart the count');
idleoff.keyPressed(28);
assert.strictEqual(s.lunaCalls[1], 'com.webos.notification/closeAlert', 'a real key does');

// A press part way through starts the hour again.
s = setup(60);
s.advance(40 * 60000);
idleoff.activity('test');
s.advance(40 * 60000);
assert.deepEqual(s.lunaCalls, []);

// Off while the TV is off, and counted from when it comes on.
s = setup(60);
s.state.update('power', 'systemOn', false);
s.advance(120 * 60000);
s.state.update('power', 'systemOn', true);
s.advance(30000);
assert.deepEqual(s.lunaCalls, []);

// Never while no time is chosen; the remote's keys are not watched.
s = setup(0);
assert.deepEqual(s.watching, []);
s.advance(600 * 60000);
assert.deepEqual(s.lunaCalls, []);
assert.deepEqual(idleoff.status(), { minutes: 0, available: true });

// A time chosen takes effect at once, and a time not offered counts as off.
idleoff.apply(1);
assert.strictEqual(idleoff.minutes(), 1);
idleoff.apply(30);
assert.strictEqual(idleoff.minutes(), 30);
s.config.idleOff.minutes = 45;
assert.strictEqual(idleoff.minutes(), 0);

idleoff.stop();
console.log('test-idleoff.js passed');
