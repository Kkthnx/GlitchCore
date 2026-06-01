const cheerio = require('cheerio');
fetch('https://firestorm-servers.com/en/changelog/tww')
  .then(r => r.text())
  .then(html => {
    const $ = cheerio.load(html);
    const classes = new Set();
    const categories = new Set();
    $('.card').each((i, el) => {
      $(el).attr('class').split(' ').forEach(c => classes.add(c));
      const title = $(el).attr('data-title') || '';
      const match = title.match(/^\[(.*?)\]/);
      if (match) {
         categories.add(match[1]);
      }
    });
    console.log('Classes:', [...classes]);
    console.log('Title Categories:', [...categories]);
  });
