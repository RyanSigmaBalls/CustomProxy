const urlParams = new URLSearchParams(window.location.search);
const query = urlParams.get('q') || '';
const page = Number(urlParams.get('page') || '1');
const resultsContainer = document.querySelector('#results-container');
const summary = document.querySelector('#results-summary');
const pagination = document.querySelector('#pagination-controls');
const form = document.querySelector('#search-form');
const searchInput = document.querySelector('#search-input');
const proxyButton = document.querySelector('#proxy-button');

const KNOWN_SITES = {
  instagram: 'https://www.instagram.com',
  insta: 'https://www.instagram.com',
  youtube: 'https://www.youtube.com',
  tiktok: 'https://www.tiktok.com',
  reddit: 'https://www.reddit.com',
  discord: 'https://discord.com',
  google: 'https://www.google.com',
  twitter: 'https://x.com',
};

function siteTargetForQuery(value) {
  return KNOWN_SITES[value.toLowerCase()] || null;
}

async function renderSearch() {
  if (!query) {
    summary.textContent = 'Enter a query to start searching.';
    return;
  }

  summary.innerHTML = `<span class="loader"></span> Searching for "${query}"...`;
  resultsContainer.innerHTML = '';
  pagination.innerHTML = '';

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&page=${page}`);
    const data = await res.json();
    const results = data.results || [];
    summary.textContent = `${data.total} results found for "${query}"`;

    resultsContainer.innerHTML = results.length
      ? results
          .map(
            (item) => `
      <article class="result-card">
        <a href="/proxy?target=${encodeURIComponent(item.url)}" target="_self">
          <h3>${item.title}</h3>
        </a>
        <p>${item.description}</p>
        <p class="muted-text">${item.source}</p>
      </article>
    `
          )
          .join('')
      : '<p class="muted-text">No results matched your query. Try another search.</p>';

    renderPagination(data.page, data.totalPages);
  } catch (error) {
    summary.textContent = 'Search failed. Please try again.';
    console.error('Search request failed', error);
  }
}

function renderPagination(current, totalPages) {
  if (totalPages <= 1) return;
  const pages = [];
  for (let p = 1; p <= totalPages; p += 1) {
    pages.push(`
      <button class="page-button ${p === current ? 'active' : ''}" data-page="${p}" type="button">${p}</button>
    `);
  }
  pagination.innerHTML = pages.join('');
  pagination.querySelectorAll('.page-button').forEach((button) => {
    button.addEventListener('click', () => {
      const nextPage = button.dataset.page;
      window.location.href = `/search?q=${encodeURIComponent(query)}&page=${nextPage}`;
    });
  });
}

if (form) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const nextQuery = searchInput.value.trim();
    if (!nextQuery) return;
    window.location.href = `/search?q=${encodeURIComponent(nextQuery)}`;
  });
}

if (proxyButton) {
  proxyButton.addEventListener('click', () => {
    const target = siteTargetForQuery(query) || `https://${query}`;
    window.location.href = `/proxy?target=${encodeURIComponent(target)}`;
  });
}

if (searchInput) {
  searchInput.value = query;
}

renderSearch();
