const express = require('express');
const { URL } = require('url');
const got = require('got').default || require('got');
const httpProxy = require('http-proxy');
const zlib = require('zlib');
const cheerio = require('cheerio');
const { CookieJar } = require('tough-cookie');

const router = express.Router();
const PROXY_PATH = '/service';
const PROXY_QUERY = '?target=';
const PROXY_PREFIX = `${PROXY_PATH}/${PROXY_QUERY}`.replace('//', '/');

const wsProxy = httpProxy.createProxyServer({ ws: true, xfwd: true, secure: false, changeOrigin: true });

const PROXY_RUNTIME = `
(function(){
  const proxyPrefix = location.origin + '/service/?target=';
  const specialSchemes = /^(data|blob|javascript|mailto|tel|about|filesystem):/i;
  const currentTarget = new URLSearchParams(location.search).get('target') || '';
  const currentTargetUrl = currentTarget ? new URL(currentTarget) : null;

  function shouldProxy(value){
    if(!value || typeof value !== 'string') return false;
    if(value.startsWith(proxyPrefix)) return false;
    if(specialSchemes.test(value)) return false;
    return true;
  }

  function proxify(value){
    if(!shouldProxy(value)) return value;
    try{
      const absolute = new URL(value, currentTargetUrl || location.href).href;
      return proxyPrefix + encodeURIComponent(absolute);
    }catch(e){
      return value;
    }
  }

  const originalFetch = window.fetch;
  window.fetch = function(input, init){
    if(typeof input === 'string') input = proxify(input);
    else if(input instanceof Request) input = new Request(proxify(input.url), input);
    return originalFetch.call(this, input, init);
  };

  const OriginalXHR = window.XMLHttpRequest;
  function ProxyXHR(){
    const xhr = new OriginalXHR();
    const open = xhr.open;
    xhr.open = function(method, url){
      if(typeof url === 'string') url = proxify(url);
      return open.apply(this, arguments);
    };
    return xhr;
  }
  window.XMLHttpRequest = ProxyXHR;

  const OriginalWebSocket = window.WebSocket;
  if(OriginalWebSocket){
    window.WebSocket = function(url, protocols){
      if(typeof url === 'string') url = proxify(url);
      return new OriginalWebSocket(url, protocols);
    };
  }

  const OriginalEventSource = window.EventSource;
  if(OriginalEventSource){
    window.EventSource = function(url, opts){
      if(typeof url === 'string') url = proxify(url);
      return new OriginalEventSource(url, opts);
    };
  }

  const originalSendBeacon = navigator.sendBeacon.bind(navigator);
  navigator.sendBeacon = function(url, data){
    if(typeof url === 'string') url = proxify(url);
    return originalSendBeacon(url, data);
  };

  const originalOpen = window.open.bind(window);
  window.open = function(url, name, specs){
    if(typeof url === 'string') url = proxify(url);
    return originalOpen(url, name, specs);
  };

  const originalAssign = window.location.assign.bind(window.location);
  window.location.assign = function(url){
    if(typeof url === 'string') url = proxify(url);
    return originalAssign(url);
  };

  const originalReplace = window.location.replace.bind(window.location);
  window.location.replace = function(url){
    if(typeof url === 'string') url = proxify(url);
    return originalReplace(url);
  };

  const originalPushState = history.pushState.bind(history);
  history.pushState = function(state, title, url){
    if(typeof url === 'string') url = proxify(url);
    return originalPushState(state, title, url);
  };

  const originalReplaceState = history.replaceState.bind(history);
  history.replaceState = function(state, title, url){
    if(typeof url === 'string') url = proxify(url);
    return originalReplaceState(state, title, url);
  };

  const originalSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function(name, value){
    if(typeof name === 'string' && typeof value === 'string'){
      const attr = name.toLowerCase();
      if(['src','href','action','poster','data','manifest'].includes(attr)){
        value = proxify(value);
      }
    }
    return originalSetAttribute.call(this, name, value);
  };

  if(navigator.serviceWorker){
    const register = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    navigator.serviceWorker.register = function(scriptURL, options){
      if(typeof scriptURL === 'string') scriptURL = proxify(scriptURL);
      return register(scriptURL, options);
    };
  }

  if(window.Worker){
    const NativeWorker = window.Worker;
    window.Worker = function(scriptURL, options){
      if(typeof scriptURL === 'string') scriptURL = proxify(scriptURL);
      return new NativeWorker(scriptURL, options);
    };
  }

  if(window.SharedWorker){
    const NativeSharedWorker = window.SharedWorker;
    window.SharedWorker = function(scriptURL, name){
      if(typeof scriptURL === 'string') scriptURL = proxify(scriptURL);
      return new NativeSharedWorker(scriptURL, name);
    };
  }
})();
`;

