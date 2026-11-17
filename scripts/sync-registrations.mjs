import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'csv-parse/sync';
import { GoogleAuth } from 'google-auth-library';
import { constituencies, events, requiresTeamName } from '../public/register/events.js';

const masterTitle = 'Master';
const eventTitle = (event) => event;
const requiredColumns = ['registration_number', 'created_at', 'category', 'event', 'details'];
const participantColumns = (event) => [
  'Constituency', ...(requiresTeamName(events[event]) ? ['Team Name'] : []),
  'Full Name', 'Email', 'Phone', 'Date of Birth', 'Gender', 'Blood Group', 'T-shirt Size',
  'EPIC', "Parent's EPIC", 'Aadhaar', 'College Name', 'College ID', 'Event Option',
  'Age Category', 'Created At (IST)', 'Registration Number', 'Category',
  'Participant Number', 'Participant Type', 'Consent', 'Participant Details'
];
const istFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h12'
});

function registrationTime(timestamp) {
  return `${formatIST(new Date(timestamp))} IST`;
}

function formatIST(date) {
  return istFormatter.format(date)
    .replace(/, 0(\d:)/, ', $1')
    .replace(/\b(am|pm)\b/i, (period) => period.toUpperCase());
}

function compareRegistrationTimes(a, b) {
  const difference = a.time - b.time;
  if (difference) return difference;
  const length = Math.max(a.fraction.length, b.fraction.length);
  return a.fraction.padEnd(length, '0').localeCompare(b.fraction.padEnd(length, '0'));
}

export function prepareSheets(csv, syncStartedAt = new Date()) {
  let rows;
  try {
    rows = parse(csv, { bom: true, skip_empty_lines: true });
  } catch (error) {
    if (error.code?.startsWith('CSV_')) throw new Error(`Could not parse the CSV (${error.code}).`);
    throw error;
  }
  const headers = rows.shift();
  if (!headers || new Set(headers).size !== headers.length || requiredColumns.some((column) => !headers.includes(column))) {
    throw new Error('The CSV must have unique headers and all registration table columns.');
  }
  if (!rows.length) throw new Error('The CSV contains no registrations; no sheets were changed.');

  const indices = Object.fromEntries(headers.map((header, index) => [header, index]));
  const seen = new Set();
  const byEvent = new Map(Object.keys(events).map((event) => [event, []]));
  const registrationsByEvent = new Map(Object.keys(events).map((event) => [event, 0]));
  const newConstituencyCounts = () => ({ registrations: new Set(), participants: 0, events: new Map(), latestRegistration: null });
  const byConstituency = new Map(constituencies.map((name) => [name, newConstituencyCounts()]));
  let latestRegistration;
  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    if (row.length !== headers.length) throw new Error(`CSV row ${rowNumber} has an unexpected number of columns.`);
    const registration = row[indices.registration_number];
    const event = row[indices.event];
    const createdAt = row[indices.created_at];
    const time = Date.parse(createdAt);
    if (!registration || seen.has(registration)) throw new Error(`CSV row ${rowNumber} has a missing or duplicate registration number.`);
    if (!byEvent.has(event)) throw new Error(`CSV row ${rowNumber} has an unrecognized event.`);
    if (!Number.isFinite(time)) throw new Error(`CSV row ${rowNumber} has an invalid creation timestamp.`);
    const fraction = createdAt.match(/:\d{2}\.(\d+)(?:Z|[+-]\d{2}(?::?\d{2})?)$/i)?.[1] || '';
    const registrationTimestamp = { time, fraction, createdAt };
    if (!latestRegistration || compareRegistrationTimes(registrationTimestamp, latestRegistration) > 0) {
      latestRegistration = registrationTimestamp;
    }
    seen.add(registration);

    let details;
    try {
      details = JSON.parse(row[indices.details]);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      throw new Error(`CSV row ${rowNumber} has invalid details JSON.`);
    }
    if (!details || typeof details !== 'object' || Array.isArray(details) ||
        !Array.isArray(details.participants) || details.participants.length === 0) {
      throw new Error(`CSV row ${rowNumber} has no valid participant list.`);
    }
    registrationsByEvent.set(event, registrationsByEvent.get(event) + 1);
    details.participants.forEach((person, participantIndex) => {
      if (!person || typeof person !== 'object' || Array.isArray(person) ||
          typeof person.constituency !== 'string' || !person.constituency.trim()) {
        throw new Error(`CSV row ${rowNumber}, participant ${participantIndex + 1} has no constituency.`);
      }
      if (!byConstituency.has(person.constituency)) {
        byConstituency.set(person.constituency, newConstituencyCounts());
      }
      const constituency = byConstituency.get(person.constituency);
      constituency.registrations.add(registration);
      constituency.participants++;
      if (!constituency.latestRegistration || compareRegistrationTimes(registrationTimestamp, constituency.latestRegistration) > 0) {
        constituency.latestRegistration = registrationTimestamp;
      }
      if (!constituency.events.has(event)) constituency.events.set(event, { registrations: new Set(), participants: 0 });
      const eventCounts = constituency.events.get(event);
      eventCounts.registrations.add(registration);
      eventCounts.participants++;
      const value = (object, key) => object[key] == null ? '' : String(object[key]);
      byEvent.get(event).push({
        constituency: person.constituency,
        time,
        fraction,
        registration,
        participantIndex,
        values: [
          person.constituency, ...(requiresTeamName(events[event]) ? [value(details, 'teamName')] : []),
          value(person, 'fullName'), value(details, 'email'), value(person, 'phone'),
          value(person, 'dateOfBirth'), value(person, 'gender'), value(person, 'bloodGroup'),
          value(person, 'tshirtSize'), value(person, 'epic'), value(person, 'parentEpic'),
          value(person, 'aadhaar'), value(details, 'collegeName'), value(person, 'collegeId'),
          value(details, 'eventOption'), value(person, 'ageCategory'), registrationTime(createdAt),
          registration, row[indices.category], String(participantIndex + 1),
          participantIndex === 0 ? 'Primary' : 'Participant', value(details, 'consent'), JSON.stringify(person)
        ]
      });
    });
  }

  const masterRows = rows.map((row) => row.map((value, index) =>
    index === indices.created_at ? registrationTime(value) : value));
  const sheets = [{ title: masterTitle, rows: [headers, ...masterRows] }];
  const summaryRows = [
    ['Sheet sync started (IST)', formatIST(syncStartedAt)],
    ['Total registration entries', String(rows.length)],
    ['Total participants', String([...byEvent.values()].reduce((total, people) => total + people.length, 0))],
    ['Last registration (IST)', registrationTime(latestRegistration.createdAt)],
    [],
    ['Event', 'Registration entries', 'Participants']
  ];
  for (const [event, participants] of byEvent) {
    participants.sort((a, b) => a.constituency.localeCompare(b.constituency, 'en') ||
      compareRegistrationTimes(a, b) || a.registration.localeCompare(b.registration) || a.participantIndex - b.participantIndex);
    summaryRows.push([events[event].name, String(registrationsByEvent.get(event)), String(participants.length)]);
    sheets.push({ title: eventTitle(event), rows: [participantColumns(event), ...participants.map((person) => person.values)] });
  }
  sheets.push({ title: 'Summary', rows: summaryRows });
  const sortedConstituencies = [...byConstituency.entries()].sort(([a], [b]) => a.localeCompare(b, 'en'));
  sheets.push({
    title: 'Constituency Counts',
    rows: [
      ['Constituency', 'Registration entries', 'Participants', ...Object.values(events).map((event) => event.name), 'Last entry (IST)'],
      ...sortedConstituencies.map(([name, counts]) => [
        name, String(counts.registrations.size), String(counts.participants),
        ...Object.keys(events).map((event) => String(counts.events.get(event)?.registrations.size ?? 0)),
        counts.latestRegistration ? registrationTime(counts.latestRegistration.createdAt) : ''
      ])
    ]
  });
  return sheets;
}

