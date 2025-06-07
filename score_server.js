#!/usr/bin/env node
const express = require('express');
const puppeteer = require('puppeteer-extra');
const readline = require('readline');
const path = require('path');

// ✅ Safe for pkg: use stealth plugin without specifying evasions
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin()); // Use default stealth evasions


// Initialize Express server
const app = express();
const PORT = process.env.PORT || 3000;

// Default score state
let scoreData = {
  ctTeam: 'CT',
  ctScore: '0',
  tScore: '0',
  tTeam: 'T'
};

let isRunning = false;
let intervalId = null;

// Serve static files (e.g., display.html)
app.use(express.static('public'));

// Provide JSON score API for frontend
app.get('/score', (req, res) => {
  res.json(scoreData);
});

async function scrapeScore(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    await page.waitForFunction(() => {
      const ct = document.querySelector('.score .ctScore');
      const t = document.querySelector('.score .tScore');
      return ct && t;
    }, { timeout: 30000 });

    const result = await page.evaluate(() => {
      const getText = (selector) => {
        const el = document.querySelector(selector);
        return el ? el.textContent.trim() : '';
      };

      const ctScore = parseInt(getText('.score .ctScore')) || 0;
      const tScore = parseInt(getText('.score .tScore')) || 0;

      const ctTeam = getText('table.team thead.ctTeamHeaderBg .teamName') || 'CT';
      const tTeam = getText('table.team thead.tTeamHeaderBg .teamName') || 'T';

      return { ctTeam, ctScore, tScore, tTeam };
    });

    scoreData = result;
    console.log(`✅ Updated: ${result.ctTeam} ${result.ctScore} : ${result.tScore} ${result.tTeam}`);

    // End the current session if one team reaches 13
    if (result.ctScore === 13 || result.tScore === 13) {
      console.log(`🏁 ${result.ctScore === 13 ? result.ctTeam : result.tTeam} reached 13 rounds!`);

      clearInterval(intervalId);
      isRunning = false;

      setTimeout(() => {
        askMatchURL();
      }, 60000); // Wait 60 seconds
    }

  } catch (err) {
    console.error('❌ Error scraping score:', err.message);
  }
}

async function startScraper(url) {
  if (isRunning) return;
  isRunning = true;

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  console.log('⏳ Scraper started...');

  await scrapeScore(page, url); // Initial fetch
  intervalId = setInterval(() => scrapeScore(page, url), 30000); // Check every 30 sec
}

function askMatchURL() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('Paste HLTV match URL: ', (url) => {
    rl.close();
    startScraper(url);
  });
}

app.listen(PORT, () => {
  console.log(`🟢 Server running at http://localhost:${PORT}/display`);
  askMatchURL();
});

process.on('uncaughtException', (err) => {
  console.error('🚨 Uncaught Error:', err.message);
  console.error(err.stack);
  console.log('\nPress any key to exit...');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', process.exit.bind(process, 1));
});
