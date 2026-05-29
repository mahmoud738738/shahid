const express = require('express');
const path = require('path');
const cron = require('node-cron');
const { scrapeRecent, crawlFull, loadCache, loadStatus } = require('./scraper/index');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.locals.siteName = 'شاهد';
app.locals.siteUrl = `http://localhost:${PORT}`;

let syncing = false;
let syncLog = [];

function getData() {
  return { cache: loadCache(), status: loadStatus() };
}

function paginate(movies, page, perPage = 24) {
  const total = movies.length;
  const totalPages = Math.ceil(total / perPage) || 1;
  const start = (page - 1) * perPage;
  return {
    movies: movies.slice(start, start + perPage),
    page, totalPages, total,
  };
}

app.get('/', (req, res) => {
  const { cache, status } = getData();
  const page = parseInt(req.query.page, 10) || 1;
  const latest = cache.movies.slice(0, 6);
  const p = paginate(cache.movies, page);
  res.render('index', { ...p, latest, updatedAt: cache.updatedAt, status });
});

app.get('/movies', (req, res) => {
  const { cache, status } = getData();
  const page = parseInt(req.query.page, 10) || 1;
  const films = cache.movies.filter(m => m.type === 'film');
  res.render('category', { ...paginate(films, page), category: 'الأفلام', updatedAt: cache.updatedAt, status });
});

app.get('/series', (req, res) => {
  const { cache, status } = getData();
  const page = parseInt(req.query.page, 10) || 1;
  const series = cache.movies.filter(m => m.type === 'series');
  res.render('category', { ...paginate(series, page), category: 'المسلسلات', updatedAt: cache.updatedAt, status });
});

app.get('/search', (req, res) => {
  const { cache } = getData();
  const q = (req.query.q || '').trim().toLowerCase();
  const results = q ? cache.movies.filter(m =>
    m.title?.toLowerCase().includes(q) ||
    m.quality?.toLowerCase().includes(q) ||
    m.category?.toLowerCase().includes(q) ||
    m.genre?.toLowerCase().includes(q) ||
    m.year?.includes(q)
  ) : [];
  res.render('search', { query: q, movies: results });
});

app.get('/movie/:vid', (req, res) => {
  const { cache } = getData();
  const movie = cache.movies.find(m => m.vid === req.params.vid);
  if (!movie) return res.status(404).render('404');

  const related = cache.movies
    .filter(m => m.vid !== movie.vid && (
      m.category === movie.category ||
      m.genre?.split(' ، ').some(g => movie.genre?.includes(g))
    ))
    .slice(0, 6);

  res.render('movie', { movie, related });
});

app.get('/category/:cat', (req, res) => {
  const { cache } = getData();
  const cat = req.params.cat.replace(/-/g, ' ');
  const filtered = cache.movies.filter(m =>
    m.category?.toLowerCase().includes(cat) ||
    m.genre?.toLowerCase().includes(cat)
  );
  res.render('category', { ...paginate(filtered, 1), category: cat, updatedAt: cache.updatedAt });
});

app.get('/sync', (req, res) => {
  const { cache, status } = getData();
  res.render('sync', { syncing, status: { ...status, movieCount: cache.movies.length }, syncLog, updatedAt: cache.updatedAt });
});

app.post('/api/sync', async (req, res) => {
  const mode = req.query.mode || 'recent';
  if (syncing) return res.json({ error: 'Sync already in progress' });
  syncing = true;
  syncLog = [];

  const log = (msg) => {
    console.log(msg);
    syncLog.push({ time: new Date().toISOString(), msg });
  };

  res.json({ started: true, mode });

  try {
    log(`بدء المزامنة (${mode === 'full' ? 'كاملة' : 'أحدث الإضافات'})...`);
    if (mode === 'full') {
      await crawlFull();
    } else {
      await scrapeRecent(3);
    }
    log('تمت المزامنة بنجاح');
  } catch (err) {
    log(`خطأ: ${err.message}`);
  } finally {
    syncing = false;
  }
});

app.get('/api/movies', (req, res) => {
  const { cache } = getData();
  const page = parseInt(req.query.page, 10) || 1;
  const perPage = parseInt(req.query.perPage, 10) || 50;
  const total = cache.movies.length;
  const start = (page - 1) * perPage;
  const items = cache.movies.slice(start, start + perPage);
  res.json({ total, page, perPage, movies: items.map(m => ({
    vid: m.vid, title: m.title, year: m.year, poster: m.poster,
    quality: m.quality, category: m.category, genre: m.genre, type: m.type,
  })) });
});

app.get('/api/movie/:vid', (req, res) => {
  const { cache } = getData();
  const movie = cache.movies.find(m => m.vid === req.params.vid);
  if (!movie) return res.status(404).json({ error: 'Not found' });
  res.json(movie);
});

app.get('/api/status', (req, res) => {
  const { cache, status } = getData();
  res.json({ ...status, movieCount: cache.movies.length, syncing });
});

// Auto-sync: every 30 minutes check for new items
cron.schedule('*/30 * * * *', async () => {
  if (syncing) return;
  console.log('[Cron] Auto-sync checking for new content...');
  syncing = true;
  try {
    await scrapeRecent(3);
    console.log('[Cron] Auto-sync complete');
  } catch (err) {
    console.error('[Cron] Auto-sync failed:', err.message);
  } finally {
    syncing = false;
  }
});

// Full refresh: once daily at 3 AM
cron.schedule('0 3 * * *', async () => {
  if (syncing) return;
  console.log('[Cron] Daily full refresh starting...');
  syncing = true;
  try {
    await crawlFull();
    console.log('[Cron] Daily full refresh complete');
  } catch (err) {
    console.error('[Cron] Daily full refresh failed:', err.message);
  } finally {
    syncing = false;
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] ${app.locals.siteName} running on http://0.0.0.0:${PORT}`);
  // Initial scrape if DB is empty
  const { cache } = getData();
  if (cache.movies.length === 0) {
    console.log('[Server] First run - initializing data...');
    scrapeRecent(2).catch(() => {});
  }
});
