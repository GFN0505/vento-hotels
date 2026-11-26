# Changelog

User-visible changes, newest first, written for customers. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [Semantic Versioning](https://semver.org/) once the first release ships.

## [Unreleased]
### Fixed
- Text and spacing across the app were about a fifth smaller than designed; fields, checkboxes and buttons are now their intended size.
- Emails now name the product: "Confirm your email for Vento Hotels" and "Reset your Vento Hotels password".

### Added
- Bring your team in: owners and group admins invite people by email with a role and the hotels they'll see, resend or cancel invites, change someone's role or hotels, and remove them. Invited people join from the email in one step (name and password, no second confirmation email). Owners see every role's permissions and limits side by side, or one role at a time on a phone, and change a rule or limit with a reason. Every change is in the audit log. Settings appears in the sidebar for people who can use it.
- Sign in, and set up a hotel group: create your account, confirm your email, then add your group, company and first hotel. Home lists your hotels with each one's business date. Opens in light mode; works on phones. Passwords need at least 8 characters with a capital letter, a small letter, a number and a special character, with a checklist that ticks each one as you type. Forms check each field as you move on and clear the message once it's fixed, suggest a fix for mistyped email providers ("Did you mean …@gmail.com?"), warn when Caps Lock is on and show when passwords match. Passwords can be shown while typing, sign-up asks you to confirm yours, and a forgotten password can be reset by email (the link lasts 30 minutes and signs you out everywhere else).
- A better front door and shell, everywhere: every tab is titled by its screen; a "Check your inbox" screen with Resend (once a minute), "Wrong email? Start again" and "Back to sign in"; signed-in people skip sign-in and sign-up; the hotel setup form checks each name as you go, picks your state from all 36 and the FCT, and offers "Not you?" to sign out; a page that doesn't exist offers the way back; an account menu with your name, email and Sign out; the business date and connection status fit on phones; touch targets are at least 44px; a clear focus ring for keyboard users; "Can't reach Vento right now" when the connection drops, keeping what you typed. Every page is checked for accessibility in light and dark mode on desktop and phone, and the app's download size has a budget it can't exceed.
- Every change to your group's setup and permissions is recorded in an audit log that nobody can edit.
- Owners can change what each role may do and their limits (for example, front desk discounts up to 10%).
- What Vento Hotels will do, for whom, and the plan to build it in stages: the ten modules, from front desk to group analytics.
- The hotel vocabulary, statuses, business rules and the permissions matrix with limits for each role.
- Walkthroughs of a day at Kora Victoria Island: front desk morning, night audit, owner's morning, going live, a room attendant's shift, dinner service through a power cut, and a guest's stay.
- Approved designs for all 46 screens, with dark mode, phone layouts and loading, empty, error and offline states, and a screen inventory that maps them.
- The team of specialist agents and the working recipes they follow. No product features yet.
