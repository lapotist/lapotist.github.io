const GITHUB_USER = "lapotist";
const GITHUB_API = `https://api.github.com/users/${GITHUB_USER}`;

const themeToggle = document.querySelector("#theme-toggle");
const soundToggle = document.querySelector("#sound-toggle");
const themeColor = document.querySelector('meta[name="theme-color"]');
const lightModeWarning = document.querySelector("#light-mode-warning");
const confirmLightMode = document.querySelector("#confirm-light-mode");
const flashbang = document.querySelector("#flashbang");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function readStoredPreference(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function writeStoredPreference(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    // The in-memory preference still applies when storage is unavailable.
  }
}

function getPreferredTheme() {
  const savedTheme = readStoredPreference("lapotist-theme");

  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }

  return "dark";
}

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = theme;
  themeToggle?.setAttribute("aria-label", `Switch to ${isDark ? "light" : "dark"} theme`);
  themeToggle?.setAttribute("data-tooltip", isDark ? "Light mode, really?" : "Switch to dark");
  themeColor?.setAttribute("content", isDark ? "#151812" : "#f3f4ee");
}

applyTheme(getPreferredTheme());

function commitTheme(theme) {
  writeStoredPreference("lapotist-theme", theme);
  applyTheme(theme);
}

let soundEnabled = readStoredPreference("lapotist-sound") !== "off";
let soundGeneration = 0;
let audioContext;
let audioMaster;
const activeAudioSources = new Set();

function applySoundPreference(enabled) {
  soundGeneration += 1;
  soundEnabled = enabled;
  document.documentElement.dataset.sound = enabled ? "on" : "off";
  soundToggle?.setAttribute("aria-pressed", String(enabled));
  soundToggle?.setAttribute("data-tooltip", enabled ? "Mute sound" : "Enable sound");

  if (audioContext && audioMaster && audioContext.state !== "closed") {
    const now = audioContext.currentTime;
    audioMaster.gain.cancelScheduledValues(now);
    audioMaster.gain.setValueAtTime(enabled ? 0.42 : 0, now);
  }

  if (!enabled) {
    activeAudioSources.forEach((source) => {
      try {
        source.stop();
      } catch (error) {
        // The source may already have ended between the preference change and cleanup.
      }
    });
    activeAudioSources.clear();
  }
}

function getAudioOutput() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) {
    return null;
  }

  if (audioContext?.state === "closed") {
    audioContext = undefined;
    audioMaster = undefined;
  }

  if (!audioContext) {
    audioContext = new AudioContextClass();
    const compressor = audioContext.createDynamicsCompressor();
    audioMaster = audioContext.createGain();
    audioMaster.gain.value = 0.42;
    compressor.threshold.value = -18;
    compressor.knee.value = 12;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    audioMaster.connect(compressor).connect(audioContext.destination);
  }

  return { context: audioContext, output: audioMaster };
}

function startAudioSource(source, startTime, stopTime) {
  activeAudioSources.add(source);
  source.addEventListener("ended", () => activeAudioSources.delete(source), { once: true });
  source.start(startTime);
  source.stop(stopTime);
}

function playSound(effect) {
  if (!soundEnabled) {
    return;
  }

  const audio = getAudioOutput();
  const requestedGeneration = soundGeneration;

  if (!audio) {
    return;
  }

  const startEffect = () => {
    if (
      soundEnabled &&
      requestedGeneration === soundGeneration &&
      audio.context.state === "running"
    ) {
      effect(audio.context, audio.output);
    }
  };

  if (audio.context.state !== "running" && audio.context.state !== "closed") {
    audio.context.resume().then(startEffect).catch(() => {});
  } else {
    startEffect();
  }
}

function playInterfaceSound(direction = "up") {
  playSound((context, output) => {
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startFrequency = direction === "up" ? 320 : 480;
    const endFrequency = direction === "up" ? 520 : 260;

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(startFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + 0.09);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    oscillator.connect(gain).connect(output);
    startAudioSource(oscillator, now, now + 0.13);
  });
}

