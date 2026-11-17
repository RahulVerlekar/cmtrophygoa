import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequests, prepareSheets, updateFailureMessage } from '../scripts/sync-registrations.mjs';

const headers = ['registration_number', 'created_at', 'category', 'event', 'details'];
const person = (name, constituency, extra = {}) => ({ fullName: name, constituency, ...extra });
const registration = (number, createdAt, event, participants) => [
  number, createdAt, 'Sports', event, JSON.stringify({ participants, consent: true })
];
const csv = (rows) => [headers, ...rows]
  .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
  .join('\r\n');

test('preserves master rows and groups individual participants by constituency and timestamp', () => {
  const rows = [
    registration('CM-2', '2026-11-16T08:00:00.123456Z', 'cricket', [
      person('Second, Person', 'Panaji', { phone: '0012345678', epic: '=TEST' }),
      person('Other constituency', 'Margao')
    ]),
    registration('CM-1', '2026-11-16T13:00:00+05:30', 'cricket', [person('First', 'Panaji')]),
    registration('CM-3', '2026-11-16T09:00:00Z', 'marathon', [person('Runner', 'Aldona')])
  ];
  rows[0][4] = JSON.stringify({ ...JSON.parse(rows[0][4]), event: 'cricket', teamName: 'Test team' });
  const sheets = prepareSheets(csv(rows), new Date('2026-11-16T17:00:00Z'));
  assert.equal(sheets[0].title, 'Master');
  assert.deepEqual(sheets[0].rows, [
    headers,
    [rows[0][0], '16 Nov 2026, 1:30 PM IST', ...rows[0].slice(2)],
    [rows[1][0], '16 Nov 2026, 1:00 PM IST', ...rows[1].slice(2)],
    [rows[2][0], '16 Nov 2026, 2:30 PM IST', ...rows[2].slice(2)]
  ]);
  const cricket = sheets.find((sheet) => sheet.title === 'cricket').rows;
  const column = (name) => cricket[0].indexOf(name);
  assert.deepEqual(cricket.slice(1).map((row) => row[column('Full Name')]), [
    'Other constituency', 'First', 'Second, Person'
  ]);
  assert.deepEqual(cricket[0].slice(0, 4), ['Constituency', 'Team Name', 'Full Name', 'Email']);
  assert.ok(column('Created At (IST)') < column('Registration Number'));
  assert.equal(cricket[1][column('Participant Number')], '2');
  assert.equal(cricket[3][column('Phone')], '0012345678');
  assert.equal(cricket[3][column('EPIC')], '=TEST');
  assert.equal(cricket[3][column('Team Name')], 'Test team');
  assert.equal(cricket[3][column('Created At (IST)')], '16 Nov 2026, 1:30 PM IST');
  assert.equal(cricket[3].length, cricket[0].length);
  assert.deepEqual(JSON.parse(cricket[3][column('Participant Details')]), JSON.parse(rows[0][4]).participants[0]);
  assert.ok(cricket[0].includes('Team Name'));
  assert.ok(!cricket[0].includes('Event'));
  assert.ok(!cricket[0].includes('Registration Details'));
  const marathon = sheets.find((sheet) => sheet.title === 'marathon').rows;
  assert.equal(marathon.length, 2);
  assert.ok(!marathon[0].includes('Event'));
  assert.ok(!marathon[0].includes('Team Name'));
  assert.equal(marathon[1][marathon[0].indexOf('Full Name')], 'Runner');
  assert.equal(marathon[1].length, marathon[0].length);
  assert.equal(sheets.find((sheet) => sheet.title === 'carrom').rows.length, 1);
  const summary = sheets.find((sheet) => sheet.title === 'Summary').rows;
  assert.deepEqual(summary.slice(0, 3), [
    ['Sheet sync started (IST)', '16 Nov 2026, 10:30 PM'],
    ['Total registration entries', '3'],
    ['Total participants', '4']
  ]);
  assert.deepEqual(summary[3], ['Last registration (IST)', '16 Nov 2026, 2:30 PM IST']);
  assert.ok(!summary.some((row) => row[0] === 'Last registration number'));
  assert.deepEqual(summary.find((row) => row[0] === 'Cricket (Men)'), ['Cricket (Men)', '2', '3']);
  assert.deepEqual(summary.find((row) => row[0] === 'Marathon'), ['Marathon', '1', '1']);
  assert.deepEqual(summary.find((row) => row[0] === 'Carrom - Singles'), ['Carrom - Singles', '0', '0']);
});

