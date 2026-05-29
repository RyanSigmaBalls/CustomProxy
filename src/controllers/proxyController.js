const { URL } = require('url');
const cheerio = require('cheerio');
const { addProxyHistory } = require('../models/proxyModel');

const KNOWN_SITES = {
  instagram: 'https://www.instagram.com',
  insta: 'https://www.instagram.com',
  youtube: 'https://www.youtube.com',
  yt: 'https://www.youtube.com',
  tiktok: 'https://www.tiktok.com',
  reddit: 'https://www.reddit.com',
  google: 'https://www.google.com',
  discord: 'https://discord.com',
  twitter: 'https://x.com',
};

function normalizeUrl(value) {
  if (!value) return null;
  const trimmed = value.trim();
  const known = getMatchingSite(trimmed);
  if (known) return known;

  try {
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return `https://${trimmed}`;
    }
    return trimmed;
  } catch (error) {
    return null;
  }
}

function buildProxyUrl(url) {
  return `/service/?target=${encodeURIComponent(url)}`;
}

function isDataUrl(value) {
  return /^data:/i.test(value);
}

function makeAbsolute(base, relative) {
  try {
    return new URL(relative, base).href;
  } catch (error) {
    return relative;
  }
}

function rewriteAttribute($, element, attrName, baseUrl) {
  const original = $(element).attr(attrName);
  if (!original || isDataUrl(original) || original.startsWith('mailto:') || original.startsWith('tel:')) {
    return;
  }
  const absolute = makeAbsolute(baseUrl, original);
  $(element).attr(attrName, buildProxyUrl(absolute));
}

function rewriteSrcSet(value, baseUrl) {
  if (!value) return value;
  return value
    .split(',')
    .map((item) => {
      const [url, descriptor] = item.trim().split(' ');
      if (isDataUrl(url)) return item;
      const absolute = makeAbsolute(baseUrl, url);
      return `${buildProxyUrl(absolute)}${descriptor ? ' ' + descriptor : ''}`;
    })
    .join(', ');
}

function rewriteHTML(html, originUrl) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const baseUrl = originUrl;

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || isDataUrl(href)) {
      return;
    }
    const absolute = makeAbsolute(baseUrl, href);
    $(el).attr('href', buildProxyUrl(absolute));
  });

  $('form[action]').each((_, el) => {
    const action = $(el).attr('action');
    if (!action || action.startsWith('#')) return;
    const absolute = makeAbsolute(baseUrl, action);
    $(el).attr('action', buildProxyUrl(absolute));
    $(el).attr('method', 'get');
  });

  $('[src]').each((_, el) => {
    rewriteAttribute($, el, 'src', baseUrl);
  });

  $('link[href]').each((_, el) => {
    rewriteAttribute($, el, 'href', baseUrl);
  });

  $('img[srcset]').each((_, el) => {
    const value = $(el).attr('srcset');
    $(el).attr('srcset', rewriteSrcSet(value, baseUrl));
  });

  $('source[srcset]').each((_, el) => {
    const value = $(el).attr('srcset');
    $(el).attr('srcset', rewriteSrcSet(value, baseUrl));
  });

  $('meta[http-equiv="refresh"]').each((_, el) => {
    const content = $(el).attr('content');
    if (content) {
      const match = content.match(/url=(.+)$/i);
      if (match) {
        const absolute = makeAbsolute(baseUrl, match[1].trim());
        $(el).attr('content', `0; url=${buildProxyUrl(absolute)}`);
      }
    }
  });

  $('style').each((_, el) => {
    const updated = $(el).html().replace(/url\(([^)]+)\)/g, (match, url) => {
      const cleaned = url.replace(/['"]/g, '');
      if (isDataUrl(cleaned)) return match;
      const absolute = makeAbsolute(baseUrl, cleaned);
      return `url(${buildProxyUrl(absolute)})`;
    });
    $(el).html(updated);
  });

  $('body').append(`
    <script>
      window.addEventListener('DOMContentLoaded', () => {
        const params = new URLSearchParams(window.location.search);
        const cloakTitle = params.get('cloakTitle');
        const cloakIcon = params.get('cloakIcon');
        if (cloakTitle) document.title = cloakTitle;
        if (cloakIcon) {
          let icon = document.querySelector('link[rel="icon"]');
          if (!icon) {
            icon = document.createElement('link');
            icon.rel = 'icon';
            document.head.appendChild(icon);
          }
          icon.href = cloakIcon;
        }
      });
    </script>
  `);

  return $.html();
}

function getMatchingSite(query) {
  const cleaned = query.trim().toLowerCase();
  return KNOWN_SITES[cleaned] || null;
}

async function proxyHandler(req, res) {
  try {
    const queryTarget = req.query.target || req.query.url;
    const selected = req.query.site || '';
    const selectedTarget = selected ? getMatchingSite(selected) : null;
    const target = normalizeUrl(queryTarget) || selectedTarget;

    if (!target) {
      return res.status(400).send('No valid proxy target specified.');
    }

    return res.redirect(302, buildProxyUrl(target));
  } catch (error) {
    console.error('Proxy redirect error:', error);
    res.status(500).send('Proxy redirect failed.');
  }
}

module.exports = {
  KNOWN_SITES,
  proxyHandler,
};
