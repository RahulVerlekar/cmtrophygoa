const events = {
  marathon: { title: 'Marathon', pages: [] },
  cricket: { title: 'Cricket', pages: [2, 3] },
  football: { title: 'Football', pages: [4, 5, 6, 7] },
  volleyball: { title: 'Volleyball', pages: [8, 9] },
  carrom: { title: 'Carrom', pages: [10, 11] },
  badminton: { title: 'Badminton', pages: [12, 13] },
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
  const heading = eventName === 'marathon' ? 'Marathon information' : `${event.title} rules`;
  document.title = `${heading} | CM Trophy`;
  document.querySelector('#event-title').textContent = heading;

  if (params.get('allow_register') === 'true') {
    document.querySelector('#register').hidden = false;
  }

  if (eventName === 'marathon') {
    document.querySelector('#marathon-information').hidden = false;
  } else {
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