function headerRowIndex(sheet) {
  if (sheet.title !== 'Summary') return 0;
  const index = sheet.rows.findIndex((row) => row[0] === 'Event' && row[1] === 'Registration entries');
  if (index === -1) throw new Error('The summary event header is missing.');
  return index;
}

function formatRequests(sheet, sheetId) {
  const isSummary = sheet.title === 'Summary';
  const headerRow = headerRowIndex(sheet);
  const headers = sheet.rows[headerRow];
  const widths = {
    registration_number: 330, created_at: 195, team_name: 200, full_name: 200,
    email: 240, details: 300, participant_details: 300,
    Constituency: 180, 'Registration entries': 190, 'Last entry (IST)': 230,
    'Team Name': 200, 'Full Name': 200, Email: 240, 'Created At (IST)': 200,
    'Registration Number': 330, 'Participant Details': 300
  };
  const requests = [];
  if (sheet.title === 'Constituency Counts' || isSummary) {
    requests.push({ repeatCell: {
      range: { sheetId },
      cell: {},
      fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat'
    } });
  }
  requests.push(
    { updateSheetProperties: {
      properties: { sheetId, gridProperties: { frozenRowCount: headerRow + 1 } },
      fields: 'gridProperties.frozenRowCount'
    } },
    { repeatCell: {
      range: { sheetId, startRowIndex: headerRow, endRowIndex: headerRow + 1, startColumnIndex: 0, endColumnIndex: headers.length },
      cell: { userEnteredFormat: {
        backgroundColor: { red: 0.16, green: 0.22, blue: 0.35 },
        textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
        verticalAlignment: 'MIDDLE',
        wrapStrategy: 'CLIP'
      } },
      fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat,userEnteredFormat.verticalAlignment,userEnteredFormat.wrapStrategy'
    } },
    { updateDimensionProperties: {
      range: { sheetId, dimension: 'ROWS', startIndex: headerRow, endIndex: headerRow + 1 },
      properties: { pixelSize: 30 }, fields: 'pixelSize'
    } }
  );
  if (isSummary) {
    requests.push({ repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: headerRow - 1, startColumnIndex: 0, endColumnIndex: 1 },
      cell: { userEnteredFormat: { textFormat: { bold: true } } },
      fields: 'userEnteredFormat.textFormat.bold'
    } });
  }
  headers.forEach((header, index) => {
    const pixelSize = isSummary ? [260, 190, 160][index] :
      (widths[header] || (sheet.title === 'Constituency Counts' ? 200 : 160));
    requests.push({ updateDimensionProperties: {
      range: { sheetId, dimension: 'COLUMNS', startIndex: index, endIndex: index + 1 },
      properties: { pixelSize }, fields: 'pixelSize'
    } });
  });
  return requests;
}

