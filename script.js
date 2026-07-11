const GITHUB_USER = "lapotist";
const GITHUB_API = `https://api.github.com/users/${GITHUB_USER}`;

const themeToggle = document.querySelector("#theme-toggle");
const themeColor = document.querySelector('meta[name="theme-color"]');

function getPreferredTheme() {
  const savedTheme = localStorage.getItem("lapotist-theme");

  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = theme;
  themeToggle?.setAttribute("aria-label", `Switch to ${isDark ? "light" : "dark"} theme`);
  themeColor?.setAttribute("content", isDark ? "#151812" : "#f3f4ee");
}

applyTheme(getPreferredTheme());

themeToggle?.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("lapotist-theme", nextTheme);
  applyTheme(nextTheme);
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
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);

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
    window.clearTimeout(timeout);
  }
}

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

document.querySelectorAll(".reveal").forEach((element) => {
  element.classList.add("reveal-pending");
  revealObserver.observe(element);
});

const sections = document.querySelectorAll("main section[id]");
const navLinks = document.querySelectorAll(".nav-links a");
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

const hero = document.querySelector(".hero");
const heroAvatar = document.querySelector(".hero-avatar");

if (hero && heroAvatar && window.matchMedia("(pointer: fine)").matches) {
  hero.addEventListener("pointermove", (event) => {
    const bounds = hero.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    heroAvatar.style.transform = `translate(${x * 8}px, ${y * 8}px) rotate(2deg)`;
  });

  hero.addEventListener("pointerleave", () => {
    heroAvatar.style.transform = "rotate(2deg)";
  });
}

window.addEventListener("DOMContentLoaded", () => {
  window.lucide?.createIcons();
  loadGitHubData();
});
