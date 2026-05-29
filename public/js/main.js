const searchInput = document.querySelector('#search-input');
const suggestionPanel = document.querySelector('#suggestion-panel');
const searchEngineSelect = document.querySelector('#search-engine');
const recentList = document.querySelector('#recent-list');
const themeToggle = document.querySelector('#theme-toggle');
const luckyButton = document.querySelector('#lucky-button');
const voiceButton = document.querySelector('#voice-button');

const KNOWN_SITES = {
  instagram: 'https://www.instagram.com',
  insta: 'https://www.instagram.com',
  youtube: 'https://www.youtube.com',
  yt: 'https://www.youtube.com',
  tiktok: 'https://www.tiktok.com',
  reddit: 'https://www.reddit.com',
  discord: 'https://discord.com',
  google: 'https://www.google.com',
  twitter: 'https://x.com',
};

function normalizeQuery(value) {
  return value.trim().toLowerCase();
}

function selectProxyTarget(query) {
  return KNOWN_SITES[normalizeQuery(query)] || (query.includes('.') ? `https://${query}` : null);
}

function getSearchEngineUrl(query, engine) {
  const encoded = encodeURIComponent(query.trim());
  switch (engine) {
    case 'bing':
      return `https://www.bing.com/search?q=${encoded}`;
    case 'duckduckgo':
      return `https://duckduckgo.com/?q=${encoded}`;
    case 'brave':
      return `https://search.brave.com/search?q=${encoded}`;
    default:
      return `https://www.google.com/search?q=${encoded}`;
  }
}

async function loadRecentSearches() {
  if (!recentList) return;
  try {
    const res = await fetch('/api/search/recent');
    const data = await res.json();
    const items = data.recent || [];
    recentList.innerHTML = items.length
      ? items.map((item) => `<button class="recent-chip" type="button" data-query="${item.query}">${item.query}</button>`).join('')
      : '<p class="muted-text">No recent searches yet.</p>';

    recentList.querySelectorAll('.recent-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const query = chip.dataset.query;
        window.location.href = `/search?q=${encodeURIComponent(query)}`;
      });
    });
  } catch (error) {
    console.error('Recent searches load failed', error);
  }
}

async function loadSuggestions(query) {
  if (!suggestionPanel) return;
  if (!query.trim()) {
    suggestionPanel.innerHTML = '';
    return;
  }

  try {
    const res = await fetch(`/api/search/suggestions?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    suggestionPanel.innerHTML = data.suggestions
      .map((text) => `<button class="suggestion-pill" type="button">${text}</button>`)
      .join('');

    suggestionPanel.querySelectorAll('.suggestion-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        searchInput.value = pill.textContent;
        suggestionPanel.innerHTML = '';
      });
    });
  } catch (error) {
    console.error('Unable to load suggestions:', error);
  }
}

function activateTheme() {
  const isDark = localStorage.getItem('theme') === 'dark';
  document.documentElement.classList.toggle('dark-mode', isDark);
  if (themeToggle) themeToggle.textContent = isDark ? 'Light Mode' : 'Dark Mode';
}

function toggleTheme() {
  const isDark = !document.documentElement.classList.contains('dark-mode');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  activateTheme();
}

async function feelingLucky() {
  const query = searchInput.value.trim();
  if (!query) return;
  const proxyTarget = selectProxyTarget(query);
  if (proxyTarget) {
    window.location.href = `/proxy?target=${encodeURIComponent(proxyTarget)}`;
    return;
  }

  try {
    const res = await fetch(`/api/search/lucky?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (data.result && data.result.url) {
      window.location.href = `/proxy?target=${encodeURIComponent(data.result.url)}`;
    }
  } catch (error) {
    console.error('Lucky search failed:', error);
  }
}

function supportVoiceSearch() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition || !voiceButton) {
    voiceButton?.setAttribute('title', 'Voice search unavailable');
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.interimResults = false;
  recognition.lang = 'en-US';
  recognition.addEventListener('result', (event) => {
    const transcript = event.results[0][0].transcript;
    searchInput.value = transcript;
    loadSuggestions(transcript);
  });

  voiceButton.addEventListener('click', () => {
    recognition.start();
  });
}

if (searchInput) {
  searchInput.addEventListener('input', () => loadSuggestions(searchInput.value));
}

if (themeToggle) {
  themeToggle.addEventListener('click', toggleTheme);
}

if (luckyButton) {
  luckyButton.addEventListener('click', feelingLucky);
}

document.querySelector('#search-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = searchInput.value.trim();
  const engine = searchEngineSelect?.value || 'google';
  const proxyTarget = selectProxyTarget(query);

  if (proxyTarget) {
    window.location.href = `/proxy?target=${encodeURIComponent(proxyTarget)}`;
    return;
  }

  if (engine === 'customproxy') {
    window.location.href = `/search?q=${encodeURIComponent(query)}`;
  } else {
    window.location.href = getSearchEngineUrl(query, engine);
  }
});

supportVoiceSearch();
activateTheme();
loadRecentSearches();
