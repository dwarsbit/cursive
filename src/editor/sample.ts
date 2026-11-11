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

/** The project a new visitor starts with: a few pages, one with every block. */
export const SAMPLE_PAGE = "Thesis/Pilot study plan.md";

export const SAMPLE_PROJECT: Project = {
  name: "Research notes",
  folders: ["Thesis", "Thesis/Literature", "Meeting notes"],
  pages: {
    [SAMPLE_PAGE]: PILOT,
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