function stripSecurityHeaders(headers, res){
  const blacklist = [
    'content-security-policy',
    'content-security-policy-report-only',
    'x-frame-options',
    'x-content-type-options',
    'x-xss-protection',
    'permissions-policy',
    'permission-policy',
    'cross-origin-opener-policy',
    'cross-origin-embedder-policy',
    'cross-origin-resource-policy',
    'referrer-policy',
  ];
  blacklist.forEach((name) => {
    if(Object.prototype.hasOwnProperty.call(headers, name)) delete headers[name];
    if(res && typeof res.removeHeader === 'function') res.removeHeader(name);
  });
}

function isDataOrSpecialScheme(value){
  return /^data:|^blob:|^javascript:|^mailto:|^tel:|^about:|^filesystem:/i.test(value);
}

function makeAbsolute(base, relative){
  try { return new URL(relative, base).href; } catch (err) { return relative; }
}

function buildProxyUrl(target){
  return `${PROXY_PATH}/${PROXY_QUERY}${encodeURIComponent(target)}`;
}

function normalizeTarget(raw){
  const cleaned = raw.trim();
  if(/^(?:\/\/)/.test(cleaned)) return `https:${cleaned}`;
  if(/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(cleaned)) return cleaned;
  return `https://${cleaned}`;
}

function rewriteAttribute($, element, attr, baseUrl){
  const value = $(element).attr(attr);
  if(!value || isDataOrSpecialScheme(value) || value.startsWith('#')) return;
  const absolute = makeAbsolute(baseUrl, value);
  $(element).attr(attr, buildProxyUrl(absolute));
}

function rewriteSrcSet(value, baseUrl){
  if(!value) return value;
  return value
    .split(',')
    .map((item) => {
      const parts = item.trim().split(/\s+/);
      const url = parts[0];
      if(isDataOrSpecialScheme(url)) return item;
      const absolute = makeAbsolute(baseUrl, url);
      return [buildProxyUrl(absolute), parts.slice(1).join(' ')].filter(Boolean).join(' ');
    })
    .join(', ');
}

