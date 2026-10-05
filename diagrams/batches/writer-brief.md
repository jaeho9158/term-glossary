# Writer brief (controller → write subagents)

Your prompt gives a batch number `B` (e.g. 006) and a list of chunk numbers `NN`.

Rules
- Work only inside the git worktree `C:\Users\hssh9\term-diagram-v2`. Never touch `C:\Users\hssh9\용돈벌이`. Never commit. Never run `scripts/diagrams/pipeline/batch.js`. No /tmp or shared scratch; if you need scratch use `C:/Users/hssh9/AppData/Local/Temp/claude/write-B/NN/`.

For each chunk, in order:
1. Read `diagrams/prompts/write.md` and `diagrams/README.md` fully (once) and follow them exactly. Read each item's `style` file.
2. Input: `diagrams/batches/B/write/in-NN.json`. For every item write `diagrams/specs/<slug>.json` (`reviewed: false`). Read every field of the page body; the diagram must be supported by it.
3. Renderer limits to respect: plot has no step / U-shape / exponential-growth / piecewise functions and no horizontal lines, `inverted_u` is a symmetric Gaussian that never reaches 0, shade cannot fill between two curves; venn has no nesting; cycle is one-directional; chain/procedure need explicit edges. If the assigned type cannot express the intent, choose another type that can, or skip the item.
4. Run `node scripts/diagrams/check.js diagrams/specs/<slug>.json` for every spec until it prints OK (no overlap warnings either).
5. If you skip an item or rely on knowledge outside the page body, append one line with
   `printf '%s\n' '- [bB/NN] <slug>: <what and why>' >> diagrams/batches/B/uncertain.md`
6. If the PAGE BODY itself has a factual error, append one line with
   `printf '%s\n' '- [bB/NN] <slug>: <issue>' >> diagrams/batches/page-content-issues.md`
   (append only; never rewrite these files).

Final report: ONE line only — `written X / skipped Y`. Nothing else.
