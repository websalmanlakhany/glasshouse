// Strict ES5 - node v0.12.2 on webOS 4 (LG OLED B8) has no ES6 support.
/*
 * Typing into the TV from a phone, as LG's ThinQ app does: the TV's keyboard
 * service (MaliitServer, com.webos.service.ime) says when a text field gains
 * or loses focus, and takes text for the field that has it.
 *
 * On a G4 (webOS 9.2) registerRemoteKeyboard reports focus as
 * {"currentWidget":{"focus":true,"contentType":"url","hiddenText":false,...},
 * "focusChanged":true}, and every edit after it with focusChanged false.
 * insertText and sendEnterKey work from any luna-send, not only the one
 * holding the subscription. Apps that draw their own keyboard, YouTube among
 * them, report nothing and take nothing.
 */
var luna = require('./luna');

// The subscription is held only while a dashboard is asking: a child process
// for nobody would be one more for the TV to run.
var IDLE_MS = 60000;

var sub = null;
var idleTimer = null;
var field = { focus: false, contentType: '', hidden: false };

// What the dashboard polls. Starts listening, and keeps listening while asked.
function status() {
  if (!sub) {
    sub = new luna.Subscription('com.webos.service.ime/registerRemoteKeyboard', { subscribe: true }, null, {
      message: function (m) {
        var w = m && m.currentWidget;
        if (!w) return;
        field = { focus: !!w.focus, contentType: String(w.contentType || ''), hidden: !!w.hiddenText };
      },
      // A restarted subscription reports focus only when it next changes.
      close: function () { field = { focus: false, contentType: '', hidden: false }; }
    });
    sub.start();
  }
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(function () {
    idleTimer = null;
    if (sub) sub.stop();
    sub = null;
    field = { focus: false, contentType: '', hidden: false };
  }, IDLE_MS);
  return { ok: true, focus: field.focus, contentType: field.contentType, hidden: field.hidden };
}

// value: { text, enter }. The text takes the place of what the field holds.
function type(value, cb) {
  var text = value && typeof value.text === 'string' ? value.text : '';
  luna.call('com.webos.service.ime/insertText', { text: text, replace: true }, function (r) {
    if (!r || !r.returnValue) return cb({ ok: false, error: (r && r.errorText) || 'the TV did not take the text' });
    if (!value || !value.enter) return cb({ ok: true });
    luna.call('com.webos.service.ime/sendEnterKey', {}, function (e) {
      cb({ ok: !!(e && e.returnValue) });
    });
  });
}

module.exports = {
  status: status,
  type: type
};
