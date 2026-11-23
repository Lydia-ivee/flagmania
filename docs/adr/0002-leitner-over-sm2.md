# 2. Leitner boxes instead of SM-2

- Status. Accepted
- Date. 23 November 2026

## Context

Flagmania needs a spaced repetition scheduler. Missed items should come back soon and known items should come back rarely.

The best-known algorithm is SM-2, used by Anki. It keeps an ease factor per item and grows each interval by that factor. Leitner boxes are older and simpler. Each item sits in a numbered box and each box has a fixed review interval.

## Decision

Use five Leitner boxes with fixed intervals of the same session, 1 day, 3 days, 7 days and 21 days. A correct answer moves an item up one box and a miss sends it back to box 1.

Two rules sit on top. A correct answer at true or false, or from two options, can lift an item no higher than box 2, since it could be a guess. Format tier moves up or down with each answer, separately from the box.

## Consequences

### Good

- The whole scheduler fits in one short file and a reader can check it against a table.
- Every state is one of a handful of boxes, which makes the progress screen easy to draw and the rules easy to test.
- Intervals are whole days from local midnight, so items due "tomorrow" are ready for the morning commute.
- No ease factors or tuning constants to explain or get wrong.

### Bad

- Fixed intervals ignore how hard each item is for this learner. SM-2 would space easy flags further apart sooner.
- 195 flags at 8 new a session takes about 25 sessions to see once. This is a setting, not a limit of the algorithm.

## Revisit when

The answer log (planned for the progress screen) holds enough history to compare retention per box. If items in box 5 are often missed, the intervals or the algorithm should change.
