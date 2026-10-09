# Voice & Copy

Only voice and tone rules, terminology and writing conventions, brief copy
examples, and explicit exceptions belong here. Every addition must fit one of
these categories.

## Voice and tone

**Honest, warm, with teeth. Celebrate wins loudly. Acknowledge slips gently.
Never shame.** Name what happened without judging the person.

- **Acquisition:** direct about the habit, its pain, and the identity the user
  wants. Name real stakes without manufacturing fear or guilt.
- **Daily use:** warm, plain, and kind. Encourage progress without pressure.
- **Wins:** short, specific, proud of the person's effort.
- **Slips:** acknowledge the fact calmly and offer a way forward.
- **Errors:** name the problem and give a real next step. Use technical details
  only when they help the user act.
- **Instructions:** name what to judge and how to answer. Include an accessible
  alternative to a gesture. Correct a mistake without scolding.
- **Personal questions:** use neutral options that people can say about
  themselves. Name the method that failed without blaming the person.
- **Sharing:** speak in the user's voice. Explain the achievement to someone
  who has never used the app.

## Writing rules

1. Use everyday words. Keep each line brief and specific.
2. Give each line one job. Avoid repeating the heading in the body or the
   button action in a caption.
3. Name the habit concretely: hands going to the mouth or fingers picking at
   each other.
4. Use verb + object for actions and nouns for settings. Label a view switch
   with its destination.
5. Describe only what the action or feature actually does. Never promise an
   unavailable feature, a completed purchase, or a saved check-in before success.
6. State recorded evidence without inferring a cause, a diagnosis, or guaranteed
   healing or abstinence. Two check-ins cannot establish a trend.
7. Describe logs as logged events. No logs does not mean no urges or damage.
   More logs does not establish worse behavior.
8. Name the sample behind a count or percentage. Keep the denominator consistent.
   Handle singular counts and complete samples naturally.
9. Write paid teasers as their own sentences. Give useful evidence and withhold
   the answer without revealing part of its name.
10. Describe paid benefits truthfully. Show the billed amount and billing period.
    Trial wording must name its length and the later charge, followed by “Cancel anytime”.

## Examples

| Moment | Use | Avoid |
|---|---|---|
| Win | "7 days clean" · "Longest yet" | "You're CRUSHING it!!" |
| Slip | "Back to day one. Yesterday still counted" | "You broke your streak" |
| Error | "We couldn't find your hands" · "Make sure both hands are in the frame, then take another photo" | "Error: hands_not_detected" |
| Onboarding | "Become the version of you who doesn't bite" | "A calm, gentle way to stop biting" |
| Empty state | "No photo yet for today. Take one to see it beside your last check-in" | "No data" |
| Rehearsal | "Judge today's, on top. It's damaged, so swipe left or tap Damaged" | "Wrong!" · "Swipe to continue" |
| Live nudge | "Hand at your mouth" | "Caught you" |
| Retake | "Retake" | "Not happy with this photo?" |
| Day recap | "All ten clean" · "Mostly clean" | "60% clean" · "10/10 flawless" |
| Evidence | "4 of your 9 damaged days were on a Saturday" | "Saturday causes your biting" |
| Comparison | "2 damaged, down from 6 the check-in before" | "You're improving" |
| Count | "your only damaged day" · "all 10 of your damaged days" | "1 of your 1 damaged days" |
| Paid teaser | "One fingertip has more damage than any other: 3 of your 4 damaged days. It's your" | "Your worst finger is your ri…" |
| Logged pattern | "Damage logged" | "Recovery score" |
| Paid benefit | "Which finger has the most damage" | "See your nails heal" |
| Price | "$29.99/year" · "That's $2.50/month" | "$2.50/mo" as the billed price |
| Trial | "7 days free, then $29.99/year. Cancel anytime" | "Start free trial" without its length |
| Feedback | "Help us improve" | "Submit a support ticket" |
| Share | "14 days without biting my nails" | "Show off your glow-up!" |

## Banned words and patterns

