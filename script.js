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
const gameEmbedSrc = gameEmbed
  ? gameEmbed.getAttribute("src") || ""
  : "";
const gameEmbedOrigin = gameEmbedSrc
  ? new URL(gameEmbedSrc, window.location.href).origin
  : "";
const gameAudioViewportThreshold = 0.55;
let isGameScrollLocked = false;
let isGameAudioAllowed = null;
let gameAudioUpdateFrame = 0;

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

function getGameViewportCoverage() {
  if (!embedSection) {
    return 0;
  }

  const rect = embedSection.getBoundingClientRect();
  const viewportHeight =
    window.innerHeight || document.documentElement.clientHeight;
  const visibleHeight =
    Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);

  if (viewportHeight <= 0 || visibleHeight <= 0) {
    return 0;
  }

  return Math.min(1, visibleHeight / viewportHeight);
}

function postGameAudioMessage(shouldAllowAudio) {
  if (!gameEmbed || !gameEmbed.contentWindow) {
    return;
  }

  gameEmbed.contentWindow.postMessage(
    {
      type: "copa-game:audio-visibility",
      allowed: shouldAllowAudio,
      muted: !shouldAllowAudio,
      viewportCoverage: getGameViewportCoverage(),
    },
    gameEmbedOrigin,
  );
}

function setGameAudioAllowed(shouldAllowAudio, { force = false } = {}) {
  const nextAllowed = Boolean(shouldAllowAudio);

  if (!force && isGameAudioAllowed === nextAllowed) {
    return;
  }

  isGameAudioAllowed = nextAllowed;

  if (gameEmbed) {
    gameEmbed.dataset.viewportAudio = nextAllowed ? "allowed" : "muted";
  }

  postGameAudioMessage(nextAllowed);
}

function updateGameAudioFromViewport() {
  if (!embedSection || !gameEmbed) {
    return;
  }

  const shouldAllowAudio =
    !document.hidden &&
    getGameViewportCoverage() >= gameAudioViewportThreshold;

  setGameAudioAllowed(shouldAllowAudio);
}

function queueGameAudioViewportUpdate() {
  if (gameAudioUpdateFrame) {
    return;
  }

  gameAudioUpdateFrame = window.requestAnimationFrame(() => {
    gameAudioUpdateFrame = 0;
    updateGameAudioFromViewport();
  });
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

window.addEventListener(
  "scroll",
  () => {
    updateMenuMode();
    queueGameAudioViewportUpdate();
  },
  { passive: true },
);
window.addEventListener("resize", () => {
  updateMenuMode();
  queueGameAudioViewportUpdate();

  if (isGameScrollLocked) {
    centerGameInViewport();
  }
});
window.addEventListener("load", () => {
  updateMenuMode();
  updateGameAudioFromViewport();
});
window.addEventListener("message", handleGameMessage);
document.addEventListener("visibilitychange", updateGameAudioFromViewport);
updateMenuMode();
updateGameAudioFromViewport();

if (gameEmbed) {
  gameEmbed.addEventListener("load", () => {
    setGameAudioAllowed(isGameAudioAllowed ?? false, { force: true });
  });
}

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

if (embedSection && gameEmbed) {
  const gameAudioObserver = new IntersectionObserver(
    updateGameAudioFromViewport,
    {
      threshold: [0, 0.25, 0.5, gameAudioViewportThreshold, 0.75, 1],
    },
  );

  gameAudioObserver.observe(embedSection);
}