function playLightModeMock() {
  playSound((context, output) => {
    const now = context.currentTime;

    [
      { delay: 0, frequency: 430 },
      { delay: 0.1, frequency: 300 },
    ].forEach(({ delay, frequency }) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + delay;

      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.82, start + 0.12);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.035, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
      oscillator.connect(gain).connect(output);
      startAudioSource(oscillator, start, start + 0.15);
    });
  });
}

function playFlashbangSound() {
  playSound((context, output) => {
    const now = context.currentTime + 0.01;
    const noiseLength = Math.floor(context.sampleRate * 0.42);
    const noiseBuffer = context.createBuffer(1, noiseLength, context.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);

    for (let index = 0; index < noiseLength; index += 1) {
      noiseData[index] = Math.random() * 2 - 1;
    }

    const noise = context.createBufferSource();
    const noiseFilter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    noise.buffer = noiseBuffer;
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.setValueAtTime(5600, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(900, now + 0.38);
    noiseGain.gain.setValueAtTime(0.32, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    noise.connect(noiseFilter).connect(noiseGain).connect(output);
    startAudioSource(noise, now, now + 0.43);

    const thump = context.createOscillator();
    const thumpGain = context.createGain();
    thump.type = "sine";
    thump.frequency.setValueAtTime(125, now);
    thump.frequency.exponentialRampToValueAtTime(48, now + 0.32);
    thumpGain.gain.setValueAtTime(0.24, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
    thump.connect(thumpGain).connect(output);
    startAudioSource(thump, now, now + 0.35);

    [3150, 3470].forEach((frequency, index) => {
      const ring = context.createOscillator();
      const ringGain = context.createGain();
      const ringStart = now + 0.11 + index * 0.018;
      ring.type = "sine";
      ring.frequency.setValueAtTime(frequency, ringStart);
      ring.frequency.exponentialRampToValueAtTime(frequency * 0.94, ringStart + 4.9);
      ringGain.gain.setValueAtTime(0.0001, ringStart);
      ringGain.gain.exponentialRampToValueAtTime(index === 0 ? 0.04 : 0.018, ringStart + 0.08);
      ringGain.gain.setValueAtTime(index === 0 ? 0.032 : 0.014, ringStart + 0.8);
      ringGain.gain.exponentialRampToValueAtTime(0.0001, ringStart + 5);
      ring.connect(ringGain).connect(output);
      startAudioSource(ring, ringStart, ringStart + 5.05);
    });
  });
}

applySoundPreference(soundEnabled);

soundToggle?.addEventListener("click", () => {
  const nextEnabled = !soundEnabled;

  applySoundPreference(nextEnabled);
  writeStoredPreference("lapotist-sound", nextEnabled ? "on" : "off");

  if (nextEnabled) {
    playInterfaceSound("up");
  }
});

async function switchTheme(theme) {
  if (!document.startViewTransition || reducedMotion.matches) {
    commitTheme(theme);
    return;
  }

  const bounds = themeToggle.getBoundingClientRect();
  const x = bounds.left + bounds.width / 2;
  const y = bounds.top + bounds.height / 2;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const transition = document.startViewTransition(() => commitTheme(theme));

  try {
    await transition.ready;
    document.documentElement.animate(
      {
        clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`],
      },
      {
        duration: 420,
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
        pseudoElement: "::view-transition-new(root)",
      },
    );
  } catch (error) {
    // The theme has already changed; unsupported transition details can safely fall back.
  }
}

let flashbangInProgress = false;

async function switchToLightWithFlash() {
  if (flashbangInProgress) {
    return;
  }

  lightModeWarning?.close?.("confirmed");

  if (!flashbang?.animate || reducedMotion.matches) {
    commitTheme("light");
    playInterfaceSound("up");
    return;
  }

  playFlashbangSound();
  flashbangInProgress = true;
  document.documentElement.classList.add("flashbang-active");
  flashbang.classList.add("is-active");

  const animation = flashbang.animate(
    [
      {
        opacity: 0,
        backdropFilter: "blur(0) brightness(1) saturate(1)",
        offset: 0,
      },
      {
        opacity: 1,
        backdropFilter: "blur(18px) brightness(3) saturate(0.1)",
        offset: 0.02,
        easing: "ease-out",
      },
      {
        opacity: 1,
        backdropFilter: "blur(18px) brightness(3) saturate(0.1)",
        offset: 0.24,
      },
      {
        opacity: 0.93,
        backdropFilter: "blur(14px) brightness(2.5) saturate(0.2)",
        offset: 0.42,
      },
      {
        opacity: 0.68,
        backdropFilter: "blur(9px) brightness(2) saturate(0.4)",
        offset: 0.62,
      },
      {
        opacity: 0.35,
        backdropFilter: "blur(4px) brightness(1.45) saturate(0.7)",
        offset: 0.82,
      },
      {
        opacity: 0,
        backdropFilter: "blur(0) brightness(1) saturate(1)",
        offset: 1,
      },
    ],
    {
      duration: 5200,
      easing: "linear",
      fill: "forwards",
    },
  );
  let themeCommitted = false;
  const themeTimer = window.setTimeout(() => {
    commitTheme("light");
    themeCommitted = true;
  }, 90);

  try {
    await animation.finished;
  } catch (error) {
    // A canceled visual effect should not leave the requested theme unapplied.
  } finally {
    window.clearTimeout(themeTimer);

    if (!themeCommitted) {
      commitTheme("light");
    }

    animation.cancel();
    flashbang.classList.remove("is-active");
    document.documentElement.classList.remove("flashbang-active");
    flashbangInProgress = false;
  }
}

themeToggle?.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";

  if (nextTheme === "light") {
    playLightModeMock();

    if (lightModeWarning?.showModal) {
      if (!lightModeWarning.open) {
        lightModeWarning.showModal();
      }
    } else if (window.confirm("HAHA. Light mode? Seriously?")) {
      void switchToLightWithFlash();
    }

    return;
  }

  playInterfaceSound("down");
  void switchTheme(nextTheme);
});

confirmLightMode?.addEventListener("click", () => {
  void switchToLightWithFlash();
});

lightModeWarning?.addEventListener("click", (event) => {
  if (event.target === lightModeWarning) {
    lightModeWarning.close("cancel");
  }
});

lightModeWarning?.addEventListener("close", () => {
  if (lightModeWarning.returnValue !== "confirmed") {
    playInterfaceSound("down");
  }

  window.setTimeout(() => {
    themeToggle?.focus({ preventScroll: true });
  }, 0);
});

document.querySelectorAll("[data-current-year]").forEach((element) => {
  element.textContent = String(new Date().getFullYear());
});

function relativeTime(dateValue) {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const ranges = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.345, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];
  let value = seconds;

  for (const [divisor, unit] of ranges) {
    if (Math.abs(value) < divisor) {
      return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(Math.round(value), unit);
    }

    value /= divisor;
  }

  return "Recently";
}

async function fetchGitHub(path, signal) {
  const response = await fetch(`${GITHUB_API}${path}`, {
    headers: { Accept: "application/vnd.github+json" },
    referrerPolicy: "no-referrer",
    signal,
  });

  if (!response.ok) {
    throw new Error(`GitHub request failed with ${response.status}`);
  }

  return response.json();
}

function updateProfile(profile) {
  const repoCount = document.querySelector("#repo-count");
  const githubSince = document.querySelector("#github-since");

  if (repoCount && Number.isFinite(profile.public_repos)) {
    repoCount.textContent = String(profile.public_repos);
  }

  if (githubSince && profile.created_at) {
    githubSince.textContent = String(new Date(profile.created_at).getFullYear());
  }
}

function updateRepositories(repositories) {
  const languageCount = document.querySelector("#language-count");
  const languages = new Set(repositories.map((repository) => repository.language).filter(Boolean));

  if (languageCount && languages.size > 0) {
    languageCount.textContent = String(languages.size);
  }

  document.querySelectorAll("[data-repo]").forEach((card) => {
    const repository = repositories.find((item) => item.name === card.dataset.repo);
    const updatedLabel = card.querySelector("[data-updated]");

    if (repository && updatedLabel) {
      updatedLabel.textContent = `Updated ${relativeTime(repository.pushed_at)}`;
    }
  });
}

function describeEvent(event) {
  const labels = {
    PushEvent: "Pushed code",
    CreateEvent: "Created something new",
    PullRequestEvent: "Worked on a pull request",
    IssuesEvent: "Worked on an issue",
    WatchEvent: "Starred a repository",
    ForkEvent: "Forked a repository",
  };

  return labels[event.type] || "Updated public work";
}

function eventIcon(eventType) {
  const icons = {
    PushEvent: "git-commit-horizontal",
    CreateEvent: "circle-plus",
    PullRequestEvent: "git-pull-request-arrow",
    IssuesEvent: "circle-dot",
    WatchEvent: "star",
    ForkEvent: "git-fork",
  };

  return icons[eventType] || "code-2";
}

function renderActivity(events) {
  const activityList = document.querySelector("#activity-list");

  if (!activityList || !Array.isArray(events)) {
    return;
  }

  const uniqueEvents = [];
  const seenRepositories = new Set();

  for (const event of events) {
    const repositoryName = event.repo?.name;

    if (
      !repositoryName ||
      seenRepositories.has(repositoryName) ||
      !repositoryName.startsWith(`${GITHUB_USER}/`)
    ) {
      continue;
    }

    seenRepositories.add(repositoryName);
    uniqueEvents.push(event);

    if (uniqueEvents.length === 4) {
      break;
    }
  }

  if (uniqueEvents.length === 0) {
    return;
  }

  const fragment = document.createDocumentFragment();

  uniqueEvents.forEach((event) => {
    const item = document.createElement("li");
    const iconWrap = document.createElement("span");
    const icon = document.createElement("i");
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    const link = document.createElement("a");
    const time = document.createElement("time");

    iconWrap.className = "activity-icon";
    icon.setAttribute("data-lucide", eventIcon(event.type));
    icon.setAttribute("aria-hidden", "true");
    iconWrap.append(icon);

    title.textContent = describeEvent(event);
    link.textContent = event.repo.name;
    link.href = `https://github.com/${event.repo.name}`;
    link.target = "_blank";
    link.rel = "noreferrer noopener";
    copy.append(title, link);

    time.dateTime = event.created_at;
    time.textContent = relativeTime(event.created_at);
    item.append(iconWrap, copy, time);
    fragment.append(item);
  });

  activityList.replaceChildren(fragment);
  window.lucide?.createIcons();
}

async function loadGitHubData() {
  const status = document.querySelector("#data-status");
  const statusWrap = status?.closest(".hero-status");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);

  statusWrap?.setAttribute("data-loading", "true");

  if (status) {
    status.textContent = "Syncing public GitHub data";
  }

  try {
    const [profile, repositories, events] = await Promise.all([
      fetchGitHub("", controller.signal),
      fetchGitHub("/repos?per_page=100&sort=updated", controller.signal),
      fetchGitHub("/events/public?per_page=30", controller.signal),
    ]);

    updateProfile(profile);
    updateRepositories(repositories);
    renderActivity(events);

    if (status) {
      status.textContent = "Public GitHub data is live";
    }
  } catch (error) {
    if (status) {
      status.textContent = "Showing verified public profile data";
    }
  } finally {
    statusWrap?.removeAttribute("data-loading");
    window.clearTimeout(timeout);
  }
}

const revealElements = [...document.querySelectorAll(".reveal")];
const heroReveals = [...document.querySelectorAll(".hero .reveal")];

heroReveals.forEach((element, index) => {
  element.style.setProperty("--reveal-delay", `${index * 55}ms`);
});

document.querySelectorAll(".project-card").forEach((element, index) => {
  element.style.setProperty("--reveal-delay", `${Math.min(index * 70, 210)}ms`);
});

revealElements.forEach((element) => {
  element.classList.add("reveal-pending");
});

if (reducedMotion.matches || !("IntersectionObserver" in window)) {
  revealElements.forEach((element) => element.classList.add("is-visible"));
} else {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.14 },
  );

  revealElements
    .filter((element) => !element.closest(".hero"))
    .forEach((element) => revealObserver.observe(element));

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      heroReveals.forEach((element) => element.classList.add("is-visible"));
    });
  });
}

