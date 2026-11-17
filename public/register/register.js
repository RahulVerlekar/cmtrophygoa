import { constituencies, events, marathonDistances, rangoliCategories, requiresTeamName, genders, bloodGroups, tshirtSizes } from './events.js';
import { ageOnDate, validateEmail, validateRegistration } from './validation.js?v=registration-null-check';

const form = document.querySelector('#wizard');
const category = document.querySelector('#category');
const registrationConstituency = document.querySelector('#registration-constituency');
const eventSelect = document.querySelector('#event');
const eventOption = document.querySelector('#event-option');
const optionLabel = document.querySelector('#event-option-label');
const teamNameLabel = document.querySelector('#team-name-label');
const collegeNameLabel = document.querySelector('#college-name-label');
const primary = document.querySelector('#primary');
const roster = document.querySelector('#roster');
const error = document.querySelector('#error');
const consent = document.querySelector('#consent');
const verificationStatus = document.querySelector('#verification-status');
const retryVerification = document.querySelector('#retry-verification');
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
let step = 1;
let configuredEvent = '';
let turnstileToken = '';
let turnstileWidget = null;
let turnstileScript;
let verificationAttempt = 0;

function loadTurnstile() {
  if (!turnstileScript) {
    turnstileScript = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = false;
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        reject(new Error('Turnstile script could not be loaded.'));
      };
      document.head.append(script);
    }).catch((loadError) => {
      turnstileScript = null;
      throw loadError;
    });
  }
  return turnstileScript;
}

function clearVerification() {
  verificationAttempt++;
  turnstileToken = '';
  if (turnstileWidget !== null) window.turnstile.remove(turnstileWidget);
  turnstileWidget = null;
}

async function setupVerification() {
  clearVerification();
  const attempt = verificationAttempt;
  verificationStatus.textContent = 'Loading security check...';
  retryVerification.hidden = true;
  try {
    const configResponse = await fetch('/api/turnstile-config', { cache: 'no-store' });
    if (!configResponse.ok) throw new Error('Verification configuration is unavailable.');
    const config = await configResponse.json();
    if (typeof config.siteKey !== 'string' || !config.siteKey) throw new Error('Verification configuration is invalid.');
    await loadTurnstile();
    await new Promise((resolve) => window.turnstile.ready(resolve));
    if (attempt !== verificationAttempt || step !== 5) return;
    verificationStatus.textContent = 'Complete the security check before submitting.';
    turnstileWidget = window.turnstile.render('#turnstile-widget', {
      sitekey: config.siteKey,
      action: 'registration',
      size: 'compact',
      callback: (token) => {
        if (attempt !== verificationAttempt) return;
        turnstileToken = token;
        verificationStatus.textContent = 'Security check complete.';
        retryVerification.hidden = true;
      },
      'expired-callback': () => {
        if (attempt !== verificationAttempt) return;
        turnstileToken = '';
        verificationStatus.textContent = 'Security check expired. Please retry it.';
        retryVerification.hidden = false;
      },
      'error-callback': () => {
        if (attempt !== verificationAttempt) return;
        turnstileToken = '';
        verificationStatus.textContent = 'Security check failed. Please retry it.';
        retryVerification.hidden = false;
      }
    });
  } catch (setupError) {
    if (attempt !== verificationAttempt || step !== 5) return;
    console.error('Registration security check could not be loaded.');
    verificationStatus.textContent = 'Security check could not be loaded. Please retry.';
    retryVerification.hidden = false;
  }
}

function fillOptions(select, values, placeholder) {
  select.replaceChildren(new Option(placeholder, ''));
  values.forEach((value) => select.add(new Option(value.label || value, value.value || value)));
}

function updateIdentification(fieldset) {
  const age = ageOnDate(fieldset.querySelector('[name="dateOfBirth"]').value, today());
  const streetPlay = eventSelect.value === 'street-play';
  const groups = [
    ['.epic-field', age !== null && age >= 18],
    ['.aadhaar-field', !streetPlay && age !== null && age < 18],
    ['.parent-epic-field', age !== null && age < 18],
    ['.college-id-field', streetPlay]
  ];
  groups.forEach(([selector, visible]) => {
    const group = fieldset.querySelector(selector);
    group.hidden = !visible;
    group.querySelectorAll('input').forEach((input) => { input.required = visible; });
  });
}

