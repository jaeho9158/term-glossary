function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchTerms(text, terms) {
  const results = [];

  for (const term of terms) {
    let count = 0;
    let firstStart = -1;
    let firstLength = 0;

    if (term.title_en) {
      const re = new RegExp(`\\b${escapeRegExp(term.title_en)}\\b`, "gi");
      let m;
      while ((m = re.exec(text)) !== null) {
        count++;
        if (firstStart === -1 || m.index < firstStart) {
          firstStart = m.index;
          firstLength = m[0].length;
        }
      }
    }

    if (term.title_ko) {
      let idx = text.indexOf(term.title_ko);
      while (idx !== -1) {
        count++;
        if (firstStart === -1 || idx < firstStart) {
          firstStart = idx;
          firstLength = term.title_ko.length;
        }
        idx = text.indexOf(term.title_ko, idx + term.title_ko.length);
      }
    }

    if (count > 0) {
      results.push({
        slug: term.slug,
        title_ko: term.title_ko,
        title_en: term.title_en,
        categories: term.categories,
        count,
        firstStart,
        firstLength,
      });
    }
  }

  results.sort((a, b) => b.count - a.count);
  return results;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHighlightedHtml(text, matches) {
  const spans = matches
    .filter((m) => m.firstStart >= 0)
    .sort((a, b) => a.firstStart - b.firstStart);

  const kept = [];
  let lastEnd = -1;
  for (const span of spans) {
    if (span.firstStart >= lastEnd) {
      kept.push(span);
      lastEnd = span.firstStart + span.firstLength;
    }
  }

  let html = "";
  let cursor = 0;
  for (const span of kept) {
    html += escapeHtml(text.slice(cursor, span.firstStart));
    const matchedText = text.slice(span.firstStart, span.firstStart + span.firstLength);
    html += `<mark data-slug="${span.slug}">${escapeHtml(matchedText)}</mark>`;
    cursor = span.firstStart + span.firstLength;
  }
  html += escapeHtml(text.slice(cursor));

  return html;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { escapeRegExp, matchTerms, escapeHtml, buildHighlightedHtml };
}
