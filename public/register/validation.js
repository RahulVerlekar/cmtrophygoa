import { constituencies, events, marathonDistances, rangoliCategories, genders, bloodGroups, tshirtSizes } from './events.js';

function isText(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;
}

export function ageOnDate(dateOfBirth, today) {
  if (typeof dateOfBirth !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return null;
  const date = new Date(`${dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateOfBirth || dateOfBirth > today) return null;
  const [year, month, day] = dateOfBirth.split('-').map(Number);
  const [currentYear, currentMonth, currentDay] = today.split('-').map(Number);
  return currentYear - year - (currentMonth < month || (currentMonth === month && currentDay < day) ? 1 : 0);
}

export function validateRegistration(data, today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())) {
  if (!data || typeof data !== 'object' || !Object.hasOwn(events, data.event)) return 'Select an event.';
  const event = events[data.event];
  if (data.category !== event.category) return 'Select a valid category and event.';
  if (!Array.isArray(data.participants) || data.participants.length < event.min || data.participants.length > event.max) {
    return `This event requires ${event.min === event.max ? event.min : `${event.min}–${event.max}`} participant(s), including the captain.`;
  }
  if (event.max > 1 && !isText(data.teamName, 100)) return 'Enter a team name.';
  if (data.email && (typeof data.email !== 'string' || data.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))) return 'Enter a valid email address.';
  if (data.event === 'marathon' && !marathonDistances.includes(data.eventOption)) return 'Select a marathon distance.';
  if (data.event === 'rangoli' && !rangoliCategories.includes(data.eventOption)) return 'Select a rangoli category.';
  if (data.event === 'street-play' && !isText(data.collegeName, 150)) return 'Enter the college name.';
  const captainConstituency = data.participants[0]?.constituency;

  for (const [index, person] of data.participants.entries()) {
    const label = index === 0 ? 'Primary participant' : `Participant ${index + 1}`;
    if (!person || typeof person !== 'object' || !isText(person.fullName, 100)) return `${label}: enter a full name.`;
    const age = ageOnDate(person.dateOfBirth, today);
    if (age === null) return `${label}: enter a valid date of birth.`;
    if (data.event !== 'street-play' && data.event !== 'marathon' && age < 16) return `${label}: participants must be at least 16 years old.`;
    if (!genders.includes(person.gender)) return `${label}: select a gender.`;
    if (event.gender && person.gender !== event.gender) return `${label}: gender must match the selected event category.`;
    if (!constituencies.includes(person.constituency)) return `${label}: select a constituency.`;
    if (event.max > 1 && data.event !== 'street-play' && person.constituency !== captainConstituency) return `${label}: the team must belong to the same constituency.`;
    if (typeof person.phone !== 'string' || !/^\+?[0-9 ()-]{7,20}$/.test(person.phone) || person.phone.replace(/\D/g, '').length < 7 || person.phone.replace(/\D/g, '').length > 15) return `${label}: enter a valid phone number.`;
    if (!bloodGroups.includes(person.bloodGroup)) return `${label}: select a blood group or Unknown.`;
    if (!tshirtSizes.includes(person.tshirtSize)) return `${label}: select a T-shirt size.`;
    if (data.event === 'street-play') {
      if (!isText(person.collegeId, 50)) return `${label}: enter a college ID number.`;
    }
    if (age < 18 && data.event !== 'street-play') {
      if (typeof person.aadhaar !== 'string' || !/^\d{12}$/.test(person.aadhaar.replace(/\s/g, ''))) return `${label}: enter a 12-digit Aadhaar number.`;
      if (!isText(person.parentEpic, 50)) return `${label}: enter a parent's EPIC number.`;
    } else if (age >= 18 && !isText(person.epic, 50)) {
      return `${label}: enter an EPIC number.`;
    }
  }
  if (data.consent !== true) return 'Confirm that you have read the rules and agree to submit the information.';
  return null;
}

export function sanitizedRegistration(data, today) {
  const validationError = validateRegistration(data, today);
  if (validationError) return { error: validationError };
  const event = events[data.event];
  const participants = data.participants.map((person) => {
    const age = ageOnDate(person.dateOfBirth, today || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
    const result = {
      fullName: person.fullName.trim(),
      dateOfBirth: person.dateOfBirth,
      gender: person.gender,
      phone: person.phone.trim(),
      constituency: person.constituency,
      bloodGroup: person.bloodGroup,
      tshirtSize: person.tshirtSize
    };
    if (data.event === 'badminton') result.ageCategory = age <= 30 ? '16–30' : age <= 50 ? '31–50' : '51 and above';
    if (data.event === 'street-play') result.collegeId = person.collegeId.trim();
    if (age < 18 && data.event !== 'street-play') {
      result.aadhaar = person.aadhaar.replace(/\s/g, '');
      result.parentEpic = person.parentEpic.trim();
    } else if (age >= 18) result.epic = person.epic.trim();
    return result;
  });
  const result = { category: event.category, event: data.event, participants, consent: true };
  if (event.max > 1) result.teamName = data.teamName.trim();
  if (data.email) result.email = data.email.trim();
  if (data.event === 'street-play') result.collegeName = data.collegeName.trim();
  if (data.event === 'marathon' || data.event === 'rangoli') result.eventOption = data.eventOption;
  return { data: result };
}
