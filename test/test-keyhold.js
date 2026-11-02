/**
 * test/test-keyhold.js - A D-pad key held down, repeated and let go
 */

var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var keyhold = require('../server/lib/keyhold');

console.log('Running test-keyhold.js ...');

function keyEvents(file) {
  var buf = fs.readFileSync(file), list = [];
  for (var i = 0; i + 16 <= buf.length; i += 16) {
    if (buf.readUInt16LE(i + 8) === 1) list.push([buf.readUInt16LE(i + 10), buf.readInt32LE(i + 12)]);
  }
  return list;
}

var dev = path.join(os.tmpdir(), 'test-keyhold-' + process.pid);
fs.writeFileSync(dev, '');
keyhold.init({ device: dev });
function ok(r) { assert.strictEqual(r.ok, true, JSON.stringify(r)); }

keyhold.hold({ key: 'menu', down: true }, function (r) { assert.strictEqual(r.ok, false); });
// A renewal with nothing held presses nothing.
keyhold.hold({ key: 'ok', down: true, renew: true }, ok);
keyhold.hold({ key: 'ok', down: true }, ok);
keyhold.hold({ key: 'ok', down: true, renew: true }, ok);

setTimeout(function () {
  keyhold.hold({ key: 'ok', down: false }, ok);
  assert.deepEqual(keyEvents(dev), [[28, 1], [28, 0]]);
  console.log('  ✓ OK is pressed and let go, with no repeats in between');

  keyhold.hold({ key: 'right', down: true }, ok);
  setTimeout(function () {
    keyhold.hold({ key: 'right', down: true, renew: true }, ok);
    keyhold.hold({ key: 'right', down: false }, ok);
    var ev = keyEvents(dev).slice(2);
    assert.deepEqual(ev[0], [106, 1]);
    assert.deepEqual(ev[ev.length - 1], [106, 0]);
    var repeats = ev.slice(1, -1);
    assert.ok(repeats.length >= 2 && repeats.length <= 5, repeats.length + ' repeats');
    repeats.forEach(function (e) { assert.deepEqual(e, [106, 2]); });
    console.log('  ✓ A held arrow repeats after 400 ms, then is let go');

    // Not renewed: let go by the server.
    keyhold.hold({ key: 'left', down: true }, ok);
    setTimeout(function () {
      var last = keyEvents(dev).pop();
      assert.deepEqual(last, [105, 0]);
      keyhold.init({});
      fs.unlinkSync(dev);
      console.log('  ✓ A hold no longer renewed is let go');
    }, 1100);
  }, 560);
}, 500);
