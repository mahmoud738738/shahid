const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const URL_SOURCE = 'https://yalashout.com/';
const outputFile = path.join(__dirname, '../data/matches.json');

async function scrapeMatches() {
  try {
    console.log('[Matches] Fetching from yalashout.com...');
    const { data } = await axios.get(URL_SOURCE, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
      },
      timeout: 30000,
    });

    const $ = cheerio.load(data);
    const matches = [];

    // yalashout.com structure:
    // Each league section: div.mb-12 containing:
    //   - League header with league name and country
    //   - Match cards: div with classes "relative p-4 rounded-xl border"
    
    // Find all league sections
    const leagueSections = $('div.mb-12');
    
    leagueSections.each((sectionIdx, section) => {
      const $section = $(section);
      
      // Get league name from the section header
      const leagueName = $section.find('h2').first().text().trim();
      const leagueCountry = $section.find('p.text-xs').first().text().trim();
      
      // Get league logo
      const leagueLogo = $section.find('div.w-8.h-8 img').first().attr('src') || '';
      
      // Find all match cards in this section
      const matchCards = $section.find('div.relative.rounded-xl.border');
      
      matchCards.each((cardIdx, card) => {
        const $card = $(card);
        
        // Extract team names - they're in spans with specific classes
        const teamNameSpans = $card.find('span.text-white.font-semibold.text-sm');
        const team1 = $(teamNameSpans[0]).text().trim();
        const team2 = $(teamNameSpans[1]).text().trim();
        
        if (!team1 || !team2) return;
        
        // Extract team logos from sofascore API img tags
        const teamLogos = $card.find('img[src*="sofascore"], img[src*="team"]');
        const logo1 = $(teamLogos[0]).attr('src') || '';
        const logo2 = $(teamLogos[1]).attr('src') || '';
        
        // Extract score - look for score spans
        const scoreSpans = $card.find('span.text-2xl.font-bold.text-white');
        let score = '';
        if (scoreSpans.length >= 2) {
          const s1 = $(scoreSpans[0]).text().trim();
          const s2 = $(scoreSpans[1]).text().trim();
          if (s1 !== '' && s2 !== '') {
            score = s1 + ' - ' + s2;
          }
        }
        
        // Extract time - look for time display
        const timeEl = $card.find('span.text-xs.text-slate-400, span.tabular-nums, div.text-sm.text-slate-300');
        let time = '';
        timeEl.each((_, el) => {
          const t = $(el).text().trim();
          if (t.match(/\d{1,2}:\d{2}/) && !time) {
            time = t;
          }
        });
        
        // Extract status from hover overlay
        const statusOverlay = $card.find('div.absolute.inset-0 span').last();
        let status = statusOverlay.text().trim();
        
        // Check for live indicators (pulsing dot or specific classes)
        const liveIndicator = $card.find('.animate-ping, .animate-pulse, [class*="bg-red-500"], [class*="bg-green-500"]');
        const hasLiveDot = liveIndicator.length > 0;
        
        // Also check for "مباشر" text or live class
        const cardText = $card.text();
        if (hasLiveDot || cardText.includes('مباشر') || cardText.includes('الشوط')) {
          if (!status || status === '') {
            status = 'جارية الآن';
          }
        }
        
        if (!status) {
          if (score) {
            status = 'انتهت';
          } else {
            status = 'لم تبدأ بعد';
          }
        }
        
        // Extract channel info
        const channelSpans = $card.find('span.truncate');
        let channel = '';
        channelSpans.each((_, el) => {
          const txt = $(el).text().trim();
          if (txt && txt !== leagueName && !txt.includes(team1) && !txt.includes(team2)) {
            channel = txt;
          }
        });
        if (!channel) channel = 'غير محدد';
        
        // Try to get match link
        const matchLink = $card.closest('a').attr('href') || $card.find('a').first().attr('href') || '';
        let fullLink = matchLink;
        if (matchLink && !matchLink.startsWith('http')) {
          fullLink = 'https://yalashout.com' + matchLink;
        }
        
        // Generate unique ID
        const idSource = team1 + '-vs-' + team2 + '-' + sectionIdx;
        const id = crypto.createHash('md5').update(idSource).digest('hex').substring(0, 8);
        
        matches.push({
          id,
          team1,
          team2,
          logo1,
          logo2,
          time: time || '',
          score,
          league: leagueName || '',
          leagueCountry: leagueCountry || '',
          leagueLogo,
          channel,
          commentator: '',
          status,
          link: fullLink || URL_SOURCE,
          embedUrl: fullLink || URL_SOURCE,
        });
      });
    });

    // Sort matches: live first, then upcoming, then finished
    const getPriority = (status) => {
      if (!status) return 3;
      if (status.includes('جارية') || status.includes('الآن') || status.includes('مباشر') || status.includes('الشوط')) return 1;
      if (status.includes('لم تبدأ') || status.includes('بعد') || status.includes('قريب')) return 2;
      return 3; // انتهت and anything else
    };
    matches.sort((a, b) => getPriority(a.status) - getPriority(b.status));

    // Save to JSON
    const outputData = {
      updatedAt: new Date().toISOString(),
      source: 'yalashout.com',
      matches,
    };

    // Ensure data directory exists
    const dataDir = path.dirname(outputFile);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));
    console.log(`[Matches] Successfully scraped ${matches.length} matches from yalashout.com`);

  } catch (error) {
    console.error('[Matches] Error scraping:', error.message);
    // Don't overwrite existing data on error
  }
}

scrapeMatches();