- Hype: "crush it", "level up", "supercharge", "unlock your potential",
  "seamless", and "wellness journey".
- Clinical language: "condition", "symptom", "diagnosis", "treatment",
  "relapse", and "intervention".
- Metric language: "moving the number", "move the needle", and "shift the metric".
  Name the biting, nails, or day instead.
- Pressure: streak-loss threats, fake urgency, manufactured FOMO, and guilt.
- Blame: "you failed", "invalid", and "you entered the wrong code".
- Cute error humor, scolding, and "oops".
- Unsupported statistics, causal claims, and vague "studies show" claims.
  A research reference must state the finding it supports.

## Punctuation

- No em dashes in shipped strings, this guide, or commit messages. Use a comma,
  colon, or separate sentences. A bare `"—"` is allowed as a missing-value glyph.
- No string ends with a period. Keep interior sentence breaks.
  Example: "This one grew back. Swipe right, or tap Clean".
- Keep question marks. Use at most one exclamation mark, only for a real win.

## Terminology

Use the same term for the same concept.

| Concept | Use | Avoid |
|---|---|---|
| Unharmed fingertip verdict | **clean** | healthy, good, fine |
| Harmed fingertip verdict | **damaged** | bad, hurt |
| Streak without logged damage | **clean streak** | login streak |
| Consecutive photo days | **check-in streak** | daily streak |
| Daily photos and judgments | **check-in** / **today's photo** | session, entry |
| Fingertip image | **fingertip** | crop, nail |
| Replacement fingertip photo | **retake** | redo, re-shoot |
| Comparison layouts | **Slider** / **Stacked** | progress slider |
| Account access | **sign in** | log in, enter |
| Recorded moment | **urge** / **damage** | severity, recovery |
| Recorded behavior | **bite** / **pick** | inferred behavior |
| User-defined log categories | **tags** / **sections** | context |

"Nail" is allowed for the real-world goal, such as "watch your nails grow back".
Use "bite" or "pick" in a finding only when every sampled event has that single
behavior. Otherwise, use "damage". For urge findings, use "feel urges".

## Explicit exceptions

- **Welcome:** Use one “Welcome to Nonyxa” heading with “Quit Nail Biting” as its tagline. The welcome notice says users
  agree to the Terms of Use and acknowledge the Privacy Policy when continuing.
  Keep the policy names as links beside Get started.
- **Lapse notifications (`notifications.lapse`):** the approved exception permits
  streak loss-aversion and win-back wording. It applies only to these notifications.
  First-check-in and first-comparison invitations remain free of loss framing.
  All punctuation rules still apply.
- **Day-end clock:** "Today ends in N hours M minutes" can name the day closing.
  It must not name streak loss or blame the user.

## String conventions