function rewriteInlineScript(text, baseUrl){
  if(!text) return text;

  let rewritten = text;
  rewritten = rewritten.replace(/import\(\s*(['"])([^'"\)]+)\1\s*\)/g, (match, quote, url) => {
    if(isDataOrSpecialScheme(url) || url.startsWith(PROXY_PATH)) return match;
    return `import(${quote}${buildProxyUrl(makeAbsolute(baseUrl, url))}${quote})`;
  });
  rewritten = rewritten.replace(/(?:from|import)\s+(['"])([^'"\)]+)\1/g, (match, quote, url) => {
    if(isDataOrSpecialScheme(url) || url.startsWith(PROXY_PATH)) return match;
    return match.replace(url, buildProxyUrl(makeAbsolute(baseUrl, url)));
  });
  rewritten = rewritten.replace(/navigator\.serviceWorker\.register\(\s*(['"])([^'"\)]+)\1/g, (match, quote, url) => {
    if(isDataOrSpecialScheme(url) || url.startsWith(PROXY_PATH)) return match;
    return `navigator.serviceWorker.register(${quote}${buildProxyUrl(makeAbsolute(baseUrl, url))}${quote}`;
  });
  rewritten = rewritten.replace(/new\s+Worker\(\s*(['"])([^'"\)]+)\1/g, (match, quote, url) => {
    if(isDataOrSpecialScheme(url) || url.startsWith(PROXY_PATH)) return match;
    return `new Worker(${quote}${buildProxyUrl(makeAbsolute(baseUrl, url))}${quote}`;
  });
  rewritten = rewritten.replace(/new\s+SharedWorker\(\s*(['"])([^'"\)]+)\1/g, (match, quote, url) => {
    if(isDataOrSpecialScheme(url) || url.startsWith(PROXY_PATH)) return match;
    return `new SharedWorker(${quote}${buildProxyUrl(makeAbsolute(baseUrl, url))}${quote}`;
  });
  rewritten = rewritten.replace(/window\.open\(\s*(['"])([^'"\)]+)\1/g, (match, quote, url) => {
    if(isDataOrSpecialScheme(url) || url.startsWith(PROXY_PATH)) return match;
    return `window.open(${quote}${buildProxyUrl(makeAbsolute(baseUrl, url))}${quote}`;
  });
  return rewritten;
}

function rewriteJsonManifest(text, baseUrl){
  try{
    const data = JSON.parse(text);
    const rewriteValue = (value) => {
      if(typeof value !== 'string') return value;
      if(isDataOrSpecialScheme(value) || value.startsWith(PROXY_PATH)) return value;
      return buildProxyUrl(makeAbsolute(baseUrl, value));
    };

    if(data.start_url) data.start_url = rewriteValue(data.start_url);
    if(data.scope) data.scope = rewriteValue(data.scope);
    if(Array.isArray(data.icons)){
      data.icons = data.icons.map((icon) => {
        if(icon && icon.src) icon.src = rewriteValue(icon.src);
        return icon;
      });
    }
    return JSON.stringify(data);
  }catch(e){
    return text;
  }
}

function rewriteCSS(css, baseUrl){
  if(!css) return css;
  return css
    .replace(/url\(([^)]+)\)/g, (match, raw) => {
      const value = raw.trim().replace(/^['"]|['"]$/g, '');
      if(isDataOrSpecialScheme(value)) return `url(${value})`;
      const absolute = makeAbsolute(baseUrl, value);
      return `url(${buildProxyUrl(absolute)})`;
    })
    .replace(/@import\s+(?:url\()?['"]?([^'"\)]+)['"]?\)?/g, (match, url) => {
      if(isDataOrSpecialScheme(url) || url.startsWith(PROXY_PATH)) return match;
      return `@import url('${buildProxyUrl(makeAbsolute(baseUrl, url))}')`;
    });
}

function rewriteHTML(html, originUrl){
  const $ = cheerio.load(html, { decodeEntities: false });
  const baseUrl = originUrl;

  if($('base').length){
    $('base').attr('href', buildProxyUrl(baseUrl));
  } else {
    $('head').prepend(`<base href="${buildProxyUrl(baseUrl)}">`);
  }

  const rewrites = [
    ['a', 'href'],
    ['area', 'href'],
    ['link', 'href'],
    ['img', 'src'],
    ['script', 'src'],
    ['iframe', 'src'],
    ['embed', 'src'],
    ['source', 'src'],
    ['track', 'src'],
    ['audio', 'src'],
    ['video', 'src'],
    ['input', 'src'],
    ['form', 'action'],
    ['object', 'data'],
    ['html', 'manifest'],
    ['blockquote', 'cite'],
    ['del', 'cite'],
    ['ins', 'cite'],
    ['q', 'cite'],
  ];

  rewrites.forEach(([tag, attr]) => {
    $(tag).each((_, element) => rewriteAttribute($, element, attr, baseUrl));
  });

  $('link[href]').each((_, element) => {
    const rel = ($(element).attr('rel') || '').toLowerCase();
    if(['dns-prefetch', 'preconnect'].includes(rel)) return;
    rewriteAttribute($, element, 'href', baseUrl);
  });

  $('img[srcset], source[srcset]').each((_, element) => {
    const value = $(element).attr('srcset');
    $(element).attr('srcset', rewriteSrcSet(value, baseUrl));
  });

  $('[style]').each((_, element) => {
    const value = $(element).attr('style');
    if(value) $(element).attr('style', rewriteCSS(value, baseUrl));
  });

  $('style').each((_, element) => {
    const value = $(element).html();
    if(value) $(element).html(rewriteCSS(value, baseUrl));
  });

  $('meta[http-equiv="refresh"]').each((_, element) => {
    const content = $(element).attr('content');
    if(content){
      const match = content.match(/url=(.+)$/i);
      if(match){
        const absolute = makeAbsolute(baseUrl, match[1].trim());
        $(element).attr('content', `0; url=${buildProxyUrl(absolute)}`);
      }
    }
  });

  $('script').each((_, element) => {
    if($(element).attr('src')) return;
    const type = ($(element).attr('type') || 'text/javascript').toLowerCase();
    if(type.includes('ld+json') || type.includes('json')) return;
    const text = $(element).html();
    if(text) $(element).html(rewriteInlineScript(text, baseUrl));
  });

  $('script[type="importmap"]').each((_, element) => {
    const text = $(element).html();
    if(!text) return;
    try{
      const importmap = JSON.parse(text);
      const rewriteEntry = (value) => {
        if(typeof value !== 'string') return value;
        if(isDataOrSpecialScheme(value) || value.startsWith(PROXY_PATH)) return value;
        return buildProxyUrl(makeAbsolute(baseUrl, value));
      };
      if(importmap.imports){
        Object.keys(importmap.imports).forEach((key) => {
          importmap.imports[key] = rewriteEntry(importmap.imports[key]);
        });
      }
      if(importmap.scopes){
        Object.keys(importmap.scopes).forEach((scope) => {
          const scopeDef = importmap.scopes[scope];
          Object.keys(scopeDef).forEach((key) => {
            scopeDef[key] = rewriteEntry(scopeDef[key]);
          });
        });
      }
      $(element).html(JSON.stringify(importmap));
    }catch(e){}
  });

  $('link[rel="manifest"]').each((_, element) => rewriteAttribute($, element, 'href', baseUrl));

  const head = $('head');
  if(head.length){
    head.prepend(`<script>${PROXY_RUNTIME}</script>`);
  } else {
    $('body').prepend(`<script>${PROXY_RUNTIME}</script>`);
  }

  return $.html();
}

async function getCookieJar(req){
  const raw = req.session && req.session.cookieJarJson;
  if(raw){
    try{ return CookieJar.fromJSON(raw); } catch (err) {}
  }
  return new CookieJar();
}

async function saveCookieJar(req, jar){
  try{
    const json = await new Promise((resolve, reject) => jar.serialize((err, serialized) => err ? reject(err) : resolve(serialized)));
    req.session.cookieJarJson = json;
  }catch(e){}
}

function rewriteSetCookie(cookieStr, proxySecure){
  return cookieStr
    .split(';')
    .map((part) => part.trim())
    .filter((part) => !/^domain=/i.test(part))
    .filter((part) => proxySecure || !/^secure$/i.test(part))
    .filter((part) => !/^samesite=/i.test(part))
    .join('; ');
}

async function parseTarget(req){
  const incoming = new URL(req.url, `${req.protocol}://${req.get('host')}`);
  const rawTarget = incoming.searchParams.get('target') || incoming.searchParams.get('url') || req.path.replace(/^\/service\/?/i, '');
  if(!rawTarget) return null;
  return normalizeTarget(decodeURIComponent(rawTarget));
}

router.all('/*', async (req, res) => {
  try{
    const targetHref = await parseTarget(req);
    if(!targetHref) return res.status(400).send('No target specified');
    const targetUrl = new URL(targetHref);
    const isSecureProxy = req.secure || req.headers['x-forwarded-proto'] === 'https';

    const headers = Object.assign({}, req.headers);
    delete headers.cookie;
    delete headers.host;
    delete headers.connection;
    delete headers['content-length'];

    headers.host = targetUrl.host;
    if(headers.referer && headers.referer.includes(req.hostname)) headers.referer = targetUrl.origin;
    if(headers.origin && headers.origin.includes(req.hostname)) headers.origin = targetUrl.origin;
    headers['accept-language'] = headers['accept-language'] || 'en-US,en;q=0.9';
    headers['user-agent'] = headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';

    const jar = await getCookieJar(req);
    const cookieHeader = await new Promise((resolve) => jar.getCookieString(targetUrl.href, {}, (err, cookie) => resolve(cookie || '')));
    if(cookieHeader) headers.cookie = cookieHeader;

    const gotOptions = {
      headers,
      method: req.method,
      throwHttpErrors: false,
      decompress: false,
      isStream: true,
      retry: { limit: 0 },
    };
    if(req.method !== 'GET' && req.method !== 'HEAD' && req.body === undefined){
      gotOptions.body = req;
    }

    const upstream = got.stream(targetUrl.href, gotOptions);

    upstream.on('error', (error) => {
      if(!res.headersSent) res.status(502).send('Upstream request failed');
      upstream.destroy();
    });

    upstream.on('response', async (proxRes) => {
      try{
        const responseHeaders = Object.assign({}, proxRes.headers);
        stripSecurityHeaders(responseHeaders, res);

        if(responseHeaders.location){
          try{
            const absoluteLocation = new URL(responseHeaders.location, targetUrl.href).href;
            responseHeaders.location = buildProxyUrl(absoluteLocation);
          }catch(e){}
        }

        const setCookies = proxRes.headers['set-cookie'];
        if(setCookies){
          const cookies = Array.isArray(setCookies) ? setCookies : [setCookies];
          responseHeaders['set-cookie'] = cookies.map((cookieStr) => rewriteSetCookie(cookieStr, isSecureProxy));
          for(const cookieStr of cookies){
            try{
              await new Promise((resolve, reject) => jar.setCookie(cookieStr, targetUrl.href, {}, (err) => err ? reject(err) : resolve()));
            }catch(e){}
          }
        }

        const contentEncoding = (proxRes.headers['content-encoding'] || '').toLowerCase().trim();
        const contentType = proxRes.headers['content-type'] || '';
        const isText = /text\/html|text\/css|javascript|json/i.test(contentType);
        const isHTML = /text\/html/i.test(contentType);
        const isJS = /javascript|ecmascript|module/i.test(contentType);
        const isCSS = /text\/css/i.test(contentType);
        const isJSON = /application\/json|application\/manifest\+json|text\/json/i.test(contentType);
        const shouldRewrite = isText;

        console.info('[Proxy] response', {
          target: targetUrl.href,
          contentType,
          contentEncoding,
          shouldRewrite,
          statusCode: proxRes.statusCode,
        });

        if (!shouldRewrite) {
          ['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailers','transfer-encoding','upgrade'].forEach((name) => delete responseHeaders[name]);
          responseHeaders['x-proxied-by'] = 'CustomProxy';
          console.info('[Proxy] binary pass-through', { target: targetUrl.href, contentType, contentEncoding });
          res.writeHead(proxRes.statusCode, responseHeaders);
          upstream.pipe(res);
          return;
        }

        const chunks = [];
        upstream.on('data', (chunk) => chunks.push(chunk));
        upstream.on('end', async () => {
          try {
            const rawBuffer = Buffer.concat(chunks);
            let decodedBuffer = rawBuffer;
            let decompressed = false;
            let decompressionError = false;

            if (contentEncoding.includes('br')) {
              try {
                decodedBuffer = zlib.brotliDecompressSync(rawBuffer);
                decompressed = true;
              } catch (err) {
                decompressionError = true;
                console.error('[Proxy] Brotli decompression failed', { target: targetUrl.href, error: err.message });
              }
            } else if (contentEncoding.includes('gzip')) {
              decodedBuffer = zlib.gunzipSync(rawBuffer);
              decompressed = true;
            } else if (contentEncoding.includes('deflate')) {
              decodedBuffer = zlib.inflateSync(rawBuffer);
              decompressed = true;
            }

            console.info('[Proxy] decompression', {
              target: targetUrl.href,
              contentEncoding,
              decompressed,
              decompressionError,
            });

            if (decompressionError) {
              ['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailers','transfer-encoding','upgrade'].forEach((name) => delete responseHeaders[name]);
              responseHeaders['x-proxied-by'] = 'CustomProxy';
              res.writeHead(proxRes.statusCode, responseHeaders);
              res.end(rawBuffer);
              return;
            }

            const text = decodedBuffer.toString('utf8');
            let rewritten = text;
            if (isHTML) rewritten = rewriteHTML(text, targetUrl.href);
            else if (isJS) rewritten = PROXY_RUNTIME + '\n' + rewriteInlineScript(text, targetUrl.href);
            else if (isCSS) rewritten = rewriteCSS(text, targetUrl.href);
            else if (isJSON) rewritten = rewriteJsonManifest(text, targetUrl.href);

            const acceptEncoding = req.headers['accept-encoding'] || '';
            let outputBuffer = Buffer.from(rewritten, 'utf8');
            if (/br/.test(acceptEncoding)) {
              outputBuffer = zlib.brotliCompressSync(outputBuffer);
              responseHeaders['content-encoding'] = 'br';
            } else if (/gzip/.test(acceptEncoding)) {
              outputBuffer = zlib.gzipSync(outputBuffer);
              responseHeaders['content-encoding'] = 'gzip';
            } else {
              delete responseHeaders['content-encoding'];
            }

            delete responseHeaders['transfer-encoding'];
            responseHeaders['content-length'] = Buffer.byteLength(outputBuffer).toString();
            responseHeaders['x-proxied-by'] = 'CustomProxy';
            ['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailers','upgrade'].forEach((name) => delete responseHeaders[name]);

            console.info('[Proxy] rewritten and recompressed', {
              target: targetUrl.href,
              newEncoding: responseHeaders['content-encoding'] || 'identity',
              length: responseHeaders['content-length'],
            });

            res.writeHead(proxRes.statusCode, responseHeaders);
            res.end(outputBuffer);
            await saveCookieJar(req, jar);
          } catch (e) {
            console.error('[Proxy] text rewrite failed', e);
            if (!res.headersSent) res.status(500).send('Proxy rewrite failed');
          }
        });
        return;
      } catch (e) {
        console.error('Proxy response handling error', e);
        if (!res.headersSent) res.status(500).send('Proxy processing error');
      }
    });
  }catch(error){
    console.error('Proxy handler error', error);
    res.status(500).send('Proxy error');
  }
});

function attachUpgrade(server){
  server.on('upgrade', (req, socket, head) => {
    try{
      const incoming = new URL(req.url, `http://${req.headers.host}`);
      const rawTarget = incoming.searchParams.get('target') || incoming.searchParams.get('url') || req.url.replace(/^\/service\/?/i, '');
      if(!rawTarget) return socket.destroy();
      const target = normalizeTarget(decodeURIComponent(rawTarget));
      const targetUrl = new URL(target);
      const wsProtocol = targetUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsTarget = targetUrl.href.replace(/^https?:/, wsProtocol);
      wsProxy.ws(req, socket, head, { target: wsTarget, changeOrigin: true }, (err) => {
        if(err) socket.end();
      });
    }catch(e){
      socket.destroy();
    }
  });
}

module.exports = router;
module.exports.attachUpgrade = attachUpgrade;
