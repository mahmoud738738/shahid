const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const url = 'https://yalla-shoot.at/matches-today/';
const outputFile = path.join(__dirname, '../data/matches.json');

async function scrapeMatches() {
  try {
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });
    
    const $ = cheerio.load(data);
    const matches = [];

    // Yalla-Shoot typically uses classes like .match-container or similar
    // We need to adapt this selector based on their actual DOM
    $('.match-container, .albaf-match').each((i, el) => {
      const matchLink = $(el).find('a').attr('href');
      const team1 = $(el).find('.right-team .team-name').text().trim();
      const team2 = $(el).find('.left-team .team-name').text().trim();
      const time = $(el).find('.match-time').text().trim();
      const matchInfoLis = $(el).find('.match-info ul li span');
      const channel = $(matchInfoLis[0]).text().trim();
      const commentator = $(matchInfoLis[1]).text().trim();
      const league = $(matchInfoLis[2]).text().trim();
      const status = $(el).find('.date').text().trim();
      
      // Grab real image from data-src or src
      const logo1 = $(el).find('.right-team img').attr('data-src') || $(el).find('.right-team img').attr('src');
      const logo2 = $(el).find('.left-team img').attr('data-src') || $(el).find('.left-team img').attr('src');

      if (team1 && team2) {
        matches.push({
          id: matchLink ? matchLink.split('/').filter(Boolean).pop() : `match-${Date.now()}-${i}`,
          team1,
          team2,
          logo1,
          logo2,
          time,
          league,
          channel,
          commentator,
          status,
          link: matchLink,
          embedUrl: '' // Will fetch below
        });
      }
    });

    // Fetch embed URLs for each match
    for (let match of matches) {
      if (match.link) {
        try {
          const { data: matchData } = await axios.get(match.link, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
          const _$ = cheerio.load(matchData);
          let iframeSrc = _$('iframe.video-iframe').attr('data-src') || _$('iframe.video-iframe').attr('src');
          if (!iframeSrc) iframeSrc = _$('iframe').first().attr('src');
          match.embedUrl = iframeSrc || match.link;
        } catch (e) {
          console.error('Failed to fetch embed for', match.link);
          match.embedUrl = match.link;
        }
      }
    }

    // Save to JSON
    const outputData = {
      updatedAt: new Date().toISOString(),
      matches
    };
    
    fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));
    console.log(`Successfully scraped ${matches.length} matches.`);

  } catch (error) {
    console.error('Error scraping matches:', error.message);
  }
}

scrapeMatches();
