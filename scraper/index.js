const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const BASE = 'https://mycima.date';
const DATA_FILE = path.join(__dirname, '..', 'data', 'movies.json');
const STATUS_FILE = path.join(__dirname, '..', 'data', 'status.json');
const TIMEOUT = 30000;
const PAGE_DELAY = 1200;
const DETAIL_DELAY = 1000;
const CONCURRENCY = 3;

const axiosInstance = axios.create({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
  },
  timeout: TIMEOUT,
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { movies: [], updatedAt: null };
  }
}

function saveCache(data) {
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function loadStatus() {
  try {
    return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
  } catch {
    return { totalPages: 0, lastFullScan: null, scannedPages: 0, movieCount: 0, lastError: null };
  }
}

function saveStatus(s) {
  fs.writeFileSync(STATUS_FILE, JSON.stringify(s, null, 2), 'utf8');
}

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const { data } = await axiosInstance.get(url);
      return data;
    } catch (err) {
      if (i === retries - 1) throw err;
      console.log(`[Fetch] Retry ${i + 1}/${retries} for ${url}: ${err.message}`);
      await sleep(3000 * (i + 1));
    }
  }
}

async function getTotalPages() {
  const html = await fetchWithRetry(BASE);
  const $ = cheerio.load(html);
  const links = $('a.page-link, a.page-numbers, .pagination a');
  let max = 1;
  links.each((_, el) => {
    const n = parseInt($(el).text().trim(), 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return max;
}

async function scrapeHomepage(page = 1) {
  const url = page === 1 ? BASE : `${BASE}/index.php?&page=${page}`;
  const html = await fetchWithRetry(url);
  const $ = cheerio.load(html);
  const items = [];

  $('div.GridItem').each((_, el) => {
    const $el = $(el);
    const linkEl = $el.find('div.Thumb--GridItem a').first();
    const href = linkEl.attr('href');
    if (!href) return;
    const vid = href.match(/vid=([a-f0-9]+)/i)?.[1];
    if (!vid) return;

    const titleEl = $el.find('strong.hasyear');
    const title = titleEl.clone().children('span').remove().end().text().trim();
    const year = $el.find('span.year').text().trim().replace(/[()]/g, '');
    const imgEl = $el.find('img.ThumbImg');
    const poster = imgEl.attr('data-lazy-src') || imgEl.attr('src') || '';

    items.push({ vid, title, year, poster, url: href });
  });

  return items;
}

async function scrapeMoviePage(vid) {
  const url = `${BASE}/watch.php?vid=${vid}`;
  const html = await fetchWithRetry(url);
  const $ = cheerio.load(html);

  const rawTitle = $('div.Title--Content--Single-begin h1').text().trim();
  const title = rawTitle
    .replace(/^مشاهدة\s*(فيلم|مسلسل)?\s*/i, '')
    .replace(/\s*\(\d{4}\)\s*$/i, '')
    .replace(/\s*مترجم\s*اون لاين\s*$/i, '')
    .replace(/\s*اون لاين\s*$/i, '')
    .replace(/\s*مترجم\s*$/i, '')
    .replace(/\s*اون لاين\s*/i, '')
    .trim();
  const story = $('div.StoryMovieContent div').first().text().trim();
  const poster = $('meta[property="og:image"]').attr('content') || '';

  const meta = {};
  const arMap = { 'التصنيف':'category', 'النوع':'genre', 'السنة':'year', 'الجودة':'quality', 'المدة':'duration' };
  $('ul.Terms--Content--Single-begin li').each((_, el) => {
    const $el = $(el);
    const label = $el.find('span').text().trim();
    const value = $el.find('p').text().trim();
    meta[arMap[label] || label] = value;
  });

  const servers = [];
  $('div.WatchServersList ul li btn.watch-server-btn').each((_, el) => {
    const $btn = $(el);
    const name = $btn.find('strong').text().trim();
    const embedUrl = $btn.attr('data-embed-url') || '';
    const dataUrl = $btn.attr('data-url') || '';
    
    // Filter out known ad servers / misleading buttons (like "Hgcloud" ads)
    const isAd = name.toLowerCase().includes('hgcloud') || 
                 embedUrl.includes('hgcloud') || 
                 name.toLowerCase().includes('اعلان') ||
                 name.toLowerCase().includes('ads');

    if (name && !isAd && embedUrl) {
      servers.push({
        name,
        embedUrl,
        dataUrl,
      });
    }
  });

  const downloads = [];
  $('div.panel.panel-default').each((_, panel) => {
    const $panel = $(panel);
    const quality = $panel.find('div.panel-heading h4.panel-title a span').text().trim();
    $panel.find('ul.List--Download--Wecima--Single li a').each((_, link) => {
      const $link = $(link);
      downloads.push({
        quality,
        label: $link.find('resolution').text().trim(),
        url: $link.attr('href') || '',
      });
    });
  });

  const cat = (meta['category'] || '').toLowerCase();
  const type = cat.includes('مسلسل') || cat.includes('كرتون') || cat.includes('انمي') || cat.includes('program') ? 'series' : 'film';

  return {
    vid, title, story, poster, posterThumb: poster,
    year: meta['year'] || '',
    quality: meta['quality'] || '',
    duration: meta['duration'] || '',
    category: meta['category'] || '',
    genre: meta['genre'] || '',
    type,
    servers, downloads,
    url,
    scrapedAt: new Date().toISOString(),
  };
}

async function scrapeRecent(pageLimit = 2) {
  const cache = loadCache();
  const existingVids = new Set(cache.movies.map(m => m.vid));
  const newItems = [];

  for (let p = 1; p <= pageLimit; p++) {
    const items = await scrapeHomepage(p);
    for (const item of items) {
      if (!existingVids.has(item.vid)) {
        newItems.push(item);
        existingVids.add(item.vid);
      }
    }
    await sleep(PAGE_DELAY);
  }

  console.log(`[Sync] ${newItems.length} new items found`);

  if (newItems.length === 0) return cache;

  const queue = [...newItems];
  while (queue.length > 0) {
    const batch = queue.splice(0, CONCURRENCY);
    const results = await Promise.allSettled(batch.map(item =>
      scrapeMoviePage(item.vid).then(details => {
        const idx = cache.movies.findIndex(m => m.vid === details.vid);
        if (idx >= 0) cache.movies[idx] = { ...cache.movies[idx], ...details };
        else cache.movies.unshift(details);
        saveCache(cache);
        console.log(`[Sync] + ${details.title}`);
      })
    ));
    for (const r of results) {
      if (r.status === 'rejected') console.error(`[Sync] Error: ${r.reason.message}`);
    }
    await sleep(DETAIL_DELAY);
  }

  console.log(`[Sync] Complete. Total: ${cache.movies.length}`);
  return cache;
}

async function crawlFull() {
  const status = loadStatus();
  console.log(`[FullScan] Checking total pages...`);
  const totalPages = await getTotalPages();
  console.log(`[FullScan] Total pages: ${totalPages}`);
  status.totalPages = totalPages;
  status.lastFullScan = new Date().toISOString();
  saveStatus(status);

  const cache = loadCache();
  const seenVids = new Set(cache.movies.map(m => m.vid));
  let newCount = 0;
  let skippedCount = 0;

  for (let p = 1; p <= totalPages; p++) {
    try {
      const items = await scrapeHomepage(p);
      const newItems = items.filter(item => !seenVids.has(item.vid));
      items.forEach(item => seenVids.add(item.vid));
      newCount += newItems.length;
      skippedCount += items.length - newItems.length;

      console.log(`[FullScan] Page ${p}/${totalPages} - ${newItems.length} new, ${items.length - newItems.length} skipped`);

      if (newItems.length > 0) {
        const queue = [...newItems];
        while (queue.length > 0) {
          const batch = queue.splice(0, CONCURRENCY);
          const results = await Promise.allSettled(batch.map(item =>
            scrapeMoviePage(item.vid).then(details => {
              const idx = cache.movies.findIndex(m => m.vid === details.vid);
              if (idx >= 0) cache.movies[idx] = { ...cache.movies[idx], ...details };
              else cache.movies.unshift(details);
              saveCache(cache);
            })
          ));
          for (const r of results) {
            if (r.status === 'rejected') console.error(`[FullScan] Detail error: ${r.reason.message}`);
          }
          await sleep(DETAIL_DELAY);
        }
      }

      status.scannedPages = p;
      status.movieCount = cache.movies.length;
      saveStatus(status);
      await sleep(PAGE_DELAY);
    } catch (err) {
      console.error(`[FullScan] Page ${p} failed: ${err.message}`);
      status.lastError = `Page ${p}: ${err.message}`;
      saveStatus(status);
      await sleep(5000);
    }
  }

  cache.updatedAt = new Date().toISOString();
  saveCache(cache);
  status.lastFullScan = new Date().toISOString();
  status.movieCount = cache.movies.length;
  status.lastError = null;
  saveStatus(status);
  console.log(`[FullScan] Complete! Total: ${cache.movies.length}`);
  return cache;
}

if (require.main === module) {
  const mode = process.argv[2] || 'recent';
  if (mode === 'full') {
    crawlFull().catch(console.error);
  } else {
    const pages = parseInt(process.argv[3], 10) || 2;
    scrapeRecent(pages).catch(console.error);
  }
}

module.exports = { scrapeRecent, crawlFull, loadCache, loadStatus, getTotalPages };
