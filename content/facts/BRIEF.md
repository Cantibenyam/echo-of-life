# Fact research brief: The Echo of Life

"The Echo of Life" is a quiet, artistic website. A visitor lives one life, one year per press, on a black screen with soft music. Each age from 0 to 122 shows **one** short fact beneath a large age numeral. The fact should make the visitor pause: gentle, specific, true.

## What "age N" means
Age N is the year that runs from the Nth birthday up to the (N+1)th birthday, which is months 12N to 12N+11.
- Age 0 is birth to 12 months, and it is shown at the moment of birth.
- A milestone stated in months must fall inside that window. For example, "first words around 12 months" belongs to age 1, not age 0.

## Output
Write a JSON array to the file path you were given, with one object per age in your range, in ascending order:

```json
[
  {
    "age": 34,
    "candidates": [
      {
        "text": "The fact as it will appear on screen (40-180 characters).",
        "source": { "label": "Short source name, year", "url": "https://..." },
        "kind": "body | mind | people | world | numbers",
        "evidence": "A verbatim quote from the source page containing the key figure or claim.",
        "check": "How the age was derived. For people: birth date (source), event date (source) -> exact age at event. For statistics: which table/row, which year, which place."
      },
      { "...second candidate..." }
    ]
  }
]
```

Give **exactly two candidates per age**. They should be of different `kind`s where possible, so the final editor can balance the set.

## Verification standard (strict)
- **Only use pages you actually fetched in this session.** Never write a fact from memory alone. Use WebSearch to find sources and WebFetch to read them. Where possible, also confirm the evidence quote with `curl -sL <url>` through Bash and a text search, because WebFetch may paraphrase. `evidence` must be verbatim text from the page.
- **Source preference:**
  1. WHO, UN (DESA, UNICEF, UNESCO), World Bank, OECD, national statistics offices, CDC, NIH/NCBI, NHS, peer-reviewed journals, and major museums or archives.
  2. Britannica, and major newspapers or broadcasters (BBC, NYT, Guardian, Reuters, AP).
  3. Wikipedia may guide you but is **never** the cited source.
  4. For supercentenarians, use LongeviQuest, the Gerontology Research Group (GRG), Guinness World Records, or major news coverage.
- **"Person did Y at age N":** source both the birth date and the event date, and compute the exact age in `check`.
  - If the event can't be placed relative to the birthday (for example, only the year is known and the birthday is mid-year), reject it or find another.
  - Off-by-one mistakes are the most common failure. Check twice.
- **Statistics:** give the exact figure, the year and the place (global where possible; otherwise name the country). Don't state more precision than the source has, and don't say "studies show".
- If you can't verify a candidate, drop it and find another. Never pad.

## Tone and content rules
- **Length:** at most 180 characters. One idea, carrying one number or one specific named thing.
- **Voice:** present tense for general truths, past tense for historical events. Calm and observational. Avoid "you"; stay neutral third person.
  - Good: "A newborn can already tell its mother's voice from a stranger's."
- **No:** exclamation marks, advice, emojis, "did you know", or starting with "At N" (the age is already shown in large type above).
- **Not morbid:**
  - Avoid death statistics, survival odds, disease risk and mortality rates. The site already has its own ending.
  - Illness may appear only rarely and warmly framed. Prefer candidates that aren't about illness at all.
  - No fear, and no shaming of bodies or ageing.
  - Ageing facts can be honest, but favour wonder, continuity, capability and connection.
- **Theme:** the site is about the sounds of a life. Where it's natural, favour facts about sound, hearing, voice, music, language and listening. Aim for about one in five candidates, without forcing it.
- **Variety:**
  - Mix body (development, physiology), mind (cognition, learning, emotion), people (a specific person's milestone at that age), world (how people live at this age: school, work, family, culture across countries) and numbers (a striking statistic).
  - People: diverse across regions, genders and eras; not only Western famous men. At least one of the two candidates per age should **not** be a "people" anecdote, except at ages 105 and above.
  - Don't use the same source domain for more than about a quarter of your range.
- **Accuracy over cleverness.** A modest, true fact beats a dazzling, shaky one.

## Final step
Before you finish:
1. Re-open your output file.
2. Check that it is valid JSON, that it has every age in your range, that each age has exactly two candidates, and that every text is 180 characters or fewer.
3. Fix anything that fails.
