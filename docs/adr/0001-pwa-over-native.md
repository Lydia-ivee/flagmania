# 1. A progressive web app instead of React Native or Flutter

- Status. Accepted
- Date. 23 November 2026

## Context

Flagmania has to run on a laptop and on an Android phone, and it has to work with no signal on the London Underground. It is built by one person in spare time. It is also a public portfolio project, so a visitor to the repository should be able to try it without installing anything.

Besides a progressive web app (PWA), the options were React Native and Flutter.

## Decision

Build Flagmania as a React PWA written in TypeScript and hosted on GitHub Pages. A service worker will cache everything the app needs after the first visit, and Android users can add it to their home screen from Chrome.

## Consequences

### Good

- One codebase covers laptop and phone.
- No app store account or signing keys to manage.
- The README can link to a live version that opens in a second.
- Web skills carry straight over, which keeps the project learnable.

### Bad

- iOS support for PWAs is weaker. iOS is not a target, so this is accepted.
- Browsers can clear site storage under pressure. The app will ask for persistent storage and offer export and import of progress (milestone M3).
- No access to native features such as haptics on every device. The app does not need them.
- Install prompts differ between browsers, so the README carries the install steps.

### Why not the others

- **React Native** needs Expo or a native toolchain, and a demo means installing an APK. A visitor cannot try it from the README.
- **Flutter** adds Dart, a second language to learn, and its web build is heavier than a plain React app.
