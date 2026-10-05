# Summary-field alignment brief (controller → subagents)

Term pages of a Korean glossary were corrected (factual/editorial fixes). The same terms also have short summary fields in `terms.json` (`definition`, `why`, `deeper`) that are shown in a paper-viewer popup. These summaries were written separately from the page body, so they may or may not contain the same error. Your job: for each item decide whether a summary field still carries the error that was fixed on the page, and if so give a corrected field text. Your prompt gives chunk numbers `NN`.

Rules
- Work only inside `C:\Users\hssh9\term-diagram-v2`. Never touch `C:\Users\hssh9\용돈벌이`. Do NOT edit `terms.json` or any page — you only write the output file. Never commit, push, or run build scripts.
- Input: `diagrams/batches/content-fix/summary/in-NN.json` — items `{slug, title_ko, fix:{section, before, after, reason}, fields:{definition, why, deeper}}`. `fix` describes what was corrected on the page (before/after may be abbreviated). If you need the corrected page wording, Grep `terms/<slug>.html` for a key phrase (lines are long; do not read whole files).
- For each field decide independently:
  - If the field states the same wrong fact / typo / wrong name / duplicated or truncated text that the fix addressed (or another clear factual error you are certain of), write a corrected version: change as little as possible, keep it one short paragraph in the same tone and about the same length, keep any `[[slug|표시문구]]` link markup exactly in that syntax (you may change the display text when it is the erroneous word), no HTML, no markdown.
  - Otherwise leave it out. Most fields will need no change — do not rephrase for style.
- Output: `diagrams/batches/content-fix/summary/out-NN.json` — JSON array, one object per input item, input order:
  `{"slug", "changes": {"why": "<new text>", "deeper": "<new text>", "definition": "<new text>"}, "reason": "<short Korean note, empty if no change>"}`
  where `changes` contains ONLY the fields you changed (`{}` when none).
  Validate with `node -e "const a=JSON.parse(require('fs').readFileSync('diagrams/batches/content-fix/summary/out-NN.json','utf8'));const i=JSON.parse(require('fs').readFileSync('diagrams/batches/content-fix/summary/in-NN.json','utf8'));if(a.length!==i.length||a.some((x,k)=>x.slug!==i[k].slug))throw new Error('mismatch');console.log('ok',a.length)"`.

Final report: ONE line only — `changed X items / unchanged Y`. Nothing else.
