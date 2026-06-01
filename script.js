const menuToggle = document.querySelector(".menu-toggle");
const sectionMenu = document.querySelector(".section-menu");
const navLinks = document.querySelector(".nav-links");
const navItems = [...document.querySelectorAll(".nav-links a")];
const header = document.querySelector(".site-header");
const menuLabel = menuToggle.querySelector(".sr-only");
const embedSection = document.querySelector(".embed-section");
const gameEmbed = document.querySelector(".game-embed");
const sections = navItems
  .map((item) => document.querySelector(item.getAttribute("href")))
  .filter(Boolean);
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const gameplayStates = new Set([
  "game",
  "gameplay",
  "in-game",
  "ingame",
  "jogando",
  "jogo",
  "play",
  "playing",
  "resume",
  "resumed",
  "running",
]);
const freeScrollStates = new Set([
  "config",
  "configuracoes",
  "game-over",
  "gameover",
  "home",
  "initial",
  "inicio",
  "intro",
  "main-menu",
  "mainmenu",
  "menu",
  "pause",
  "paused",
  "recipe",
  "recipes",
  "receita",
  "receitas",
  "settings",
  "start",
  "start-menu",
  "tutorial",
]);
const freeScrollStateHints = [
  "config",
  "game-over",
  "gameover",
  "menu",
  "pause",
  "recipe",
  "receita",
  "settings",
];
const gameEmbedOrigin = gameEmbed
  ? new URL(gameEmbed.getAttribute("src"), window.location.href).origin
  : "";
let isGameScrollLocked = false;

function setMenuOpen(isOpen) {
  navLinks.classList.toggle("is-open", isOpen);
  menuToggle.setAttribute("aria-expanded", String(isOpen));
  menuLabel.textContent = isOpen ? "Fechar menu" : "Abrir menu";
}

function closeMenu() {
  setMenuOpen(false);
}

function updateMenuMode() {
  const headerHeight =
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--header-height",
      ),
    ) || sectionMenu.offsetHeight;
  const headerLimit =
    header.offsetTop + header.offsetHeight * 0.35 - headerHeight;
  const isCompact = window.scrollY >= headerLimit;

  sectionMenu.classList.toggle("is-compact", isCompact);

  if (!isCompact && window.matchMedia("(min-width: 861px)").matches) {
    closeMenu();
  }
}

function centerGameInViewport() {
  if (!embedSection) {
    return;
  }

  const rect = embedSection.getBoundingClientRect();
  const targetY =
    window.scrollY + rect.top + rect.height / 2 - window.innerHeight / 2;
  const maxY =
    document.documentElement.scrollHeight -
    document.documentElement.clientHeight;

  window.scrollTo({
    top: Math.max(0, Math.min(targetY, maxY)),
    behavior: reducedMotionQuery.matches ? "auto" : "smooth",
  });
}

function lockGameScroll() {
  centerGameInViewport();
  isGameScrollLocked = true;
  document.documentElement.classList.add("is-gameplay-locked");
  closeMenu();
}

function unlockGameScroll() {
  isGameScrollLocked = false;
  document.documentElement.classList.remove("is-gameplay-locked");
}

function getStateToken(value) {
  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  const parts = normalized.split(/[:/\s.]+/).filter(Boolean);

  return parts[parts.length - 1] || normalized;
}

function getGameStateFromMessage(data) {
  if (typeof data === "string") {
    try {
      return getGameStateFromMessage(JSON.parse(data));
    } catch {
      return {
        state: getStateToken(data),
        unlockUnknownState: false,
      };
    }
  }

  if (!data || typeof data !== "object") {
    return {
      state: "",
      unlockUnknownState: false,
    };
  }

  const explicitState = data.state || data.screen || data.mode || data.value;

  return {
    state: getStateToken(explicitState || data.type || ""),
    unlockUnknownState: Boolean(explicitState),
  };
}

function handleGameState({ state, unlockUnknownState = false }) {
  if (gameplayStates.has(state)) {
    lockGameScroll();
    return;
  }

  if (
    freeScrollStates.has(state) ||
    freeScrollStateHints.some((hint) => state.includes(hint)) ||
    (unlockUnknownState && state)
  ) {
    unlockGameScroll();
  }
}

function handleGameMessage(event) {
  if (
    !gameEmbed ||
    event.source !== gameEmbed.contentWindow ||
    event.origin !== gameEmbedOrigin
  ) {
    return;
  }

  handleGameState(getGameStateFromMessage(event.data));
}

menuToggle.addEventListener("click", () => {
  setMenuOpen(!navLinks.classList.contains("is-open"));
});

navItems.forEach((item) => {
  item.addEventListener("click", closeMenu);
});

document.addEventListener("click", (event) => {
  const clickedOutsideMenu = !sectionMenu.contains(event.target);

  if (clickedOutsideMenu) {
    closeMenu();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMenu();
  }
});

window.addEventListener("scroll", updateMenuMode, { passive: true });
window.addEventListener("resize", () => {
  updateMenuMode();

  if (isGameScrollLocked) {
    centerGameInViewport();
  }
});
window.addEventListener("load", updateMenuMode);
window.addEventListener("message", handleGameMessage);
updateMenuMode();

document.querySelectorAll('[aria-disabled="true"]').forEach((item) => {
  item.addEventListener("click", (event) => {
    event.preventDefault();
  });
});

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return;
      }

      navItems.forEach((item) => {
        const isCurrent = item.getAttribute("href") === `#${entry.target.id}`;
        item.classList.toggle("is-active", isCurrent);
      });
    });
  },
  {
    rootMargin: "-35% 0px -55% 0px",
    threshold: 0,
  },
);

sections.forEach((section) => observer.observe(section));
