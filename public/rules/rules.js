const events = {
  marathon: { title: 'Marathon', pages: [] },
  cricket: { title: 'Cricket', pages: [2, 3] },
  football: { title: 'Football', pages: [4, 5, 6, 7] },
  volleyball: { title: 'Volleyball', pages: [8, 9] },
  carrom: { title: 'Carrom', pages: [10, 11], dateWarning: true },
  badminton: { title: 'Badminton', pages: [12, 13], dateWarning: true },
  'ghumat-aarti': { title: 'Ghumat Aarti', pages: [14, 15, 16, 17] },
  'group-dance': { title: 'Group Dance', pages: [18, 19] },
  fugdi: { title: 'Fugdi', pages: [20] },
  'street-play': { title: 'Street Play', pages: [21] },
  'solo-singing': { title: 'Solo Singing', pages: [22, 23] },
  painting: { title: 'Painting', pages: [24, 25] },
  rangoli: { title: 'Rangoli', pages: [26, 27] }
};

const params = new URLSearchParams(window.location.search);
const eventName = params.get('event');
const event = Object.hasOwn(events, eventName) ? events[eventName] : null;
const message = document.querySelector('#rules-message');
const homeLink = document.querySelector('#home-link');

if (params.get('allow_register') === 'true') {
  homeLink.href = '/?allow_register=true';
}

if (!event) {
  message.textContent = 'This event could not be found. Please return to the homepage and choose an event.';
} else {
  document.title = `${event.title} rules | CM Trophy`;
  document.querySelector('#event-title').textContent = `${event.title} rules`;

  if (params.get('allow_register') === 'true') {
    document.querySelector('#register').hidden = false;
  }

  if (event.pages.length === 0) {
    message.textContent = 'Marathon rules are not available yet. Please contact the organisers for details.';
  } else {
    if (event.dateWarning) {
      const warning = document.createElement('p');
      warning.className = 'warning';
      warning.textContent = 'The printed registration dates contain errors. Please contact the organisers for details.';
      message.after(warning);
    }

    const pages = document.querySelector('#rule-pages');
    event.pages.forEach((pageNumber, index) => {
      const link = document.createElement('a');
      link.href = `/rules/pages/page-${pageNumber}.jpg`;
      link.className = 'rule-page';
      link.setAttribute('aria-label', `Open ${event.title} rules sheet ${index + 1} of ${event.pages.length} at full size`);
      const image = document.createElement('img');
      image.src = link.href;
      image.alt = `${event.title} rules sheet ${index + 1} of ${event.pages.length} (original document page ${pageNumber})`;
      image.loading = 'lazy';
      link.append(image);
      pages.append(link);
    });
  }
}
