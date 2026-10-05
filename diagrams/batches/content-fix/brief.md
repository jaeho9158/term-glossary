# Content-fix brief (controller → fix subagents)

Reviewers of concept diagrams noted suspected factual/editorial errors in the BODY TEXT of Korean glossary term pages. Your job: verify each note and, where it is right, correct the page text. Your prompt gives chunk numbers `NN`.

Rules
- Work only inside the git worktree `C:\Users\hssh9\term-diagram-v2`. Never touch `C:\Users\hssh9\용돈벌이`. Never commit, never push. Never run build scripts or `scripts/diagrams/pipeline/batch.js`. No /tmp or shared scratch; if you need scratch use `C:/Users/hssh9/AppData/Local/Temp/claude/content-fix/NN/`.
- Edit only the `file` (and `en_file`) of the items in your chunks. Do not touch `<figure class="concept-diagram">…</figure>`, scripts, ads, navigation, related-term lists, or any other page.

For each chunk, in order (finish and write one chunk's output before starting the next):
1. Input: `diagrams/batches/content-fix/in-NN.json` — items `{slug, file, en_file, issues[]}`. Each issue is a reviewer's note (in Korean), usually naming the section: definition / easy(쉽게 풀면) / why(왜 중요한가) / usage(논문에서는 이렇게 쓰입니다) / deep(조금 더 깊게 보면) / cautions(주의할 점).
2. For each item, locate the passage with Grep (the files have very long lines; avoid reading whole files when a Grep with context is enough). Decide independently whether the note is correct. The note itself may be wrong or overstated — do not apply it blindly. Use your own subject knowledge; use WebSearch only when you are genuinely unsure of a fact.
3. Verdict per item:
   - `fixed` — the error is real and you corrected it. Make the SMALLEST edit that makes the text correct: keep the page's tone (합니다체, plain explanatory Korean), length and structure; no new sections, no added hedging paragraphs, no markdown. Keep existing `<a href>` links intact where the sentence survives. If text was duplicated/repeated, remove the repetition. If text is visibly truncated (e.g. cut after a `<` character), restore the obvious intended ending only when it is unambiguous.
   - `no_change` — the note is wrong, is only a style preference, or is about classification/group metadata rather than body text.
   - `unsure` — you cannot confirm the fact, or a correct fix would need rewriting more than a couple of sentences. Leave the page untouched and explain.
4. If the wrong statement is also in the page's `<meta name="description">`, `og:description`, `twitter:description` or the JSON-LD `description`, fix those identically and set `"definition_changed": true` (derived indexes are rebuilt later by the controller).
5. If `en_file` exists and contains the same error in English, apply the equivalent minimal fix there too and set `"en_fixed": true`.
6. After editing, re-Grep the edited line to confirm the file still has balanced tags around your edit (you changed text only, never tag structure).
7. Output: `diagrams/batches/content-fix/out-NN.json` — JSON array, one object per input item, input order:
   `{"slug","verdict","section","before","after","reason","definition_changed":false,"en_fixed":false}`
   (`before`/`after` = the changed sentence(s) only, empty strings when not fixed). Validate with
   `node -e "const a=JSON.parse(require('fs').readFileSync('diagrams/batches/content-fix/out-NN.json','utf8'));const i=JSON.parse(require('fs').readFileSync('diagrams/batches/content-fix/in-NN.json','utf8'));if(a.length!==i.length||a.some((x,k)=>x.slug!==i[k].slug))throw new Error('mismatch');console.log('ok',a.length)"`.

Final report: ONE line only — `fixed X / no_change Y / unsure Z` totals. Nothing else.
