# Fact research brief 2: facts about the age itself

"The Echo of Life" shows one short fact under each age, 0 to 122. The site owner wants **fewer "person X did Y at this age" milestones** and **more facts about the age itself**.

Examples they liked:
- "27 is the average age of a mother at her first child's birth (US, 2024)."
- "The brain's white matter reaches its greatest volume at about 28."

**Aim for facts where this age is the answer:** an average, a median, a peak, a turning point, a legal threshold, a custom, or a count.

## What to look for, by type (roughly in order of preference)
1. **Averages and medians that land on this age.** Examples:
   - age at first child, first marriage, leaving home, first home, retirement, grandparenthood;
   - the median age of a country or of the world;
   - the average age of people in a job, of Olympic athletes in a sport, of first-time voters;
   - the median age of Nobel laureates in a field.
2. **Peaks and turning points in body and mind at this age.** Examples:
   - brain-structure peaks (Bethlehem et al., Nature 2022, has many);
   - bone mass, muscle, height, hearing range, voice;
   - cognitive peaks by skill (Hartshorne & Germine 2015; Germine et al. 2011 for face memory);
   - vocabulary, sleep, emotional well-being;
   - averages for when something happens (for example, the average age when the eye's lens starts to stiffen).
3. **Laws and rights that begin at this age, in named countries:** voting, driving, marriage, standing for office (US House 25, Senate 30, President 35), leaving school, retirement or pension ages.
4. **Customs and names for this age:**
   - coming-of-age ceremonies, such as the quinceañera at 15, bar mitzvah at 13, bat mitzvah at 12, and Japan's coming-of-age day;
   - milestone birthdays, such as Korea's hwangap at 60 and Japan's kanreki at 60, kiju at 77, beiju at 88, sotsuju at 90, hakuju at 99, chaju at 108 and koju at 111;
   - special greetings or gifts at this age from governments or monarchs.
5. **Counts of people at this age**, for example how many people worldwide or in a named country are this age. The UN World Population Prospects publishes single-year population by age.
6. **For ages 105 and above**, where population statistics run out, frame facts around the age itself. Examples:
   - "105 to 109 is called semi-supercentenarian."
   - "116 is the greatest age any man has been verified to reach."
   - "Fewer than N people in verified history have reached 117."
   - "119 is the greatest age verified in Japan."

   A named person may appear, but **the age is the subject of the sentence**, not the person's achievement.

## Avoid
- Anecdotes about a person's achievement at an age (the old style).
- Death rates, survival odds, and disease or illness statistics. The site has its own ending.
- Advice, "should", exclamation marks, "you", and "did you know".
- Starting a fact with "At N" (the age is already shown in huge type above it).
- Facts that are only loosely tied to the age (for example, a statistic for ages 18–64 placed at 41). A range is acceptable only if the age is its centre or its defining edge, and then say so.

## Standards (unchanged from brief 1)
- **Verification:** only use pages you actually fetched this session. `evidence` is a verbatim quote from the page. `check` explains why the fact belongs at exactly this age (which table, which year, which place).
- **Length:** 40–180 characters. One idea, and one number or one named thing.
- **Tone:** present tense for general truths, past tense for dated events. Calm and specific.
- **Statistics:** name the year and the place.

## Tools
**WebSearch is not available** (the session's quota is used up), and you should not use other web search engines. Instead:
- Wikipedia's search API finds topics, and their reference lists lead you to the primary sources. Wikipedia itself is never the cited source. For example: `curl -s "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=<terms>&format=json&srlimit=5"`, then `action=parse&page=<title>&prop=externallinks`.
- Europe PMC finds papers (`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=...&format=json`), and NCBI E-utilities gives PubMed abstracts.
- Fetch primary sources directly with curl (browser User-Agent), or with WebFetch if curl is blocked. Good sources include Eurostat, OECD, UN (population.un.org), WHO, CDC/NCHS, ONS, national statistics offices, government law pages, NIH, and journal pages.
- Keep downloads in your own scratchpad subfolder only.

## Output
Write a JSON array to your output file, in the same schema as before:

```json
[{ "age": 13, "candidates": [ { "text": "...", "source": {"label": "...", "url": "https://..."}, "kind": "body|mind|world|numbers|people", "evidence": "...", "check": "..." } ] }]
```

- Give **two candidates per age** where you can, and at least one.
- Candidates you are given as "existing alternates" may be reused if they meet this brief. They must still be verified, and you can rewrite their text to make the age the subject.
- Re-open the file at the end and check that it is valid JSON, covers every age, and has every text at 180 characters or fewer.
