const cheerio = require('cheerio');
fetch('https://firestorm-servers.com/en/news/index')
  .then(r => r.text())
  .then(html => {
    const $ = cheerio.load(html);
    const firstUnit = $('.news_unit').first();
    console.log("Parent HTML:", firstUnit.parent().html().substring(0, 500));
    console.log("Has a tag?", firstUnit.find('a').length);
    console.log("Attributes:", firstUnit.attr());
  });
