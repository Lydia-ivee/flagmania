# 5. A custom swipe hook instead of a gesture library

- Status. Accepted
- Date. 23 November 2026

## Context

Every question in Flagmania is answered by swiping a card. The card has to follow a finger closely. Released early it springs back, and past a threshold it flies off. Buttons and arrow keys must trigger the same result.

Libraries such as `@use-gesture/react` and Framer Motion handle this well, but each adds a dependency and its own model of gestures and animation.

## Decision

Write a small hook, `useSwipe`, on top of Pointer Events. Pointer Events treat a finger and a mouse the same way, so one code path covers phone and laptop. The card moves with a CSS transform, and a CSS transition handles both the spring-back and the fly-out.

The hook returns a `commit` function so the on-screen buttons and keyboard shortcuts run the same fly-out as a real swipe.

## Consequences

### Good

- Around 120 lines with no dependency. Only `transform` changes during a drag, which the browser can animate without re-laying out the page.
- The thresholds (35% of the card width, 25% of its height) live in one place and have a plain function, `directionFor`, that can be tested alone.

### Bad

- No physics. The fly-out does not carry the speed of a quick flick. A fast short flick below the threshold springs back.
- Edge cases such as a second finger landing mid-drag are handled only by pointer capture, not tested on every device.

## Revisit when

Real use on a phone shows short flicks being rejected often. Adding a speed check to `directionFor` would be the first step before reaching for a library.
