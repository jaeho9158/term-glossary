(function () {
  const menuToggle = document.getElementById("menu-toggle");
  const siteNav = document.getElementById("site-nav");

  if (!menuToggle || !siteNav) return;

  function closeMenu() {
    siteNav.classList.remove("show");
    menuToggle.textContent = "☰";
    menuToggle.setAttribute("aria-expanded", "false");
  }

  function openMenu() {
    siteNav.classList.add("show");
    menuToggle.textContent = "✕";
    menuToggle.setAttribute("aria-expanded", "true");
  }

  menuToggle.addEventListener("click", (e) => {
    e.stopPropagation();

    if (siteNav.classList.contains("show")) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  siteNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  document.addEventListener("click", (e) => {
    if (
      siteNav.classList.contains("show") &&
      !siteNav.contains(e.target) &&
      !menuToggle.contains(e.target)
    ) {
      closeMenu();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
      closeMenu();
    }
  });
})();
