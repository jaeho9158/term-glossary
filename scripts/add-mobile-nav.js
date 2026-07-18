const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

const targets = [
  "index.html",
  "about.html",
  "contact.html",
  "privacy.html",
  "admin.html",
  "login.html",
  "signup.html",
  "history.html",
  ...fs.readdirSync(path.join(root, "terms")).map((f) => path.join("terms", f)),
];

let changed = 0;

for (const rel of targets) {
  const filePath = path.join(root, rel);
  let html = fs.readFileSync(filePath, "utf8");
  if (html.includes('id="menu-toggle"')) continue;

  const beforeNav = html;
  html = html.replace(
    /(\s*)<nav>/,
    `$1<button\n      id="menu-toggle"\n      class="menu-toggle"\n      aria-label="메뉴"\n      aria-expanded="false">\n      ☰\n    </button>\n$1<nav id="site-nav" class="site-nav">`
  );
  if (html === beforeNav) {
    console.error(`no <nav> match in ${rel}`);
    continue;
  }

  const scriptTag = rel.startsWith("terms" + path.sep)
    ? '<script src="../assets/mobile-nav.js"></script>\n'
    : '<script src="assets/mobile-nav.js"></script>\n';

  if (!html.includes(scriptTag.trim())) {
    html = html.replace(/<\/body>/, `${scriptTag}</body>`);
  }

  fs.writeFileSync(filePath, html);
  changed++;
}

console.log(`updated ${changed} files`);