function configureParticipant(fieldset, isPrimary) {
  const fields = [
    ['.gender-field', eventSelect.value !== 'cricket'],
    ['.constituency-field', eventSelect.value === 'street-play' && !isPrimary]
  ];
  fields.forEach(([selector, visible]) => {
    const group = fieldset.querySelector(selector);
    group.hidden = !visible;
    group.querySelector('select').required = visible;
  });
  updateIdentification(fieldset);
}

function makeParticipant(isPrimary) {
  const fieldset = document.querySelector('#participant-template').content.firstElementChild.cloneNode(true);
  fillOptions(fieldset.querySelector('[name="gender"]'), genders, 'Select gender');
  fillOptions(fieldset.querySelector('[name="constituency"]'), constituencies, 'Select constituency');
  fillOptions(fieldset.querySelector('[name="bloodGroup"]'), bloodGroups, 'Select blood group');
  fillOptions(fieldset.querySelector('[name="tshirtSize"]'), tshirtSizes, 'Select size');
  const birthDate = fieldset.querySelector('[name="dateOfBirth"]');
  birthDate.max = today();
  birthDate.addEventListener('change', () => updateIdentification(fieldset));
  fieldset.querySelector('.remove-member').hidden = isPrimary;
  fieldset.querySelector('.remove-member').addEventListener('click', () => {
    fieldset.remove();
    updateRoster();
  });
  configureParticipant(fieldset, isPrimary);
  return fieldset;
}

function updateRoster() {
  const event = events[eventSelect.value];
  if (!event) return;
  const members = [...roster.querySelectorAll('.participant')];
  members.forEach((member, index) => {
    member.querySelector('legend').textContent = `Participant ${index + 2}`;
    member.querySelector('.remove-member').disabled = members.length <= event.min - 1;
  });
  document.querySelector('#add-member').disabled = members.length >= event.max - 1;
  document.querySelector('#roster-description').textContent = eventSelect.value === 'rangoli'
    ? `One or two participants may register. Currently ${members.length + 1} participant(s).`
    : `Team size: ${event.min}–${event.max}, including the captain. Currently ${members.length + 1} participant(s).`;
}

function configureEvent() {
  const event = events[eventSelect.value];
  optionLabel.hidden = true;
  eventOption.required = false;
  teamNameLabel.hidden = !event || !requiresTeamName(event);
  teamNameLabel.querySelector('input').required = !!event && requiresTeamName(event);
  collegeNameLabel.hidden = eventSelect.value !== 'street-play';
  collegeNameLabel.querySelector('input').required = eventSelect.value === 'street-play';
  if (!event) {
    document.querySelector('#event-description').textContent = '';
    return;
  }
  if (eventSelect.value === 'marathon' || eventSelect.value === 'rangoli') {
    const values = eventSelect.value === 'marathon' ? marathonDistances : rangoliCategories;
    fillOptions(eventOption, values, 'Select an option');
    optionLabel.hidden = false;
    eventOption.required = true;
  }
  document.querySelector('#event-description').textContent = eventSelect.value === 'marathon'
    ? 'This is an individual event. See the marathon information for event details.'
    : eventSelect.value === 'rangoli' ? 'One or two participants may register.'
    : event.max > 1 ? `Team size: ${event.min}–${event.max}, including the captain.` : 'This is an individual event.';
  document.querySelector('#roster-heading').textContent = eventSelect.value === 'rangoli' ? 'Additional participant' : 'Team roster';
  const primaryTitle = eventSelect.value === 'cricket' ? 'Team Leader / Captain' : 'Primary participant';
  document.querySelector('#primary-heading').textContent = primaryTitle;
  primary.querySelector('legend').textContent = primaryTitle;
  if (configuredEvent !== eventSelect.value) {
    configuredEvent = eventSelect.value;
    roster.replaceChildren();
    for (let i = 1; i < event.min; i++) roster.append(makeParticipant(false));
    primary.querySelectorAll('.participant').forEach((participant) => configureParticipant(participant, true));
    updateRoster();
  }
}

function collectPerson(fieldset, index) {
  const person = {};
  fieldset.querySelectorAll('[name]').forEach((input) => { person[input.name] = input.value; });
  if (eventSelect.value !== 'street-play' || index === 0) person.constituency = registrationConstituency.value;
  if (eventSelect.value === 'cricket') person.gender = 'Male';
  return person;
}

