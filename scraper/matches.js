const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const outputFile = path.join(__dirname, '../data/matches.json');

// Helper to format date as M/D/YYYY for Yallakora
function formatDateForYallakora(date) {
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

async function scrapeYallakoraDate(dateStr) {
  try {
    const url = `https://www.yallakora.com/match-center/%D9%85%D8%B1%D9%83%D8%B2-%D8%A7%D9%84%D9%85%D8%A8%D8%A7%D8%B1%D9%8A%D8%A7%D8%AA?date=${dateStr}`;
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      },
      timeout: 30000,
    });
    const $ = cheerio.load(data);
    const matches = [];

    $('.matchCard').each((idx, card) => {
      const $card = $(card);
      const leagueName = $card.find('.title h2').text().trim();
      
      const matchItems = $card.find('.item.future, .item.now, .item.finish');
      matchItems.each((_, item) => {
        const $item = $(item);
        const team1 = $item.find('.teamA p').text().trim();
        const logo1 = $item.find('.teamA img').attr('src') || '';
        const team2 = $item.find('.teamB p').text().trim();
        const logo2 = $item.find('.teamB img').attr('src') || '';
        
        let score = '';
        const scoreSpans = $item.find('.MResult .score');
        if (scoreSpans.length >= 2) {
          const s1 = $(scoreSpans[0]).text().trim();
          const s2 = $(scoreSpans[1]).text().trim();
          if (s1 !== '-' && s2 !== '-') {
            score = s1 + ' - ' + s2;
          }
        }
        
        const time = $item.find('.MResult .time').text().trim();
        const channel = $item.find('.channel').text().trim();
        const status = $item.find('.matchStatus span').text().trim();
        const matchLink = $item.find('a').first().attr('href') || '';
        const link = matchLink ? 'https://www.yallakora.com' + matchLink : 'https://www.yallakora.com/match-center/%D9%85%D8%B1%D9%83%D8%B2-%D8%A7%D9%84%D9%85%D8%A8%D8%A7%D8%B1%D9%8A%D8%A7%D8%AA';

        if (team1 && team2) {
          matches.push({
            id: crypto.createHash('md5').update(`${team1}-${team2}-${dateStr}`).digest('hex').substring(0, 8),
            team1, team2, logo1, logo2, time, score, league: leagueName, channel, status, link
          });
        }
      });
    });

    // Sort matches: live first, then upcoming, then finished
    const getPriority = (status) => {
      if (!status) return 3;
      if (status.includes('جارية') || status.includes('الآن') || status.includes('مباشر') || status.includes('الشوط')) return 1;
      if (status.includes('لم تبدأ') || status.includes('بعد') || status.includes('قريب')) return 2;
      return 3;
    };
    matches.sort((a, b) => getPriority(a.status) - getPriority(b.status));

    return matches;
  } catch(e) {
    console.error(`[Matches] Error fetching date ${dateStr}:`, e.message);
    return [];
  }
}

async function scrapeMatches() {
  try {
    console.log('[Matches] Fetching from Yallakora...');
    
    const today = new Date();
    
    const yesterdayDate = new Date(today);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    
    const tomorrowDate = new Date(today);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);

    const [yesterday, todayData, tomorrow] = await Promise.all([
      scrapeYallakoraDate(formatDateForYallakora(yesterdayDate)),
      scrapeYallakoraDate(formatDateForYallakora(today)),
      scrapeYallakoraDate(formatDateForYallakora(tomorrowDate))
    ]);

    const outputData = {
      updatedAt: new Date().toISOString(),
      source: 'yallakora.com',
      matches: {
        yesterday,
        today: todayData,
        tomorrow
      }
    };

    const dataDir = path.dirname(outputFile);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));
    console.log(`[Matches] Successfully scraped Yallakora: ${yesterday.length} yesterday, ${todayData.length} today, ${tomorrow.length} tomorrow.`);

  } catch (error) {
    console.error('[Matches] Error scraping:', error.message);
  }
}

scrapeMatches();
