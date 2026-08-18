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

  // "학습" nav dropdown (퀴즈/로드맵). Desktop shows it on hover via CSS
  // already; this adds click/keyboard support and closes it when clicking
  // elsewhere. On mobile the dropdown is always expanded via CSS, so the
  // toggle button below is inert there (harmless).
  document.querySelectorAll(".nav-dropdown-toggle").forEach((toggle) => {
    const dropdown = toggle.closest(".nav-dropdown");
    if (!dropdown) return;

    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = dropdown.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(isOpen));
    });
  });

  document.addEventListener("click", (e) => {
    document.querySelectorAll(".nav-dropdown.open").forEach((dropdown) => {
      if (!dropdown.contains(e.target)) {
        dropdown.classList.remove("open");
        const toggle = dropdown.querySelector(".nav-dropdown-toggle");
        if (toggle) toggle.setAttribute("aria-expanded", "false");
      }
    });
  });
})();