const sections = document.querySelectorAll("main section[id]");
const navLinks = document.querySelectorAll(".nav-links a");
if ("IntersectionObserver" in window) {
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      const visibleEntry = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (!visibleEntry) {
        return;
      }

      navLinks.forEach((link) => {
        const isCurrent = link.getAttribute("href") === `#${visibleEntry.target.id}`;

        if (isCurrent) {
          link.setAttribute("aria-current", "location");
        } else {
          link.removeAttribute("aria-current");
        }
      });
    },
    { rootMargin: "-20% 0px -65%", threshold: [0, 0.15, 0.5] },
  );

  sections.forEach((section) => sectionObserver.observe(section));
}

const hero = document.querySelector(".hero");
const heroPortrait = document.querySelector(".hero-portrait");

if (hero && heroPortrait && window.matchMedia("(pointer: fine)").matches && !reducedMotion.matches) {
  let bounds;
  let pointerFrame;
  let pointerPosition;

  hero.addEventListener("pointerenter", () => {
    bounds = hero.getBoundingClientRect();
  });

  hero.addEventListener("pointermove", (event) => {
    bounds ??= hero.getBoundingClientRect();
    pointerPosition = { x: event.clientX, y: event.clientY };

    if (pointerFrame) {
      return;
    }

    pointerFrame = window.requestAnimationFrame(() => {
      const x = Math.max(-0.5, Math.min(0.5, (pointerPosition.x - bounds.left) / bounds.width - 0.5));
      const y = Math.max(-0.5, Math.min(0.5, (pointerPosition.y - bounds.top) / bounds.height - 0.5));
      heroPortrait.style.setProperty("--portrait-x", `${x * 12}px`);
      heroPortrait.style.setProperty("--portrait-y", `${y * 10}px`);
      heroPortrait.style.setProperty("--portrait-rx", `${y * -3}deg`);
      heroPortrait.style.setProperty("--portrait-ry", `${x * 3}deg`);
      pointerFrame = null;
    });
  });

  hero.addEventListener("pointerleave", () => {
    if (pointerFrame) {
      window.cancelAnimationFrame(pointerFrame);
      pointerFrame = null;
    }

    ["--portrait-x", "--portrait-y", "--portrait-rx", "--portrait-ry"].forEach((property) => {
      heroPortrait.style.removeProperty(property);
    });
  });
}

let progressFrame;

function updateScrollProgress() {
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  const progress = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
  document.documentElement.style.setProperty("--scroll-progress", String(progress));
  progressFrame = null;
}

function requestScrollProgress() {
  if (!progressFrame) {
    progressFrame = window.requestAnimationFrame(updateScrollProgress);
  }
}

window.addEventListener("scroll", requestScrollProgress, { passive: true });
window.addEventListener("resize", requestScrollProgress);
updateScrollProgress();

window.addEventListener("DOMContentLoaded", () => {
  window.lucide?.createIcons();
  loadGitHubData();
});