test('rejects incomplete or invalid exports before preparing updates', () => {
  const valid = registration('CM-1', '2026-11-16T08:00:00Z', 'cricket', [person('Name', 'Panaji')]);
  assert.throws(() => prepareSheets(csv([])), /no registrations/);
  assert.throws(() => prepareSheets(csv([valid, valid])), /duplicate registration number/);
  assert.throws(() => prepareSheets(csv([registration('CM-1', 'bad', 'cricket', [person('Name', 'Panaji')])])), /timestamp/);
  assert.throws(() => prepareSheets(csv([registration('CM-1', '2026-11-16T08:00:00Z', 'unknown', [person('Name', 'Panaji')])])), /unrecognized event/);
  assert.throws(() => prepareSheets(csv([registration('CM-1', '2026-11-16T08:00:00Z', 'cricket', [person('Name', '')])])), /constituency/);
  assert.throws(() => prepareSheets('registration_number,created_at\nvalue'), /parse the CSV/);
});

test('exports both Rangoli participants without a team-name column', () => {
  const rows = [registration('CM-1', '2026-11-16T08:00:00Z', 'rangoli', [
    person('One', 'Panaji'), person('Two', 'Panaji')
  ])];
  const sheets = prepareSheets(csv(rows));
  const rangoli = sheets.find((sheet) => sheet.title === 'rangoli').rows;
  assert.equal(rangoli.length, 3);
  assert.ok(!rangoli[0].includes('Team Name'));
  assert.deepEqual(rangoli.slice(1).map((row) => row[rangoli[0].indexOf('Full Name')]), ['One', 'Two']);
  assert.deepEqual(sheets.find((sheet) => sheet.title === 'Summary').rows.find((row) => row[0] === 'Rangoli'), ['Rangoli', '1', '2']);
});

test('counts participants and distinct registrations per constituency, including empty ones', () => {
  const rows = [
    registration('CM-1', '2026-11-16T08:00:00Z', 'street-play', [
      person('One', 'Panaji'), person('Two', 'Panaji'), person('Three', 'Margao')
    ]),
    registration('CM-2', '2026-11-16T09:00:00Z', 'marathon', [person('Four', 'Panaji')])
  ];
  const counts = prepareSheets(csv(rows)).find((sheet) => sheet.title === 'Constituency Counts').rows;
  const header = counts[0];
  assert.deepEqual(header.slice(0, 3), ['Constituency', 'Registration entries', 'Participants']);
  assert.equal(header.at(-1), 'Last entry (IST)');
  const panaji = counts.find((row) => row[0] === 'Panaji');
  const margao = counts.find((row) => row[0] === 'Margao');
  const aldona = counts.find((row) => row[0] === 'Aldona');
  assert.deepEqual(panaji.slice(0, 3), ['Panaji', '2', '3']);
  assert.equal(panaji[header.indexOf('Street Play (Inter-collegiate)')], '1');
  assert.equal(panaji[header.indexOf('Marathon')], '1');
  assert.equal(panaji.at(-1), '16 Nov 2026, 2:30 PM IST');
  assert.equal(margao[header.indexOf('Street Play (Inter-collegiate)')], '1');
  assert.equal(margao.at(-1), '16 Nov 2026, 1:30 PM IST');
  assert.equal(aldona[header.indexOf('Marathon')], '0');
  assert.equal(aldona.at(-1), '');
  assert.ok(counts.every((row) => row.length === header.length));
});

test('finds and sorts the last registration using sub-millisecond timestamp precision', () => {
  const rows = [
    registration('CM-1', '2026-11-16T08:00:00.123900Z', 'marathon', [person('Later', 'Panaji')]),
    registration('CM-2', '2026-11-16T13:30:00.123100+05:30', 'marathon', [person('Earlier', 'Panaji')])
  ];
  const sheets = prepareSheets(csv(rows));
  const summary = sheets.find((sheet) => sheet.title === 'Summary').rows;
  assert.deepEqual(summary[3], ['Last registration (IST)', '16 Nov 2026, 1:30 PM IST']);
  const counts = sheets.find((sheet) => sheet.title === 'Constituency Counts').rows;
  const panaji = counts.find((row) => row[0] === 'Panaji');
  assert.deepEqual(panaji.slice(0, 3), ['Panaji', '2', '2']);
  assert.equal(panaji.at(-1), '16 Nov 2026, 1:30 PM IST');
  const marathon = sheets.find((sheet) => sheet.title === 'marathon').rows;
  const nameColumn = marathon[0].indexOf('Full Name');
  assert.deepEqual(marathon.slice(1).map((row) => row[nameColumn]), ['Earlier', 'Later']);
});

