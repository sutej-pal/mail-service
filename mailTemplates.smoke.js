/**
 * Quick check that mail-templates render without throwing.
 * Run: node mailTemplates.smoke.js
 */
const assert = require("node:assert/strict");
const {
  buildOtpMail,
  buildNamedMail,
  sanitizeHttpUrl,
} = require("./mailTemplates");

const signup = buildOtpMail({ purpose: "signup", token: "123456" });
assert.match(signup.subject, /Confirm/);
assert.match(signup.html, /123456/);
assert.match(signup.html, /What's next/);

const recovery = buildOtpMail({ purpose: "recovery", token: "654321" });
assert.match(recovery.subject, /Reset/);
assert.doesNotMatch(recovery.html, /What's next/);

const welcome = buildNamedMail("welcome", { displayName: "Ada" });
assert.match(welcome.text, /Ada/);

const invite = buildNamedMail("invite-group", {
  inviterName: "Ada",
  groupName: "Trip\r\nBcc: evil@x.com",
  link: "https://example.com/invite/x",
});
assert.doesNotMatch(invite.subject, /\r|\n/);
assert.match(invite.subject, /Trip/);
assert.match(invite.html, /https:\/\/example\.com\/invite\/x/);

const badLink = buildNamedMail("invite-friend", {
  inviterName: "Ada",
  link: "javascript:alert(1)",
});
assert.equal(sanitizeHttpUrl("javascript:alert(1)"), "");
assert.doesNotMatch(badLink.html, /javascript:/);

const reminder = buildNamedMail("reminder", {
  body: "Hi <script>alert(1)</script>\nLine2",
  note: "Note <b>x</b>",
  bodyHtml: "<script>owned</script>",
  noteBlockHtml: "<script>owned</script>",
});
assert.match(reminder.html, /&lt;script&gt;/);
assert.doesNotMatch(reminder.html, /<script>owned/);
assert.match(reminder.html, /Line2/);

console.log("mailTemplates.smoke.js OK");