Every app string belongs in [`app/src/lib/copy.ts`](https://github.com/arcasoy/nonyxa/blob/main/app/src/lib/copy.ts).
Use the appropriate surface group. Use functions for dynamic strings.
Keep components free of inline user-facing strings.

If a voice rule or term changes, update affected strings in the same commit.
Add guidance here only when it fits the scope stated at the start of this file.

### Complimentary access (`copy.complimentaryAccess`)

Dev tools offer “Preview 1 month of Pro” and “Preview lifetime Pro” under “Complimentary access previews” at the bottom of the page.

An active RevenueCat promotional grant opens a notice on the home screen.
Unusual grant lengths use an approximate duration in human-scale units, prefixed with “About”.
The title names the original grant duration: “1 month of Pro, on us” or “Lifetime Pro, on us”.
Timed grants say “Enjoy full access until {date}” without an ending period.
Show the expiration date in the user's locale, without a time.
Lifetime grants say “Full access is yours to keep” without an ending period.
The copy applies to any gift and does not invent a reason for the grant.
The billing note explains that the grant requires no purchase and does not change existing billing.
The notice makes no promise about future payment requirements.
Continue records acknowledgement for that account and grant.
A later grant can open another notice.
If acknowledgement fails, Try again retries the save.
Close leaves the acknowledgement unsaved and permits another notice on a later visit.

### Social proof

The worldwide App Store average uses rating counts, including ratings without written reviews.
Name the sample as ratings, not reviews.
The user count includes accounts with at least one completed check-in and excludes internal accounts.
Round the user count down to hundreds and append a plus sign.
Use one headline: “800+ people track their nail habits with Nonyxa”.
Substitute the rounded live count. Keep the eligibility rule out of the screen.
If the count is unavailable, use “Quit biting with Nonyxa”, adapting biting to picking or biting and picking.
Show the rating without a denominator. Use one label: “14 App Store” followed by “Ratings Worldwide” on the next line.
Hide unavailable metrics and user counts below 100. Do not invent testimonials.

The developer social-proof preview uses the connected backend’s live values and the same unavailable-data fallback as onboarding.

### App access

The full-screen paywall offers Account alongside Restore, Terms, and Privacy.
The paywall leads with “Quit once and for all” and concise benefits: daily photo comparisons, urge and damage patterns,
foreground camera nudges for hand-to-mouth moments, and daily accountability.
Nudges do not imply bite detection, picking detection, or background protection.
Onboarding recognition describes insights from accumulated check-ins and logs
without presenting a separate Pro tier. Settings names Access and Get full access.
The yearly plan carries “Best value” only when its price is lower than twelve monthly payments.
Eligible trials show a checked, non-editable switch beside “Free trial enabled”, their length, and a localized zero due today.
A seven-day trial uses “Start my free week”; other lengths name their days.
The billed amount and renewal period remain visible, followed by “Cancel anytime”.
The trial timeline says Today, the reminder day, and the renewal day using the selected eligible trial's length.
Reminder wording is conditional on notifications being enabled. The renewal row names the localized plan price.
The timeline has no separate cancellation disclosure. Trial notifications explain automatic renewal and
cancellation at least 24 hours before expiry. A failed or blocked reminder is disclosed after purchase;
never promise successful delivery when scheduling or notification access failed.
After access unlocks, an unanswered notification prompt uses “A heads-up before your trial ends”
for a trial with time to schedule the reminder. Its body explains both the two-day warning and daily photo nudges.
Other access uses the daily reminder wording. Previously answered choices stay respected.
The paywall Back button returns to onboarding; it does not dismiss into the paid app.
Account opens existing sign-in and account deletion controls. Failed access
checks and unavailable plans name the connection problem and offer Try again.
Pending access checks stay behind the boot surface without a separate status caption.
Do not promise that unpaid app features remain accessible. Trial wording names
a free trial only when eligibility is confirmed for the selected product.

### Swipe rehearsal

“Your baseline is set” closes Day one immediately after capture. Day two starts with “Try tomorrow’s swipe” and ends with “That’s the swipe”.

The second example says “This one is growing back” and shows a still-short nail with modest improvement.
Do not imply complete regrowth overnight or promise a fixed recovery time.

### Capture flashlight

Capture flashlight actions use “Turn on flashlight” and “Turn off flashlight”.
Devices without a torch announce “Flashlight unavailable” on the disabled control.

### Development onboarding previews

Dev tools offer “Restart onboarding” to start a new presentation attempt in Free mode.
The action keeps the current account, saved answers, check-ins, and permission choices. The onboarding camera offers
“Skip capture” in development builds to enter the existing first-day preview
without importing photos or saving a check-in.
Development onboarding shows completed presentation steps, including capture, analytics consent, and tracking.
Notification permission comes after access unlocks, outside the onboarding journey.
Dev tools offer “Preview trial reminder” without changing notification choices.
The development paywall offers a dollar icon labeled “Dev buy” for accessibility to rehearse purchase navigation and the trial reminder.
The reminder Back arrow continues to Home and counts as Not now.
A camera with existing photos waits for Next or Skip capture instead of advancing automatically.
The internal photo review appears only for unfinished captures. Back bypasses it.

### Personal introduction

After Get started, Alex introduces the quiz through four messages: “I bit & picked my nails for 25 years”,
“Only building & using Nonyxa broke the habit”, “Take a look at my progress”, and
“Let’s understand your habit and build your daily routine”.
These are Alex's personal account, supplied by the founder, rather than a promise of results for every user.
The screen uses the shared “Next” action, enabled one message interval after the final message appears.
The picture reuses Alex's June 21 and September 18 index-finger comparison with its original dates.
The first quiz question asks “Do you bite, pick, or both?” directly above the choices.
The previous-methods quiz allows multiple choices; its option says “Willpower”, without “alone”.

### Onboarding progress

The progress bar uses “Onboarding progress” as its accessibility label.
The native progress value supplies the percentage. No visible step count accompanies the bar.
Section labels appear as uppercase chapter headings below navigation, including “About you”, “Why Nonyxa works”, “Day one”, and “Day two”.
Do not repeat a chapter heading above the body content.

### Advertising permission

The ATT explanation has no chapter eyebrow. Its title is “How did you find us?” and its single body is “With your permission, we use your advertising ID to learn which ads bring people to Nonyxa.” Preserve this approved sentence, including its ending period. One “Continue” button opens Apple's native ATT prompt when eligible; allow and deny belong to that prompt. There is no secondary explanation or “Not now” action. Previously answered or unavailable ATT continues through the existing authorization handling. Analytics consent remains a separate, unchanged choice.


### Logging rehearsal and value previews

The logging rehearsal follows “That’s the swipe”. Its header offers “Skip logging” only in development builds.
Production users complete both practice logs before continuing with Next.
Completed controls show a checkmark; the waiting control is dimmed. Neither has a caption. The prompt has no practice step label, and Next has no helper text.
The urge heading says “Catch an urge”. The instruction names the selected behavior and emphasizes it alongside “Log Urge”. Picking uses fingers picking at a nail or its surrounding skin; both behaviors include mouth and picking cues.
The damage instruction says “Press the Log Bite button now”, using Log Pick or Log Damage when those labels apply.
Emphasize that button label and “without judging yourself”.
Prompts ask users to imagine an urge, then practice a bite or pick without judgment.
The completion message asks users to keep logging so they can review when and where urges and damage come up over time.
The routine-preview chapter says “Your daily routine”.
Its headlines say “Make quitting stick”, “Discover your patterns”, and “Feel proud of your hands”, in that order. They lead with lasting consistency, self-understanding, and confidence, while the body copy explains the daily actions that support those goals.
Each preview adds one reason to continue: the check-in streak rewards returning even after damage, logs reveal recurring times and situations, and photos connect progress to the selected motivations. The final sentence reflects up to two applicable motivations so selecting many does not produce a wall of text; all answers remain saved.
The phone previews have no bottom captions or subtitles. Do not add “Example screens” or “Alex’s progress” beneath the montage.
Examples do not imply that two practice logs generate personal findings or that the founder's results are guaranteed.


### Personalized onboarding

Ask about behavior, duration, reasons for quitting, previous attempts, and a good habit, in that order. Keep the duration wheel as the second question.
Motivations allow multiple choices or continuing without a selection. Use six distinct reasons: confidence showing hands, comfort using fingers, teeth and jaw, germs, headspace, and keeping a promise to oneself. Appearance, hiding hands in photos, and holding hands are covered by the confidence option instead of separate near-duplicates. The good-habit question has one choice, including “Something else” and “Still working on one”.
Dental and jaw concerns appear only for biting or both. Hide a previously selected dental goal when the user changes to picking, but preserve it in saved answers and drafts, even when they continue or edit other motivations. Restore its selected state when they return to biting or both. Filter only visible choices and personalized explanations.
Health concerns describe the user's motivation, not a diagnosis or a promise to prevent illness or repair damage.
Use “biting”, “picking”, or “biting and picking” when naming the habit. Reserve “damage” for recorded outcomes.
Duration establishes the user’s history without predicting recovery. The previous-methods slide explains one selected method’s limitation, then the benefit of a daily record. Use the first applicable selection, so choosing many methods never creates a list to read. Gloves and bandages only help while worn, a fidget keeps hands busy without showing nail progress, and polish deters biting without supplying visible progress. Picking-only copy says Nonyxa tracks picking too. For another app, say “If you’ve only tracked streaks” instead of making a claim about every competitor. Do not assert why a particular person’s attempt failed.
Three “Why Nonyxa works” screens form one explanation: give quitting the structure of a familiar good habit, see the progress previous methods may miss, and carry daily tracking into the moments when urges happen. Use two short, complete sentences per body, up to 25 words. Keep titles brief enough for one line at the standard text size. Let text wrap naturally rather than inserting line breaks. Avoid semicolons, sentence fragments such as “Same accountability”, and extra takeaway headlines. Concision must preserve the connection between the habit, the app action, and the benefit.
An exercise or food answer does not imply that the user tracks workouts or calories. “Still working on one” and unanswered older profiles receive a direct explanation without assumed prior success.
Do not promise a custom treatment plan. Describe the daily routine that Nonyxa actually supports.
The rating invitation remains after the demonstrations. Picking-only onboarding paywalls omit the hand-to-mouth camera benefit.

The question “What’s a good habit you’re proud of?” supplies the analogy once. Later routine previews add benefits instead of repeating that analogy. Use “damage” when referring to the combined bite/pick log.

### Habit-reversal connection

The universal explanation says “Take support with you”. A clinician-to-phone illustration supplies the visual connection. The body says “Nonyxa’s tracking is based on the awareness techniques used in habit reversal training.” Nonyxa supports self-monitoring through urge logs, patterns, and photo comparisons, usable between sessions or independently. This is a specific connection to self-monitoring, not a claim that the app supplies full habit reversal training, outperforms therapy, replaces a clinician, or is clinically proven. Do not frame clinician-guided treatment as a failed quick fix or invent “accountability training” as a clinical modality.

Below this explanation, a compact study result reads “≈99%”, “fewer nail-biting episodes”, and “In one study of habit reversal training”. The source line is “Azrin et al., 1980 · 5-month follow-up”. Keep the outcome and study attribution visible beside the number, including in picking-only onboarding: the result concerns nail biting, not picking. The [original study abstract](https://www.sciencedirect.com/science/article/pii/0005796780900868) reports approximately 99% fewer nail-biting episodes with habit reversal throughout five months of follow-up in a comparison study with 97 participants. It does not report a 99% quit rate or test Nonyxa. Do not turn the number into an app result, a general success rate, a prediction, or a comparison with polish, gloves, or fidgets. The source is plain text, without a research-link detour.

Terminology is grounded in the [NHS explanation of awareness and replacement responses](https://www.nhs.uk/mental-health/conditions/skin-picking-disorder/) and the [IOCDF clinician-authored description of self-monitoring within HRT](https://iocdf.org/expert-opinions/comprehensive-behavioral-comb-treatment-for-skin-picking-and-hair-pulling-disorders/). The [American Academy of Dermatology describes bitter polish as a deterrent](https://www.aad.org/nail-care-secrets/stop-biting-nails); the copy does not promise that it always fails or that users inevitably become used to it.

## Future Hands

The green section title is “Future Hands”. The post-capture invitation uses `copy.futureHands`: “Want to see your future hands?”
with one sentence: “Generate AI previews of your future hands”.
Provider names and processing details belong in the linked Future Hands section
of the privacy policy. Do not repeat a separate consent explanation. “Not now” is the ghost action above “Agree and
generate”. The primary action is explicit permission, separate from analytics,
tracking, and the terms. A privacy link stays beside the disclosure.

The pending status is exactly “Your preview is being generated”.
The reveal uses “Picture your future” and “Your potential fingernails after breaking your habit”.
Photo descriptions (“Your photo”, “Blurred photo”, and “Illustration”) are
accessibility labels only; neither comparison shows visible photo captions. Never call
the generated result a prediction, a guaranteed outcome, an actual check-in,
or a recovery timeline. Keep “Continue” available during waiting and failure.

The development-only reveal control toggles between “Preview generation animation”
and “Show generated result” as its accessibility label.
