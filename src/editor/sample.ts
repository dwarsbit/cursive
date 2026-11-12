import type { Project } from "@/lib/project";

const PILOT = `---
title: Pilot study plan
tags: [methods, survey, chapter 3]
status: In progress
pilot-date: 2026-11-18
---

We run the pilot with **40 students** from the second-year methods course, two weeks before the main survey. The goal is to check *timing, wording and drop-off*, not to estimate effects.

> [!note]
> Ethics approval came through on 4 November. Quote reference \`ERB-2026-118\` on the consent form and in the invitation email.

## Open tasks

- [x] Translate the consent form into Dutch
- [x] Book room B2.14 for 18 November, 13:00 to 15:00
- [ ] Shorten section 3 of the questionnaire to ==under 6 minutes==
- [ ] Send the reminder email two days before

## Timeline

| Week | Step | Who |
| --- | --- | --- |
| 46 | Final questionnaire, print 50 copies | Leon |
| 47 | Pilot session and debrief | Leon, Maya |
| 48 | Score responses, check item timing | Leon |

## Questions to settle

- Do we keep the open question at the end, or move it to the debrief?
- Which scale for item 7?
  - Five points matches the main survey
  - Seven points gives more spread in the pilot
- Paper or online? Online gives us timing per item.

<details open>
<summary>Why 40 participants?</summary>

Enough to spot items that most people skip or misread, and to estimate completion time within about a minute. The main survey needs a power analysis; the pilot does not.

</details>

> Pilot the timing, not the hypotheses. Students give up after ten minutes, whatever the incentive.

### Scoring

Each respondent gets the mean of the twelve items, ignoring missing answers:

$$
s_i = \\frac{1}{k_i} \\sum_{j} x_{ij}
$$

\`\`\`r
score <- function(df) {
  items <- df[, paste0("q", 1:12)]
  rowMeans(items, na.rm = TRUE)  # one score per respondent
}
\`\`\`
`;

const TALK = `---
title: Pilot study results
type: presentation
---

\`\`\`slide
layout: title
\`\`\`

Lab meeting, 26 November 2026

# Pilot study: what 40 students told us

Leon, survey methods group

\`\`\`notes
Thank Maya for running the second session. Keep this to ten minutes, questions at the end.
\`\`\`

---

## Why we ran a pilot

- Check timing before the main survey in December
- Find items that people skip or misread
- Test the online form on phones, not only laptops

\`\`\`notes
The ethics board asked for a pilot as well, so this was not optional.
\`\`\`

---

## Section 3 takes too long

| Section | Median minutes |
| --- | --- |
| Section 1 | 2.1 |
| Section 2 | 2.9 |
| **Section 3** | **5.2** |
| Section 4 | 1.4 |

The target for each section is under 2.5 minutes.

\`\`\`notes
Point at the third row. Everything else is fine, this one section is the problem.
\`\`\`

---

\`\`\`slide
layout: big
\`\`\`

## Almost everyone finished

# 92%

37 of 40 students completed the survey. All three drop-outs left during section 3.

\`\`\`notes
Drop-out is low, but it clusters in the same place as the timing problem.
\`\`\`

---

## Items to fix

- Item 7: the double negative confused 11 people, who asked during the session what it meant
- Item 9: “recently” is too vague; replace with “in the past four weeks”
- Item 12: the five-point scale has no neutral label in the online version
- Items 14 to 16 ask the same thing three times; keep only item 15
- Item 18: half of the phone users could not see the last answer without scrolling
- Item 21: the open question gets one-word answers; move it to the debrief
- The progress bar jumps from 40% to 75% after section 2, which made people expect a shorter survey
- The consent page links to the old privacy statement

\`\`\`notes
This slide has too much on it. Split it before Thursday.
\`\`\`

---

\`\`\`slide
layout: quote
\`\`\`

> I read question 7 three times and still wasn’t sure what you meant.

Pilot participant, debrief session

\`\`\`notes
Several people said something like this; this one is the clearest.
\`\`\`

---

## Next steps

- [x] Shorten section 3 to eight items
- [ ] Rewrite items 7, 9 and 12
- [ ] Send the revised form to the supervisor in week 49

\`\`\`notes
Ask the group whether eight items is still enough for the scale.
\`\`\`
`;

/** The project a new visitor starts with: a few pages, one with every block, and a presentation. */
export const SAMPLE_PAGE = "Thesis/Pilot study plan.md";

export const SAMPLE_PROJECT: Project = {
  name: "Research notes",
  folders: ["Thesis", "Thesis/Literature", "Meeting notes", "Talks"],
  pages: {
    [SAMPLE_PAGE]: PILOT,
    "Talks/Pilot study results.md": TALK,
    "Thesis/Chapter outline.md": `---
title: Chapter outline
status: Draft
---

1. Introduction
2. Related work
3. Methods
4. Results
5. Discussion
`,
    "Thesis/Literature/Survey fatigue.md": `---
title: Survey fatigue
tags: [literature]
---

Respondents answer with less care as a questionnaire goes on. Short instruments and a clear end help.
`,
    "Meeting notes/Supervisor, 4 November.md": `---
title: Supervisor, 4 November
---

- Ethics approval is in.
- Pilot the timing, not the hypotheses.
- [ ] Send the shortened questionnaire by Friday
`,
    "Reading list.md": `---
title: Reading list
---

- [ ] Smith 2024
- [ ] Okafor and Lind 2023
`,
  },
};
