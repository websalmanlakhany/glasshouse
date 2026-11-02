// Strict ES5 - node v0.12.2 on webOS 4 (LG OLED B8) has no ES6 support.
/*
 * The dashboard's D-pad and OK held down as the remote's keys are: pressed
 * when the finger goes down, repeating while it stays, released when it
 * lifts. The network input service's sendKeyCode only taps, so a held OK
 * never reached an app as a long press and a held arrow came as slow,
 * separate taps.
 *
 * Measured on a G4 (webOS 9) in Nuvio: a key-down written to the
 * "LGE Network Input" device and released 1.5 s later opened its long-press
 * menu. The TV does not repeat a key written there, so a held arrow moved one
 * step; with repeats (value 2) every 50 ms after 400 ms it seeked as fast as
 * the remote.
 *
 * The dashboard renews a hold while the button is down. One it stops
 * renewing, a phone locked or a lost connection, is released here.
 */
var fs = require('fs');
var allocBuffer = require('./util').allocBuffer;
var findDevice = require('./pointer').findDevice;

var DEVICE = 'LGE Network Input';
var KEYS = { up: 103, down: 108, left: 105, right: 106, ok: 28 };
var EV_SYN = 0, EV_KEY = 1;
var REPEAT_DELAY_MS = 400;
var REPEAT_MS = 50;
var LEASE_MS = 1000;

var devicePath = null;
var fd = null;
// The key down now: { key, code, repeat, lease }.
var held = null;

function event(type, code, value) {
  var b = allocBuffer(16);
  b.writeUInt16LE(type, 8);
  b.writeUInt16LE(code, 10);
  b.writeInt32LE(value, 12);
  return b;
}

function writeKey(code, value) {
  fs.writeSync(fd, event(EV_KEY, code, value), 0, 16, null);
  fs.writeSync(fd, event(EV_SYN, 0, 0), 0, 16, null);
}

function closeDevice() {
  try { fs.closeSync(fd); } catch (e) {}
  fd = null;
}

// A string saying why the device cannot be written, or null.
function openDevice() {
  if (fd !== null) return null;
  var path = devicePath;
  if (!path) {
    try { path = findDevice(fs.readFileSync('/proc/bus/input/devices', 'utf8'), DEVICE); } catch (e) {}
  }
  if (!path) return 'no ' + DEVICE + ' input device on this TV';
  try {
    fd = fs.openSync(path, 'w');
  } catch (e) {
    return path + ': ' + e.message;
  }
  return null;
}

function release() {
  if (!held) return;
  var h = held;
  held = null;
  clearTimeout(h.repeat);
  clearInterval(h.repeat);
  clearTimeout(h.lease);
  try { writeKey(h.code, 0); } catch (e) { closeDevice(); }
}

function renewLease() {
  clearTimeout(held.lease);
  held.lease = setTimeout(release, LEASE_MS);
}

/*
 * value.key is one of KEYS; value.down presses it or, false, lets it go.
 * value.renew keeps a hold going and does nothing once it has ended, so a
 * renewal arriving after the release cannot press the key again.
 */
function hold(value, cb) {
  var key = value && String(value.key);
  if (!KEYS.hasOwnProperty(key)) return cb({ ok: false, error: 'unknown key: ' + key });
  if (!value.down) {
    if (held && held.key === key) release();
    return cb({ ok: true });
  }
  if (held && held.key === key) {
    renewLease();
    return cb({ ok: true });
  }
  if (value.renew) return cb({ ok: true });
  release();
  var why = openDevice();
  if (why) return cb({ ok: false, noDevice: true, error: 'keyhold: ' + why });
  var code = KEYS[key];
  try {
    writeKey(code, 1);
  } catch (e) {
    closeDevice();
    return cb({ ok: false, error: 'keyhold: ' + e.message });
  }
  var h = held = { key: key, code: code, repeat: null, lease: null };
  // OK is held without repeats: that alone opened the menu, and a repeated
  // OK could be taken as more presses.
  if (key !== 'ok') h.repeat = setTimeout(function () {
    h.repeat = setInterval(function () {
      try { writeKey(code, 2); } catch (e) { release(); closeDevice(); }
    }, REPEAT_MS);
  }, REPEAT_DELAY_MS);
  renewLease();
  cb({ ok: true });
}

// opts.device names the event device to write, in place of looking it up.
function init(opts) {
  release();
  closeDevice();
  devicePath = (opts && opts.device) || null;
}

module.exports = {
  init: init,
  hold: hold,
  release: release,
  KEYS: KEYS,
  DEVICE: DEVICE
};
