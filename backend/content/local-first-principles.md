---
title: "Local-first, No-account Principles"
date: 2026-04-04
description: "Practical guidance for building tools that work on your device first and ask the cloud only when necessary."
tags:
  - principles
  - architecture
---

The best local-first apps are built to work well when the network is absent, when the user wants privacy, and when data should stay under the user's control.

Some core principles we follow:

- Keep the local experience complete. The app should do useful work before it ever reaches the server.
- Respect the user's time and attention. Avoid forcing sign-in or tracking signals.
- Make synchronization optional, not mandatory. When data leaves the device, it should be explicit and reversible.

In the coming posts we will share examples of how to wire this pattern in code, how to design small sync surfaces, and how to keep the UX calm.