test('displays midnight and noon in the requested IST format', () => {
  const rows = [
    registration('CM-1', '2026-11-16T18:30:45Z', 'marathon', [person('Midnight', 'Panaji')]),
    registration('CM-2', '2026-11-17T06:30:00Z', 'marathon', [person('Noon', 'Panaji')])
  ];
  const master = prepareSheets(csv(rows))[0].rows;
  assert.equal(master[1][1], '17 Nov 2026, 12:00 AM IST');
  assert.equal(master[2][1], '17 Nov 2026, 12:00 PM IST');
});

test('replaces managed tab values, creates missing tabs and writes strings without formulas', () => {
  const sheets = [
    { title: 'Master', rows: [['id', 'text'], ['001', '=1+1'], ['002', '+123']] },
    { title: 'cricket', rows: [['name'], ['Test']] }
  ];
  const requests = buildRequests(sheets, [
    { properties: { title: 'Master', sheetId: 7, gridProperties: { rowCount: 2, columnCount: 2 } } },
    { properties: { title: 'Client notes', sheetId: 9, gridProperties: { rowCount: 1000, columnCount: 26 } } }
  ]);
  assert.deepEqual(requests[0].updateSheetProperties.properties.gridProperties, { rowCount: 3, columnCount: 2 });
  assert.deepEqual(requests[1].updateCells.range, { sheetId: 7 });
  assert.deepEqual(requests[2].updateCells.rows[1].values[1], { userEnteredValue: { stringValue: '=1+1' } });
  assert.equal(requests.find((request) => request.addSheet)?.addSheet.properties.sheetId, 10);
  assert.ok(requests.some((request) => request.updateCells?.start?.sheetId === 10));
  assert.ok(!JSON.stringify(requests).includes('Client notes'));
});

test('formats and freezes event headers and the summary header', () => {
  const data = registration('CM-1', '2026-11-16T08:00:00Z', 'cricket', [person('Name', 'Panaji')]);
  const sheets = prepareSheets(csv([data]));
  const requests = buildRequests(sheets, []);
  const ids = Object.fromEntries(requests.filter((request) => request.addSheet)
    .map((request) => [request.addSheet.properties.title, request.addSheet.properties.sheetId]));
  const freeze = (id) => requests.find((request) =>
    request.updateSheetProperties?.properties.sheetId === id &&
    request.updateSheetProperties.fields === 'gridProperties.frozenRowCount');
  const header = (id) => requests.find((request) =>
    request.repeatCell?.range.sheetId === id && request.repeatCell.cell.userEnteredFormat?.backgroundColor);
  assert.equal(freeze(ids.cricket).updateSheetProperties.properties.gridProperties.frozenRowCount, 1);
  assert.equal(header(ids.cricket).repeatCell.range.startRowIndex, 0);
  assert.equal(freeze(ids.Summary).updateSheetProperties.properties.gridProperties.frozenRowCount, 6);
  assert.equal(header(ids.Summary).repeatCell.range.startRowIndex, 5);
  assert.equal(header(ids.Summary).repeatCell.cell.userEnteredFormat.textFormat.bold, true);
  assert.ok(requests.some((request) => request.repeatCell?.range.sheetId === ids.Summary &&
    request.repeatCell.range.startRowIndex === undefined &&
    Object.keys(request.repeatCell.cell).length === 0));
});

test('allows an unfrozen row on empty event tabs, both new and existing', () => {
  const sheet = { title: 'carrom', rows: [['full_name']] };
  const created = buildRequests([sheet], []);
  assert.equal(created[0].addSheet.properties.gridProperties.rowCount, 2);
  const existing = buildRequests([sheet], [
    { properties: { title: 'carrom', sheetId: 7, gridProperties: { rowCount: 1, columnCount: 1 } } }
  ]);
  assert.equal(existing[0].updateSheetProperties.properties.gridProperties.rowCount, 2);
  assert.equal(existing[0].updateSheetProperties.fields, 'gridProperties.rowCount,gridProperties.columnCount');
});

test('reports the rejected request without exposing response or cell contents', () => {
  const sheets = [{ title: 'carrom', rows: [['full_name'], ['Private name']] }];
  const requests = buildRequests(sheets, []);
  const index = requests.findIndex((request) => request.repeatCell);
  const error = { response: { status: 400, data: { error: { message: `Invalid requests[${index}]: Private name` } } } };
  assert.equal(updateFailureMessage(error, requests, []),
    `Spreadsheet update rejected (HTTP 400; request ${index}: repeatCell on "carrom").`);
});
