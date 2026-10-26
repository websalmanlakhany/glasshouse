/**
 * test/test-pointer.js - The TV pointer's device and the events written to it
 */

var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var pointer = require('../server/lib/pointer');

console.log('Running test-pointer.js ...');

// Trimmed from a G4 (webOS 9): the remote's devices come first.
var DEVICES = [
  'I: Bus=0003 Vendor=0000 Product=0000 Version=0004',
  'N: Name="LGE M-RCU - Builtin [0]"',
  'H: Handlers=kbd js0 event3 ',
  'B: REL=100',
  '',
  'I: Bus=0003 Vendor=0000 Product=0000 Version=0001',
  'N: Name="ClickableMouse"',
  'H: Handlers=js5 event8 ',
  'B: REL=3',
  ''
].join('\n');

(function testFindDevice() {
  assert.strictEqual(pointer.findDevice(DEVICES, pointer.POINTER_DEVICE), '/dev/input/event8');
  assert.strictEqual(pointer.findDevice(DEVICES, pointer.WHEEL_DEVICE), '/dev/input/event3');
  assert.strictEqual(pointer.findDevice('N: Name="LGE RCU"\nH: Handlers=kbd event0\n', pointer.POINTER_DEVICE), null);
  assert.strictEqual(pointer.findDevice('', pointer.WHEEL_DEVICE), null);
  console.log('  ✓ ClickableMouse and the Magic Remote are found by name');
})();

function events(buf) {
  var list = [];
  for (var i = 0; i + 16 <= buf.length; i += 16) {
    list.push([buf.readUInt16LE(i + 8), buf.readUInt16LE(i + 10), buf.readInt32LE(i + 12)]);
  }
  return list;
}

(function testEvents() {
  var dev = path.join(os.tmpdir(), 'test-pointer-' + process.pid);
  var wheel = dev + '-wheel';
  fs.writeFileSync(dev, '');
  fs.writeFileSync(wheel, '');
  pointer.init({ pointerDevice: dev, wheelDevice: wheel });

  pointer.send({ type: 'drag' }, function (r) { assert.strictEqual(r.ok, false); });
  pointer.send({ type: 'move', dx: 3.4, dy: -9999 }, function (r) { assert.strictEqual(r.ok, true); });
  assert.deepEqual(events(fs.readFileSync(dev)), [[2, 0, 3], [2, 1, -400], [0, 0, 0]]);

  pointer.send({ type: 'scroll', dy: -2 }, function (r) { assert.strictEqual(r.ok, true); });
  pointer.send({ type: 'scroll', dy: 99 }, function (r) { assert.strictEqual(r.ok, true); });
  var wheelEvents = events(fs.readFileSync(wheel));
  assert.deepEqual(wheelEvents.slice(0, 4), [[2, 8, -1], [0, 0, 0], [2, 8, -1], [0, 0, 0]]);
  assert.strictEqual(wheelEvents.length, 4 + 2 * 10);
  fs.unlinkSync(wheel);
  console.log('  ✓ A scroll is one wheel notch per step on the remote, clamped to 10');

  pointer.send({ type: 'click' }, function (r) {
    assert.strictEqual(r.ok, true);
    assert.deepEqual(events(fs.readFileSync(dev)).slice(3),
                     [[1, 272, 1], [0, 0, 0], [1, 272, 0], [0, 0, 0]]);
    fs.unlinkSync(dev);
    console.log('  ✓ A move is REL_X, REL_Y and a sync, clamped; a click presses and releases BTN_LEFT');
  });
})();
