# Recheck brief (controller → recheck subagents)

These specs were already reviewed once and the first reviewer EDITED them (`verdict: fix`) without seeing the result rendered. The PNGs you get were rendered AFTER that edit. Your job is to confirm, by looking at the pictures, that the fixed diagram is correct and readable. Your prompt gives a batch number `B` (e.g. 003) and one or two chunk numbers `NN`.

Rules
- Work only inside the git worktree `C:\Users\hssh9\term-diagram-v2`. Never touch `C:\Users\hssh9\용돈벌이`. Never commit. Never run `scripts/diagrams/pipeline/batch.js`. No /tmp or shared scratch; if you need scratch use `C:/Users/hssh9/AppData/Local/Temp/claude/recheck-B/NN/`.

For each chunk, in order (finish and write one chunk's output before starting the next):
1. Read `diagrams/prompts/review.md` fully (once) and apply the same standards.
2. Input: `diagrams/batches/B/recheck/in-NN.json`. Each item has the page body, the current spec, `first_review` (what the first reviewer changed), and 3 PNGs. Open ALL 3 PNGs (desktop, mobile, dark) with the Read tool for every item.
3. Verdict per item:
   - `pass` — the picture is correct, matches the page body, and nothing is clipped, overlapping or unreadable in any of the 3 PNGs.
   - `fix` — a small, clearly safe correction is still needed. Edit `spec_file`, run `node scripts/diagrams/check.js <spec_file>` until OK. (It will be rendered and rechecked again, so only do this when the fix is obvious.)
   - `drop` — the diagram misleads, lacks support in the body, or cannot be repaired without redrawing.
4. Output: `diagrams/batches/B/recheck/out-NN.json` — JSON array, one `{"slug","verdict","reason"}` per input item, input order. Validate with `node -e "JSON.parse(require('fs').readFileSync('diagrams/batches/B/recheck/out-NN.json','utf8'))"`.

Final report: ONE line only — `pass X / fixed Y / dropped Z` totals. Nothing else.
