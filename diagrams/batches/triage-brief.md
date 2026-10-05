# Triage brief (controller → triage subagents)

Your prompt gives a batch number `B` (e.g. 006) and two chunk numbers `NN`.

Rules
- Work only inside the git worktree `C:\Users\hssh9\term-diagram-v2`. Never touch `C:\Users\hssh9\용돈벌이`. Never commit. Never run `scripts/diagrams/pipeline/batch.js`. Do NOT run `check.js` on triage output (it is for specs, not triage). No /tmp or shared scratch; if you need scratch use `C:/Users/hssh9/AppData/Local/Temp/claude/tri-B/NN/`.

For each chunk, in order (finish and write one chunk's output before starting the next):
1. Read `diagrams/prompts/triage.md` fully (once) and follow it exactly.
2. Input: `diagrams/batches/B/triage/in-NN.json`. Read EVERY field of every item's `page` (definition, easy, why, usage, deep, cautions …), not only the definition. Judge each item on its own; do not batch-copy reasons.
3. Output: `diagrams/batches/B/triage/out-NN.json` — a JSON array, one object per input item, input order, in the format triage.md specifies (`confidence` is only "high" or "low"; `missing_fn` is a non-empty string or null). Roughly 10–20% yes is normal; when unsure, no.
4. Validate: `node -e "const a=JSON.parse(require('fs').readFileSync('diagrams/batches/B/triage/out-NN.json','utf8'));const i=JSON.parse(require('fs').readFileSync('diagrams/batches/B/triage/in-NN.json','utf8')).items;if(a.length!==i.length||a.some((x,k)=>x.slug!==i[k].slug))throw new Error('mismatch');console.log('ok',a.length)"`.

Final report: ONE line only — `yes X / no Y` totals. Nothing else.
