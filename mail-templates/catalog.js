/**
 * Mail template catalog — subjects and file bindings.
 * Copy/HTML bodies live as files under ./mail-templates/.
 * Branded card shell: card-layout.html (see buildCardMail in mailTemplates.js).
 */
module.exports = {
  otp: {
    signup: {
      subject: "Confirm your SplitEase account",
      fromName: "SplitEase",
      textFile: "otp-signup.txt",
      useLayout: true,
      pageTitle: "Verify your email — SplitEase",
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
      pageTitle: "Reset your SplitEase password",
      title: "Reset your password",
      intro:
        "Enter this 6-digit code in the SplitEase app to create a new password.",
      expiryNote: "⏱ This code expires soon.",
      footerNote:
        "If you did not request a password reset, you can safely ignore this email — your account is still secure.",
      icon: "🔒",
      showWhatsNext: false,
    },
    login: {
      subject: "Your SplitEase sign-in code",
      fromName: "SplitEase",
      textFile: "otp-login.txt",
      useLayout: true,
      pageTitle: "Sign in to SplitEase",
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
      pageTitle: "SplitEase verification",
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
      useLayout: true,
      pageTitle: "SplitEase authentication",
      title: "Authentication requested",
      introTemplate:
        "A SplitEase authentication event was requested ({{label}}). If this wasn't you, you can ignore this email.",
      footerNote:
        "If you did not request this, you can safely ignore this email.",
      icon: "🔐",
      showWhatsNext: false,
    },
  },
  transactional: {
    welcome: {
      subject: "Welcome to SplitEase",
      fromName: "SplitEase",
      textFile: "welcome.txt",
      pageTitle: "Welcome to SplitEase",
      title: "Welcome to SplitEase!",
      introTemplate:
        "Hi {{displayName}}, your onboarding has started. Finish setup in the app to start tracking shared expenses.",
      footerNote:
        "You're receiving this because you started setting up a SplitEase account.",
      icon: "👋",
      showWhatsNext: true,
    },
    "invite-friend": {
      subject: "You're invited to SplitEase",
      fromName: "SplitEase",
      textFile: "invite-friend.txt",
      pageTitle: "You're invited to SplitEase",
      title: "You're invited!",
      introTemplate: "{{inviterName}} invited you to SplitEase.",
      footerNote:
        "If you weren't expecting this invitation, you can safely ignore this email.",
      icon: "✉️",
    },
    "invite-group": {
      subjectFile: null,
      subjectTemplate: 'You\'re invited to join "{{groupName}}" on SplitEase',
      fromName: "SplitEase",
      textFile: "invite-group.txt",
      pageTitle: "Join {{groupName}} on SplitEase",
      titleTemplate: 'Join "{{groupName}}"',
      introTemplate:
        '{{inviterName}} invited you to join "{{groupName}}" on SplitEase.',
      footerNote:
        "If you weren't expecting this invitation, you can safely ignore this email.",
      icon: "👥",
    },
    reminder: {
      subject: "Reminder: settle up on SplitEase",
      fromName: "SplitEase",
      textFile: "reminder.txt",
      pageTitle: "Settle up on SplitEase",
      title: "Settle up reminder",
      intro: "",
      footerNote:
        "You're receiving this because someone sent you a balance reminder on SplitEase.",
      icon: "💸",
    },
  },
};