function collectRegistration(confirmed = false) {
  const event = events[eventSelect.value];
  return {
    category: category.value,
    event: eventSelect.value,
    eventOption: eventSelect.value === 'marathon' || eventSelect.value === 'rangoli' ? eventOption.value : '',
    teamName: event && requiresTeamName(event) ? document.querySelector('#team-name').value : '',
    collegeName: eventSelect.value === 'street-play' ? document.querySelector('#college-name').value : '',
    email: document.querySelector('#email').value,
    participants: [...primary.querySelectorAll('.participant'), ...roster.querySelectorAll('.participant')].map(collectPerson),
    consent: confirmed || consent.checked
  };
}

function showStep(nextStep) {
  step = nextStep;
  document.querySelectorAll('[data-step]').forEach((section) => { section.hidden = Number(section.dataset.step) !== step; });
  const isTeam = events[eventSelect.value]?.max > 1;
  const displayedStep = !isTeam && step === 5 ? 4 : step;
  document.querySelector('#progress').textContent = `Step ${displayedStep} of ${isTeam ? 5 : 4}`;
  document.querySelector('#back').hidden = step === 1;
  document.querySelector('#next').hidden = step === 5;
  document.querySelector('#submit').hidden = step !== 5;
  error.textContent = '';
  document.querySelector(`[data-step="${step}"] h2`).focus();
}

function validateVisibleStep() {
  const section = document.querySelector(`[data-step="${step}"]`);
  for (const input of section.querySelectorAll('input, select')) {
    if (!input.closest('[hidden]') && !input.reportValidity()) return false;
  }
  return true;
}

function renderReview(data) {
  const review = document.querySelector('#review');
  review.replaceChildren();
  const summary = document.createElement('p');
  summary.textContent = `${data.category} — ${events[data.event].name}${data.eventOption ? ` — ${data.eventOption}` : ''}${data.teamName ? ` — ${data.teamName}` : ''}`;
  review.append(summary);
  if (data.email) {
    const email = document.createElement('p');
    email.textContent = `Email: ${data.email}`;
    review.append(email);
  }
  if (data.collegeName) {
    const college = document.createElement('p');
    college.textContent = `College: ${data.collegeName}`;
    review.append(college);
  }
  data.participants.forEach((person, index) => {
    const item = document.createElement('p');
    item.className = 'review-person';
    const age = ageOnDate(person.dateOfBirth, today());
    const ageCategory = data.event === 'badminton' ? ` | Age category: ${age <= 30 ? '16–30' : age <= 50 ? '31–50' : '51 and above'}` : '';
    const label = index === 0 ? (data.event === 'cricket' ? 'Team Leader / Captain' : 'Primary participant') : `Participant ${index + 1}`;
    item.textContent = `${label}: ${person.fullName} | ${person.dateOfBirth} | ${person.gender} | ${person.phone} | ${person.constituency} | ${person.bloodGroup} | ${person.tshirtSize}${ageCategory}`;
    review.append(item);
  });
  const rules = `/rules/?event=${encodeURIComponent(events[data.event].rules || data.event)}`;
  document.querySelector('#rules-link').href = rules;
  document.querySelector('#success-rules-link').href = rules;
  document.querySelector('#rules-link').textContent = data.event === 'marathon' ? 'View marathon information' : 'Read the event rules';
  document.querySelector('#rules-link').setAttribute('aria-label', `${document.querySelector('#rules-link').textContent} (opens in a new tab)`);
  document.querySelector('#success-rules-link').textContent = data.event === 'marathon' ? 'View marathon information' : 'View event rules';
  document.querySelector('#success-rules-link').setAttribute('aria-label', `${document.querySelector('#success-rules-link').textContent} (opens in a new tab)`);
  document.querySelector('#consent-label').textContent = data.event === 'marathon'
    ? 'I have reviewed the event information and confirm that I have permission to submit these details.'
    : 'I have read the rules and confirm that I have permission to submit these details for all participants.';
}

