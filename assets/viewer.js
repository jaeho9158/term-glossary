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

if (typeof module !== "undefined" && module.exports) {
  module.exports = { escapeRegExp, matchTerms };
}
