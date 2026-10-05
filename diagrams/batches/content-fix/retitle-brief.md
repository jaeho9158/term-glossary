# Retitle / rewrite brief (controller → one subagent per term)

A Korean glossary term page has a wrong headword (mistranslation/typo) or a body that describes a different concept than its headword. The user approved fixing it. Your prompt gives the `slug`, the decision, and notes.

Rules
- Work only inside the git worktree `C:\Users\hssh9\term-diagram-v2`. Never touch `C:\Users\hssh9\용돈벌이`. Never commit or push. Never run build scripts. Scratch only under `C:/Users/hssh9/AppData/Local/Temp/claude/content-fix/<slug>/`.
- You may edit ONLY: `terms/<slug>.html`, `en/terms/<slug>.html` (if it exists and has the same error), `diagrams/specs/<slug>.json` (if it exists). Do NOT edit terms.json, index/viewer/category/concept-map files or any other term page — report what must change there instead (the controller applies it).
- Never change the slug, file name, URLs, canonical link, or `title_en`.

Steps
1. Read `terms/<slug>.html` fully. Verify the decision against your own subject knowledge (WebSearch if genuinely unsure). If the decision is wrong, do not edit; explain in the output.
2. Apply the decision in the page: `<title>`, meta description / og / twitter tags, JSON-LD (`name`, `headline`, `description`, breadcrumb names, any alternateName), `<h1>`, breadcrumb, definition box, every body section, image alt/aria text. Keep tone (existing 문체), section structure, links, and approximate length. When sections must be rewritten, rewrite only the sentences that are wrong; the result must be factually correct and consistent with the headword. Keep at least 2 `<div class="example">` blocks.
3. Inside `<figure class="concept-diagram">…</figure>`: do not hand-edit the SVG. If `diagrams/specs/<slug>.json` contains the old headword or content that is now wrong, edit the spec text minimally and run `node scripts/diagrams/check.js diagrams/specs/<slug>.json` until OK; the controller re-inserts the figure. Set `"spec_changed": true`.
4. Use the Grep tool to find the old headword in OTHER files (path `C:\Users\hssh9\term-diagram-v2`, exclude `diagrams/batches`); list them in the output — do not edit them.
5. Output `diagrams/batches/content-fix/retitle-<slug>.json`:
   `{"slug","applied":true|false,"old_title_ko","new_title_ko","new_aliases":[...],"new_definition":"<plain text of the definition box, without the '한 줄 정의:' label>","spec_changed":false,"other_files":[{"file","old_text","new_text"}],"summary":"<what you changed, 2-4 sentences, Korean>"}`
   `new_aliases`: sensible Korean/English search aliases for the corrected headword (do not keep mistranslated forms). Validate the JSON with node.

Final report: ONE line only — `applied` or `not applied: <reason>`.
