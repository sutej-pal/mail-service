/**
 * Mail template catalog — subjects and file bindings.
 * Copy/HTML bodies live as files under ./mail-templates/.
 */
module.exports = {
  otp: {
    signup: {
      subject: "Confirm your SplitEase account",
      fromName: "SplitEase",
      textFile: "otp-signup.txt",
      useLayout: true,
      title: "Welcome to SplitEase!",
      intro:
        "You're almost set up. Enter this code in the app to verify your email and activate your account.",
      expiryNote: "⏱ This code expires in 10 minutes.",
      footerNote:
        "If you didn't create a SplitEase account, you can safely ignore this email.",
      icon: "👋",
      showWhatsNext: true,
    },
    recovery: {
      subject: "Reset your SplitEase password",
      fromName: "SplitEase",
      textFile: "otp-recovery.txt",
      useLayout: true,
      title: "Reset your password",
      intro:
        "Enter this 6-digit code in the SplitEase app to create a new password.",
      expiryNote: "⏱ This code expires soon.",
      footerNote:
        "If you did not request a password reset, you can safely ignore this email - your account is still secure.",
      icon: "🔒",
      showWhatsNext: false,
    },
    login: {
      subject: "Your SplitEase sign-in code",
      fromName: "SplitEase",
      textFile: "otp-login.txt",
      useLayout: true,
      title: "Sign in to SplitEase",
      intro:
        "Enter this verification code in the SplitEase app to finish signing in.",
      expiryNote: "⏱ This code expires soon.",
      footerNote:
        "If you did not try to sign in, you can ignore this email.",
      icon: "🔑",
      showWhatsNext: false,
    },
    verify: {
      subject: "Your SplitEase verification code",
      fromName: "SplitEase",
      textFile: "otp-verify.txt",
      useLayout: true,
      title: "SplitEase verification",
      intro: "Your verification code:",
      expiryNote: "⏱ Enter it in the app.",
      footerNote: "If you did not request this, you can ignore this email.",
      icon: "✅",
      showWhatsNext: false,
    },
    auth: {
      subject: "SplitEase authentication",
      fromName: "SplitEase",
      textFile: "otp-auth.txt",
      useLayout: false,
      htmlFile: null,
    },
  },
  transactional: {
    welcome: {
      subject: "Welcome to SplitEase",
      fromName: "SplitEase",
      textFile: "welcome.txt",
    },
    "invite-friend": {
      subject: "You're invited to SplitEase",
      fromName: "SplitEase",
      textFile: "invite-friend.txt",
      htmlFile: "invite-friend.html",
    },
    "invite-group": {
      subjectFile: null,
      subjectTemplate: 'You\'re invited to join "{{groupName}}" on SplitEase',
      fromName: "SplitEase",
      textFile: "invite-group.txt",
      htmlFile: "invite-group.html",
    },
    reminder: {
      subject: "Reminder: settle up on SplitEase",
      fromName: "SplitEase",
      textFile: "reminder.txt",
      htmlFile: "reminder.html",
    },
  },
};
