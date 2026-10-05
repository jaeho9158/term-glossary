# Reviewer brief (controller → review subagents)

You are an independent diagram reviewer. Your prompt gives a batch number `B` (e.g. 003) and one or two chunk numbers `NN`.

Rules
- Work only inside the git worktree `C:\Users\hssh9\term-diagram-v2`. Never touch `C:\Users\hssh9\용돈벌이`. Never commit. Never run `scripts/diagrams/pipeline/batch.js`. No /tmp or shared scratch; if you need scratch use `C:/Users/hssh9/AppData/Local/Temp/claude/rev-B/NN/`.

For each chunk, in order (finish and write the output of one chunk completely before starting the next):
1. Read `diagrams/prompts/review.md` fully (once) and follow it exactly.
2. Input: `diagrams/batches/B/review/in-NN.json` (also read its `prompt`/`readme` fields). For every item, open ALL 3 PNGs (desktop, mobile, dark) with the Read tool and compare the diagram with the page body. Be strict: factual errors, content not supported by the body, overlapping/clipped/unreadable labels, misleading arrows → fix the spec if a fix is clear (then run `node scripts/diagrams/check.js <spec file>` until it passes), otherwise drop.
3. Output: `diagrams/batches/B/review/out-NN.json` in the format review.md specifies, one entry per input item, in input order. Validate with `node -e "JSON.parse(require('fs').readFileSync('diagrams/batches/B/review/out-NN.json','utf8'))"`.
4. If the PAGE BODY itself has a factual error, append one line per issue with
   `printf '%s\n' '- [bB/NN] <slug>: <issue>' >> diagrams/batches/page-content-issues.md`
   (append only; never rewrite that file).

Final report: ONE line only — `pass X / fixed Y / dropped Z` totals. Nothing else.
