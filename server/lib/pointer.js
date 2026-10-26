// Strict ES5 - node v0.12.2 on webOS 4 (LG OLED B8) has no ES6 support.
/*
 * The TV's pointer, moved as the Magic Remote and LG's ThinQ app move it.
 *
 * Events are written to the compositor's own mouse, the "ClickableMouse"
 * input device, as injectKey writes keys to the remote's. On a G4 (webOS 9)
 * relative moves written there show and move the pointer; the same moves
 * written to "LGE Network Input" do nothing. LG's pointer socket
 * (networkinput/getPointerInputSocket) answers luna with a Unix socket that
 * closes on any connection but the SSAP gateway's, so it cannot be used.
 *
 * ClickableMouse has no wheel. Scroll goes to the Magic Remote's own device,
 * "LGE M-RCU - Builtin [0]", whose wheel events scroll what the pointer is on.
 */
var fs = require('fs');
var allocBuffer = require('./util').allocBuffer;

// Matched against the start of each input device's name.
var POINTER_DEVICE = 'ClickableMouse';
var WHEEL_DEVICE = 'LGE M-RCU';
var EV_SYN = 0, EV_KEY = 1, EV_REL = 2;
var REL_X = 0, REL_Y = 1, REL_WHEEL = 8;
var BTN_LEFT = 272;
// Between a click's press and release, so the compositor sees both.
var CLICK_HOLD_MS = 30;
// Per message from the dashboard. A phone's drag sends far less than this.
var MAX_STEP = 400;
var MAX_NOTCHES = 10;

// Paths given to init() in place of looking the devices up, and open files.
var paths = {};
var fds = {};

/*
 * The event device of the first input device whose name starts with name, in
 * /proc/bus/input/devices text, or null.
 */
function findDevice(devicesText, name) {
  var blocks = String(devicesText || '').split(/\n\s*\n/);
  for (var i = 0; i < blocks.length; i++) {
    if (blocks[i].indexOf('N: Name="' + name) < 0) continue;
    var m = /H: Handlers=[^\n]*?\b(event\d+)/.exec(blocks[i]);
    if (m) return '/dev/input/' + m[1];
  }
  return null;
}

// The open device for name, or a string saying why there is none.
function openDevice(name) {
  if (fds[name] !== undefined) return fds[name];
  var path = paths[name];
  if (!path) {
    try { path = findDevice(fs.readFileSync('/proc/bus/input/devices', 'utf8'), name); } catch (e) {}
  }
  if (!path) return 'no ' + name + ' input device on this TV';
  try {
    fds[name] = fs.openSync(path, 'w');
  } catch (e) {
    return path + ': ' + e.message;
  }
  console.log('pointer: writing to ' + path + ' (' + name + ')');
  return fds[name];
}

function event(type, code, value) {
  var b = allocBuffer(16);
  b.writeUInt16LE(type, 8);
  b.writeUInt16LE(code, 10);
  b.writeInt32LE(value, 12);
  return b;
}

function write(fd, events) {
  for (var i = 0; i < events.length; i++) fs.writeSync(fd, events[i], 0, 16, null);
}

function step(v, max) {
  var n = Math.round(Number(v));
  if (!isFinite(n)) return 0;
  return Math.max(-max, Math.min(max, n));
}

function fail(name, e, cb) {
  try { fs.closeSync(fds[name]); } catch (e2) {}
  delete fds[name];   // opened again, and looked up again, on the next message
  cb({ ok: false, error: 'pointer: ' + e.message });
}

/*
 * value.type is move (dx, dy), click, or scroll (dy wheel notches, negative
 * scrolling down).
 */
function send(value, cb) {
  var type = value && value.type;
  if (type !== 'move' && type !== 'click' && type !== 'scroll') {
    return cb({ ok: false, error: 'unknown pointer message' });
  }
  var name = type === 'scroll' ? WHEEL_DEVICE : POINTER_DEVICE;
  var fd = openDevice(name);
  if (typeof fd === 'string') return cb({ ok: false, error: 'pointer: ' + fd });
  try {
    if (type === 'move') {
      write(fd, [event(EV_REL, REL_X, step(value.dx, MAX_STEP)), event(EV_REL, REL_Y, step(value.dy, MAX_STEP)),
                 event(EV_SYN, 0, 0)]);
      return cb({ ok: true });
    }
    if (type === 'scroll') {
      // One event per notch, as the remote's wheel sends them.
      var notches = step(value.dy, MAX_NOTCHES);
      for (var i = 0; i < Math.abs(notches); i++) {
        write(fd, [event(EV_REL, REL_WHEEL, notches < 0 ? -1 : 1), event(EV_SYN, 0, 0)]);
      }
      return cb({ ok: true });
    }
    write(fd, [event(EV_KEY, BTN_LEFT, 1), event(EV_SYN, 0, 0)]);
  } catch (e) {
    return fail(name, e, cb);
  }
  setTimeout(function () {
    try {
      write(fd, [event(EV_KEY, BTN_LEFT, 0), event(EV_SYN, 0, 0)]);
    } catch (e) {
      return fail(name, e, cb);
    }
    cb({ ok: true });
  }, CLICK_HOLD_MS);
}

// opts.pointerDevice and opts.wheelDevice name the event devices to write, in
// place of looking them up.
function init(opts) {
  if (opts && opts.pointerDevice) paths[POINTER_DEVICE] = opts.pointerDevice;
  if (opts && opts.wheelDevice) paths[WHEEL_DEVICE] = opts.wheelDevice;
}

module.exports = {
  init: init,
  send: send,
  findDevice: findDevice,
  POINTER_DEVICE: POINTER_DEVICE,
  WHEEL_DEVICE: WHEEL_DEVICE
};
