# Product

## Register

product

## Users

Adults who bite their nails or pick at their nails, cuticles, and surrounding
skin (body-focused repetitive behaviors, usually anxiety-linked) and have
decided to stop. They are self-aware and a little embarrassed about the habit;
they have tried and failed to quit before. They
open the app once a day, typically as a quick evening ritual: one photo of both
hands, then a fast pass judging each fingertip. They are motivated by visible
progress and by not wanting to break a streak. They are *not* patients, not
children, and not looking for a clinical diagnosis. The job to be done: "hold me
accountable every day, show me I'm actually getting better, and make me care
enough to come back tomorrow."

## Product Purpose

nonyxa is a nail-biting habit tracker built on a daily photo ritual with
CV-assisted self-labeling. The user photographs both hands once a day; the
backend (MediaPipe) crops all ten fingertips; the app presents them one finger
at a time, today against yesterday, as a swipe deck. The user swipes each
fingertip — clean or damaged — building two streaks: a **clean streak**
(days since the last logged damage) and a **check-in streak** (consecutive photo
days). The labeling loop is the product *and* it bootstraps the v2 training set;
v1 ships zero ML inference beyond MediaPipe landmarks.

Success is daily return. The product wins when the swipe ritual is fast enough
to never feel like a chore, the streak is something the user is proud to protect,
and a damage day is acknowledged honestly without making the user feel judged or
driven away. The comparison view is the product; it earns disproportionate design
effort.

## Brand Personality

Three words: **honest, warm, with teeth.** nonyxa is the friend who keeps you
company while you change a hard habit, not a drill sergeant and not a
cheerleader. It tells the truth about the habit and about who you're trying to
become, and it doesn't perform serenity or flatter you.

**Register shifts by surface.** At the door — the App Store
listing and onboarding — the voice leans into the *pain* of the habit (hiding your
hands, the embarrassment, starting over again and again) and the *identity* the
user wants (the version of themselves who doesn't bite). It is cool and direct;
this is where the teeth show. Never fruity wellness softness ("a calm, gentle
way to…").

Once the user is inside the daily ritual, the register warms. On a win it is
genuinely glad for you — warm, gently celebratory, a little proud. On a damage
day it stays kind: it notes the slip plainly, without alarm or scolding, and
reminds you that yesterday counted and tomorrow is right there. Honest about the
facts and gentle about the person: specific words, no therapy jargon, no hype, no
guilt. Think a supportive coach who has seen this before and isn't worried, not a
wellness brand performing serenity and not a casino.

Teeth are never cruelty. Pain-focus means naming the truth and the goal, never
manufacturing fear, loss, or shame. The casino / dark-pattern line below holds on
every surface, especially on a slip.

This personality is operationalized into copy rules in
[`docs/COPY.md`](https://github.com/arcasoy/nonyxa/blob/main/docs/COPY.md) — the per-moment playbook (streak encouragement,
damage days, errors, onboarding), the banned-words list, and the terminology
glossary. The normative string layer every screen pulls from is
[`app/src/lib/copy.ts`](https://github.com/arcasoy/nonyxa/blob/main/app/src/lib/copy.ts); keep the two in sync the same way
DESIGN.md and the Tamagui tokens stay in sync.

## Anti-references

The design must explicitly avoid **all six** of these, because each is a way
the category — or an AI building it — usually fails:

- **Sleek tech-startup.** No dark-mode-by-default, no neon or glow on black, no
  premium-minimalist "product" sheen. This is the trap every agent falls into;
  the app should feel like a calm, human companion, not a developer tool. Warmth
  lives in the color and the copy, light is the home.
- **Clinical / medical.** No sterile health-app look — no white-coat charts,
  dermatology imagery, "condition tracking," or diagnostic framing. This is a
  habit companion, not a medical device.
- **Corporate SaaS dashboard.** No generic startup look — no flat icon-heading-
  text card grids, no hero-metric template, no gray-and-accent productivity
  sterility.
- **Casino / dark-pattern gamification.** No manipulative mechanics — no fake
  urgency, loot-box reveals, manufactured FOMO, or guilt-trip streak nags. It
  never exploits the anxiety it exists to help.
- **Childish / cartoonish.** No kids'-app feel — no bubbly primary-color toy
  palette, no mascot mugging for laughs. Friendly and rounded, but built for a
  grown-up.
- **Brand mythology.** No creative "north star," signature motif, or named
  central metaphor. The product is a habit tracker with a hex badge, and it
  describes itself that way — functionally, in terms of palette, type,
  components, and state. Feedback that recolors the badge by streak state is
  fine because it is functional; a motif the design is meant to *mean* is not.

## Design Principles

1. **The swipe deck is the product.** The daily ten-finger judgment is where the
   user spends their attention. Every other screen is in service of getting them
   to it and out of it cleanly. Spend the craft here.
2. **Celebrate loud, acknowledge gently, never shame.** Wins get warmth, a soft
   glow, and real delight. Damage days get a calm, plain, kind acknowledgment —
   honest about the reset, never alarmed and never scolding. The asymmetry is the
   brand.
3. **Warm and human, never manipulative.** Encouragement is the motivator, not
   pressure or shame. If a mechanic would feel at home in a casino, it is
   forbidden, even when it would boost a metric.
4. **Fast ritual, low friction.** A full daily pass is ten swipes. No mechanic,
   animation, or confirmation may make the ritual feel slow. Delight lives in
   moments, never in the path.
5. **Calm, not loud.** Friendly and characterful, but unhurried. Soft surfaces,
   generous space, gentle motion. The app lowers the user's shoulders; it never
   demands attention or performs for them.

## Accessibility & Inclusion

- Target **WCAG 2.1 AA**. All body text clears 4.5:1; large/UI text clears
  3:1. The token palette is verified against these thresholds.
- **Light only.** Light is the home theme — calm and approachable for the widest
  audience — and the app ignores the OS color scheme rather than following it.
  There is no dark theme (docs/DECISIONS.md, 2026-06-13).
- **Never encode meaning in color alone.** Clean / damaged must always
  carry an icon, label, or position in addition to sage / clay, for
  color-blind users and for glanceability.
- **Reduced motion is mandatory.** Every swipe, streak, and celebration
  animation needs a `prefers-reduced-motion` alternative (crossfade or instant).
  The ritual must be fully completable without motion.
- Honor large text settings; touch targets meet the 44pt minimum.
