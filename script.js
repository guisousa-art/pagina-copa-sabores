const menuToggle = document.querySelector(".menu-toggle");
const sectionMenu = document.querySelector(".section-menu");
const navLinks = document.querySelector(".nav-links");
const navItems = [...document.querySelectorAll(".nav-links a")];
const header = document.querySelector(".site-header");
const menuLabel = menuToggle.querySelector(".sr-only");
const mapEmbed = document.querySelector(".map-embed");
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
const gameAudioViewportThreshold = 0.5;
const mutedMediaStates = new WeakMap();
const watchedAudioFrames = new WeakSet();
let isGameScrollLocked = false;
let isGameAudioAllowed = null;
let isPageAudioMuted = null;
let gameAudioUpdateFrame = 0;
let gameAudioMessageSequence = 0;

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

function isGamePrimaryInViewport() {
  if (!embedSection) {
    return false;
  }

  const rect = embedSection.getBoundingClientRect();
  const viewportHeight =
    window.innerHeight || document.documentElement.clientHeight;
  const viewportCenterY = viewportHeight / 2;

  return (
    getGameViewportCoverage() > gameAudioViewportThreshold &&
    rect.top <= viewportCenterY &&
    rect.bottom >= viewportCenterY
  );
}

function isNonGameEmbedFocused() {
  const activeElement = document.activeElement;

  return (
    activeElement &&
    activeElement.tagName === "IFRAME" &&
    activeElement !== gameEmbed &&
    (activeElement === mapEmbed ||
      activeElement.classList.contains("map-embed"))
  );
}

function postGameAudioMessage(shouldAllowAudio, { repeat = false } = {}) {
  if (!gameEmbed || !gameEmbed.contentWindow) {
    return;
  }

  const messageSequence = ++gameAudioMessageSequence;
  const sendMessage = () => {
    if (messageSequence !== gameAudioMessageSequence) {
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
  };

  sendMessage();

  if (repeat) {
    [120, 360, 900, 1500].forEach((delay) => {
      window.setTimeout(sendMessage, delay);
    });
  }
}

function forEachAccessibleMedia(callback, root = document) {
  root.querySelectorAll("audio, video").forEach(callback);

  root.querySelectorAll("iframe").forEach((frame) => {
    try {
      const frameDocument = frame.contentDocument;

      if (frameDocument) {
        forEachAccessibleMedia(callback, frameDocument);
      }
    } catch {
      // Cross-origin embeds can only be controlled through postMessage.
    }
  });
}

function muteMediaElement(mediaElement) {
  if (!mutedMediaStates.has(mediaElement)) {
    mutedMediaStates.set(mediaElement, {
      muted: mediaElement.muted,
    });
  }

  mediaElement.muted = true;
}

function restoreMediaElement(mediaElement) {
  const previousState = mutedMediaStates.get(mediaElement);

  if (!previousState) {
    return;
  }

  mediaElement.muted = previousState.muted;
  mutedMediaStates.delete(mediaElement);
}

function watchFrameAudioLoad(frame) {
  if (watchedAudioFrames.has(frame)) {
    return;
  }

  watchedAudioFrames.add(frame);
  frame.addEventListener("load", () => {
    if (isPageAudioMuted !== null) {
      setPageAudioMuted(isPageAudioMuted, { force: true });
    }
  });
}

function watchPageAudioNodes() {
  document.querySelectorAll("iframe").forEach(watchFrameAudioLoad);
}

function setPageAudioMuted(shouldMute, { force = false } = {}) {
  const nextMuted = Boolean(shouldMute);

  if (!force && isPageAudioMuted === nextMuted) {
    return;
  }

  isPageAudioMuted = nextMuted;
  forEachAccessibleMedia(nextMuted ? muteMediaElement : restoreMediaElement);
}

function setGameAudioAllowed(shouldAllowAudio, { force = false } = {}) {
  const nextAllowed = Boolean(shouldAllowAudio);

  if (!force && isGameAudioAllowed === nextAllowed) {
    if (!nextAllowed) {
      setPageAudioMuted(true, { force: true });
      postGameAudioMessage(false);
    }

    return;
  }

  isGameAudioAllowed = nextAllowed;

  if (gameEmbed) {
    gameEmbed.dataset.viewportAudio = nextAllowed ? "allowed" : "muted";
  }

  setPageAudioMuted(!nextAllowed, { force });
  postGameAudioMessage(nextAllowed, { repeat: force || !nextAllowed });
}

function updateGameAudioFromViewport({ force = false } = {}) {
  if (!embedSection || !gameEmbed) {
    return;
  }

  const shouldAllowAudio =
    !document.hidden &&
    isGamePrimaryInViewport() &&
    !isNonGameEmbedFocused();

  setGameAudioAllowed(shouldAllowAudio, { force });
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
    queueGameAudioViewportUpdate();
    return;
  }

  if (
    freeScrollStates.has(state) ||
    freeScrollStateHints.some((hint) => state.includes(hint)) ||
    (unlockUnknownState && state)
  ) {
    unlockGameScroll();
    queueGameAudioViewportUpdate();
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
document.addEventListener(
  "play",
  (event) => {
    if (isPageAudioMuted && event.target instanceof HTMLMediaElement) {
      muteMediaElement(event.target);
    }
  },
  true,
);
document.addEventListener("focusin", queueGameAudioViewportUpdate);
window.addEventListener("blur", queueGameAudioViewportUpdate);
window.addEventListener("focus", queueGameAudioViewportUpdate);
watchPageAudioNodes();
updateMenuMode();
updateGameAudioFromViewport();

const pageAudioObserver = new MutationObserver(() => {
  watchPageAudioNodes();

  if (isPageAudioMuted !== null) {
    setPageAudioMuted(isPageAudioMuted, { force: true });
  }
});

pageAudioObserver.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

if (gameEmbed) {
  gameEmbed.addEventListener("load", () => {
    updateGameAudioFromViewport({ force: true });
  });
}

if (mapEmbed) {
  mapEmbed.addEventListener("focus", () => {
    updateGameAudioFromViewport({ force: true });
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
      threshold: [0, 0.25, gameAudioViewportThreshold, 0.75, 1],
    },
  );

  gameAudioObserver.observe(embedSection);
}