category.addEventListener('change', () => {
  fillOptions(eventSelect, Object.entries(events).filter(([, event]) => event.category === category.value).map(([value, event]) => ({ value, label: event.name })), 'Select an event');
  configureEvent();
});
eventSelect.addEventListener('change', () => {
  error.textContent = '';
  configureEvent();
});
document.querySelector('#add-member').addEventListener('click', () => {
  if (roster.children.length < events[eventSelect.value].max - 1) {
    roster.append(makeParticipant(false));
    updateRoster();
  }
});
document.querySelector('#back').addEventListener('click', () => {
  if (step === 5) {
    consent.checked = false;
    clearVerification();
  }
  showStep(step === 5 && events[eventSelect.value].max === 1 ? 3 : step - 1);
});
document.querySelector('#next').addEventListener('click', async () => {
  if (!validateVisibleStep()) return;
  if (step === 3) {
    const emailError = validateEmail(document.querySelector('#email').value);
    if (emailError) {
      error.textContent = emailError;
      document.querySelector('#email').focus();
      return;
    }
  }
  if (step === 2) {
    const nextButton = document.querySelector('#next');
    const backButton = document.querySelector('#back');
    nextButton.disabled = true;
    backButton.disabled = true;
    eventSelect.disabled = true;
    error.textContent = 'Checking registration availability...';
    try {
      const result = await fetch(`/api/event-status?event=${encodeURIComponent(eventSelect.value)}`, { cache: 'no-store' });
      if (!result.ok) throw new Error('Registration availability is unavailable.');
      const status = await result.json();
      if (typeof status.open !== 'boolean') throw new Error('Registration availability is invalid.');
      if (!status.open) {
        error.textContent = 'Registration for the selected event is not open now.';
        return;
      }
    } catch (availabilityError) {
      console.error('Registration availability could not be checked.');
      error.textContent = 'Registration availability is temporarily unavailable. Please try again.';
      return;
    } finally {
      nextButton.disabled = false;
      backButton.disabled = false;
      eventSelect.disabled = false;
    }
  }
  const next = step === 3 && events[eventSelect.value].max === 1 ? 5 : step + 1;
  if (next === 5) {
    const data = collectRegistration(true);
    const validationError = validateRegistration(data);
    if (validationError) {
      error.textContent = validationError;
      return;
    }
    renderReview(data);
  }
  showStep(next);
  if (next === 5) setupVerification();
});
retryVerification.addEventListener('click', setupVerification);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (step !== 5 || !validateVisibleStep()) return;
  const data = collectRegistration();
  const validationError = validateRegistration(data);
  if (validationError) {
    error.textContent = validationError;
    return;
  }
  if (!turnstileToken) {
    error.textContent = 'Please complete the security check before submitting.';
    return;
  }
  const button = document.querySelector('#submit');
  const back = document.querySelector('#back');
  button.disabled = true;
  back.disabled = true;
  retryVerification.disabled = true;
  error.textContent = '';
  let result;
  try {
    result = await fetch('/api/registrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, turnstileToken })
    });
  } catch (networkError) {
    error.textContent = 'The submission status is unknown. Please contact the organisers before trying again.';
    button.disabled = false;
    back.disabled = false;
    retryVerification.disabled = false;
    setupVerification();
    return;
  }
  let body;
  try {
    body = await result.json();
  } catch (parseError) {
    error.textContent = 'The submission status is unknown. Please contact the organisers before trying again.';
    button.disabled = false;
    back.disabled = false;
    retryVerification.disabled = false;
    setupVerification();
    return;
  }
  if (!result.ok || typeof body.registrationNumber !== 'string' || !/^CM-[0-9A-F-]{36}$/.test(body.registrationNumber)) {
    error.textContent = typeof body.error === 'string' ? body.error : 'The submission status is unknown. Please contact the organisers before trying again.';
    button.disabled = false;
    back.disabled = false;
    retryVerification.disabled = false;
    setupVerification();
    return;
  }
  clearVerification();
  document.querySelector('#registration-number').textContent = body.registrationNumber;
  form.hidden = true;
  document.querySelector('#progress').textContent = '';
  document.querySelector('#success').hidden = false;
  document.querySelector('#success h2').focus();
});

primary.append(makeParticipant(true));
primary.querySelector('legend').textContent = 'Primary participant';
fillOptions(registrationConstituency, constituencies, 'Select constituency');
document.querySelectorAll('[data-step] h2, #success h2').forEach((heading) => { heading.tabIndex = -1; });
form.hidden = false;
showStep(1);