export function buildRequests(sheets, existingSheets) {
  const existing = new Map(existingSheets.map((sheet) => [sheet.properties.title, sheet.properties]));
  let nextId = Math.max(0, ...existingSheets.map((sheet) => sheet.properties.sheetId)) + 1;
  const requests = [];
  for (const sheet of sheets) {
    let properties = existing.get(sheet.title);
    const rowCount = Math.max(headerRowIndex(sheet) + 2, sheet.rows.length);
    const columnCount = Math.max(1, ...sheet.rows.map((row) => row.length));
    if (!properties) {
      properties = { sheetId: nextId++, gridProperties: { rowCount, columnCount } };
      requests.push({ addSheet: { properties: { ...properties, title: sheet.title } } });
    } else {
      if (!properties.gridProperties) throw new Error(`Managed tab "${sheet.title}" is not a grid sheet.`);
      const gridProperties = {
        rowCount: Math.max(rowCount, properties.gridProperties.rowCount),
        columnCount: Math.max(columnCount, properties.gridProperties.columnCount)
      };
      if (gridProperties.rowCount !== properties.gridProperties.rowCount ||
          gridProperties.columnCount !== properties.gridProperties.columnCount) {
        requests.push({ updateSheetProperties: {
          properties: { sheetId: properties.sheetId, gridProperties },
          fields: 'gridProperties.rowCount,gridProperties.columnCount'
        } });
      }
      requests.push({ updateCells: { range: { sheetId: properties.sheetId }, fields: 'userEnteredValue' } });
    }
    requests.push({ updateCells: {
      start: { sheetId: properties.sheetId, rowIndex: 0, columnIndex: 0 },
      rows: sheet.rows.map((row) => ({ values: row.map((value) => ({
        userEnteredValue: { stringValue: value }
      })) })),
      fields: 'userEnteredValue'
    } });
    requests.push(...formatRequests(sheet, properties.sheetId));
  }
  return requests;
}

export function updateFailureMessage(error, requests, existingSheets) {
  const status = error.response?.status || 'unavailable';
  const message = error.response?.data?.error?.message;
  const match = typeof message === 'string' ? message.match(/Invalid requests\[(\d+)\]/) : null;
  const request = match && requests[Number(match[1])];
  if (!request) return `Could not confirm the spreadsheet update (HTTP ${status}). Check the sheet before retrying.`;
  const [type, details] = Object.entries(request)[0];
  const sheetId = details.properties?.sheetId ?? details.range?.sheetId ?? details.start?.sheetId;
  const created = requests.find((item) => item.addSheet?.properties.sheetId === sheetId);
  const existing = existingSheets.find((item) => item.properties.sheetId === sheetId);
  const title = created?.addSheet.properties.title ?? existing?.properties.title;
  return `Spreadsheet update rejected (HTTP ${status}; request ${match[1]}: ${type}${title ? ` on "${title}"` : ''}).`;
}

async function main() {
  const syncStartedAt = new Date();
  const [csvPath, spreadsheetId, keyPath, ...extra] = process.argv.slice(2);
  if (!csvPath || !spreadsheetId || !keyPath || extra.length) {
    throw new Error('Usage: node scripts/sync-registrations.mjs <export.csv> <spreadsheet-id> <service-account.json>');
  }
  const sheets = prepareSheets(await readFile(csvPath, 'utf8'), syncStartedAt);
  const credentials = JSON.parse(await readFile(keyPath, 'utf8'));
  if (credentials.type !== 'service_account' || !credentials.client_email || !credentials.private_key) {
    throw new Error('The credentials file must contain a Google service account key.');
  }
  const auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const client = await auth.getClient();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
  let metadata;
  try {
    metadata = await client.request({ url, params: { fields: 'sheets(properties(sheetId,title,gridProperties))' } });
  } catch (error) {
    throw new Error(`Could not read the spreadsheet (HTTP ${error.response?.status || 'unavailable'}). Check access and Sheets API configuration.`);
  }
  if (!Array.isArray(metadata.data?.sheets)) throw new Error('The spreadsheet metadata is incomplete.');
  const requests = buildRequests(sheets, metadata.data.sheets);
  try {
    await client.request({ url: `${url}:batchUpdate`, method: 'POST', data: { requests } });
  } catch (error) {
    throw new Error(updateFailureMessage(error, requests, metadata.data.sheets));
  }
  console.log(`Updated ${sheets.length} managed tabs from ${sheets[0].rows.length - 1} registrations.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
