const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const DIST_DIR = path.join(__dirname, 'dist');
const VIEWS_DIR = path.join(__dirname, 'views');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_FILE = path.join(__dirname, 'data', 'movies.json');
const SITE_URL = 'https://mahmoud738738.github.io/EgyShahid'; // Updated URL

// Helper functions
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
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

async function renderPage(template, data, outputPath) {
  const html = await ejs.renderFile(path.join(VIEWS_DIR, template), data);
  const fullOutputPath = path.join(DIST_DIR, outputPath);
  const dir = path.dirname(fullOutputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullOutputPath, html, 'utf8');
  console.log(`Generated: ${outputPath}`);
}

async function build() {
  console.log('Starting build process...');

  // 1. Prepare dist directory
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(DIST_DIR, { recursive: true });
  
  // 2. Copy public assets
  copyDir(PUBLIC_DIR, DIST_DIR);
  console.log('Copied public assets.');

  // 3. Load data
  let data = { movies: [], updatedAt: new Date().toISOString() };
  if (fs.existsSync(DATA_FILE)) {
    data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  }
  const movies = data.movies;
  const updatedAt = data.updatedAt;
  const status = { movieCount: movies.length };
  
  const siteName = 'EgyShahid';

  const sitemapUrls = [];
  sitemapUrls.push(`${SITE_URL}/`);

  // 4. Generate Home Pages (Pagination)
  const perPage = 24;
  const totalPages = Math.ceil(movies.length / perPage) || 1;
  
  const currentYear = new Date().getFullYear();
  let latest = movies.filter(m => parseInt(m.year) === currentYear).slice(0, 6);
  if (latest.length === 0) {
    const maxYear = Math.max(...movies.map(m => parseInt(m.year) || 0));
    if (maxYear > 0) {
      latest = movies.filter(m => parseInt(m.year) === maxYear).slice(0, 6);
    }
    if (latest.length === 0) latest = movies.slice(0, 6);
  }
  
  for (let page = 1; page <= totalPages; page++) {
    const pData = paginate(movies, page, perPage);
    const fileName = page === 1 ? 'index.html' : `page-${page}.html`;
    await renderPage('index.ejs', { ...pData, latest, updatedAt, status, siteName, pagePrefix: 'page-' }, fileName);
  }

  // 5. Generate Category Pages (Movies / Series / Programs)
  const films = movies.filter(m => m.type === 'film');
  const series = movies.filter(m => m.type === 'series' && m.category !== 'برامج تلفزيونية' && m.category !== 'عروض وحفلات');
  const programs = movies.filter(m => m.category === 'برامج تلفزيونية' || m.category === 'عروض وحفلات');

  // Movies
  const filmsTotalPages = Math.ceil(films.length / perPage) || 1;
  for (let page = 1; page <= filmsTotalPages; page++) {
    const fileName = page === 1 ? 'movies.html' : `movies-page-${page}.html`;
    await renderPage('category.ejs', { ...paginate(films, page, perPage), category: 'الأفلام', updatedAt, status, siteName, pagePrefix: 'movies-page-' }, fileName);
    if(page === 1) sitemapUrls.push(`${SITE_URL}/movies.html`);
  }

  // Series
  const seriesTotalPages = Math.ceil(series.length / perPage) || 1;
  for (let page = 1; page <= seriesTotalPages; page++) {
    const fileName = page === 1 ? 'series.html' : `series-page-${page}.html`;
    await renderPage('category.ejs', { ...paginate(series, page, perPage), category: 'المسلسلات', updatedAt, status, siteName, pagePrefix: 'series-page-' }, fileName);
    if(page === 1) sitemapUrls.push(`${SITE_URL}/series.html`);
  }

  // Programs
  const programsTotalPages = Math.ceil(programs.length / perPage) || 1;
  for (let page = 1; page <= programsTotalPages; page++) {
    const fileName = page === 1 ? 'programs.html' : `programs-page-${page}.html`;
    await renderPage('category.ejs', { ...paginate(programs, page, perPage), category: 'البرامج التلفزيونية', updatedAt, status, siteName, pagePrefix: 'programs-page-' }, fileName);
    if(page === 1) sitemapUrls.push(`${SITE_URL}/programs.html`);
  }

  // Group series by base title
  const seriesGroups = {};
  series.forEach(m => {
    const seasonMatch = m.title.match(/الموسم\s+([^\s]+)/);
    const episodeMatch = m.title.match(/الحلقة\s+(\d+)/);
    
    let seasonRaw = seasonMatch ? seasonMatch[1] : 'الاول';
    let ep = episodeMatch ? parseInt(episodeMatch[1], 10) : 1;
    
    const seasonMap = {
      'الاول': 1, 'الثاني': 2, 'الثالث': 3, 'الرابع': 4, 'الخامس': 5,
      'السادس': 6, 'السابع': 7, 'الثامن': 8, 'التاسع': 9, 'العاشر': 10
    };
    let s = parseInt(seasonRaw);
    if (isNaN(s)) s = seasonMap[seasonRaw] || 1;

    let baseName = m.title.replace(/الموسم\s+[^\s]+/g, '')
                          .replace(/الحلقة\s+\d+/g, '')
                          .replace(/مترجم[ة]?/g, '')
                          .replace(/مدبلج[ة]?/g, '')
                          .replace(/مسلسل\s*/, '')
                          .trim();
                          
    if (!seriesGroups[baseName]) seriesGroups[baseName] = { title: baseName, seasons: {} };
    if (!seriesGroups[baseName].seasons[s]) seriesGroups[baseName].seasons[s] = [];
    seriesGroups[baseName].seasons[s].push({ ...m, s, ep });
  });

  Object.values(seriesGroups).forEach(group => {
    Object.values(group.seasons).forEach(seasonEpisodes => {
      seasonEpisodes.sort((a, b) => a.ep - b.ep); // Sort ascending (1, 2, 3...)
    });
  });

  // 6. Generate Movie Details Pages
  for (let i = 0; i < movies.length; i++) {
    const movie = movies[i];
    
    let seriesData = null;
    if (movie.type === 'series') {
      let baseName = movie.title.replace(/الموسم\s+[^\s]+/g, '')
                            .replace(/الحلقة\s+\d+/g, '')
                            .replace(/مترجم[ة]?/g, '')
                            .replace(/مدبلج[ة]?/g, '')
                            .replace(/مسلسل\s*/, '')
                            .trim();
      seriesData = seriesGroups[baseName] || null;
    }

    const related = movies
      .filter(m => m.vid !== movie.vid && (
        m.category === movie.category ||
        m.genre?.split(' ، ').some(g => movie.genre?.includes(g))
      ))
      .slice(0, 6);
      
    await renderPage('movie.ejs', { movie, related, siteName, seriesData }, `movie/${movie.vid}.html`);
    sitemapUrls.push(`${SITE_URL}/movie/${movie.vid}.html`);
  }

  // 6.5 Generate Matches Pages
  const matchesFile = path.join(__dirname, 'data', 'matches.json');
  let matchesData = { yesterday: [], today: [], tomorrow: [] };
  let allMatches = [];
  if (fs.existsSync(matchesFile)) {
    try {
      matchesData = JSON.parse(fs.readFileSync(matchesFile, 'utf8')).matches || matchesData;
      if (Array.isArray(matchesData)) {
        // Fallback if old format is still somehow present
        matchesData = { yesterday: [], today: matchesData, tomorrow: [] };
      }
      allMatches = [...(matchesData.yesterday||[]), ...(matchesData.today||[]), ...(matchesData.tomorrow||[])];
    } catch (e) {
      console.error('Failed to parse matches.json', e);
    }
  }

  // Matches main page
  await renderPage('matches.ejs', { matches: matchesData, siteName }, 'matches.html');
  sitemapUrls.push(`${SITE_URL}/matches.html`);

  // Individual match pages
  const matchDir = path.join(DIST_DIR, 'match');
  if (!fs.existsSync(matchDir)) fs.mkdirSync(matchDir, { recursive: true });
  for (const match of allMatches) {
    await renderPage('match.ejs', { match, siteName, siteUrl: SITE_URL }, `match/${match.id}.html`);
    sitemapUrls.push(`${SITE_URL}/match/${match.id}.html`);
  }

  // 7. Generate Search Page and copy data
  const dataDistDir = path.join(DIST_DIR, 'data');
  if (!fs.existsSync(dataDistDir)) fs.mkdirSync(dataDistDir, { recursive: true });
  fs.copyFileSync(DATA_FILE, path.join(dataDistDir, 'movies.json'));
  if (fs.existsSync(matchesFile)) fs.copyFileSync(matchesFile, path.join(dataDistDir, 'matches.json'));
  
  await renderPage('search.ejs', { siteName }, 'search.html');
  sitemapUrls.push(`${SITE_URL}/search.html`);

  // 8. Generate Sitemap
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map(url => `  <url>\n    <loc>${url}</loc>\n    <lastmod>${updatedAt.split('T')[0]}</lastmod>\n  </url>`).join('\n')}
</urlset>`;
  fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), sitemapXml, 'utf8');
  console.log('Generated: sitemap.xml');

  // 8. Generate robots.txt
  const robotsTxt = `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml`;
  fs.writeFileSync(path.join(DIST_DIR, 'robots.txt'), robotsTxt, 'utf8');
  console.log('Generated: robots.txt');

  console.log('Build complete!');
}

build().catch(console.error);
