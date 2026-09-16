import test from 'node:test';
import assert from 'node:assert/strict';
import { whoCanWhen } from '../dist/availability.js';

const row = (name, days, start = '19:00', end = '23:00', role = 'Healer') =>
  ({ name, days, earliest_start: start, latest_end: end, role });

// The board says two things per day: did the person mark it, and do their times cover the window the
// overview offers for that day.
test('a marked day only counts as fitting when the times cover the offered window', () => {
  const rows = [
    row('Passt', ['Mon'], '18:30', '23:00'),
    row('Zu spaet', ['Mon'], '20:00', '23:00'),
    row('Zu frueh Schluss', ['Mon'], '18:30', '22:00'),
    row('Nicht da', ['Wed'], '18:30', '23:00'),
  ];
  const board = whoCanWhen(rows, [{ day: 'Mon', start: '19:00', end: '22:00' }]);

  assert.equal(board.length, 4);
  assert.deepEqual(board[0].cells.map((cell) => [cell.marked, cell.fits]),
    [[true, true], [false, false], [false, false], [false, false], [false, false], [false, false], [false, false]]);
  // Started at 20:00, so the offered 19:00 start is not covered.
  assert.equal(board[1].cells[0].marked, true);
  assert.equal(board[1].cells[0].fits, false);
  // Ends at 22:00, which is exactly the offered end - that is still enough.
  assert.equal(board[2].cells[0].marked, true);
  assert.equal(board[2].cells[0].fits, true);
  // Another day, so Monday is not marked at all.
  assert.equal(board[3].cells[0].marked, false);
  assert.equal(board[3].cells[2].marked, true);
  assert.equal(board[3].cells[2].fits, false, 'no window is offered for Wednesday');
});

test('entries keep their order and carry name and role', () => {
  const board = whoCanWhen([row('Erste', ['Mon']), row('Zweite', ['Tue'], '19:00', '23:00', 'Tank')]);
  assert.deepEqual(board.map((entry) => entry.name), ['Erste', 'Zweite']);
  assert.deepEqual(board.map((entry) => entry.role), ['Healer', 'Tank']);
  assert.deepEqual(board.map((entry) => entry.index), [0, 1]);
});

test('the days come back in the week order, one cell each', () => {
  const board = whoCanWhen([row('Einer', ['Sun', 'Mon'])]);
  assert.deepEqual(board[0].cells.map((cell) => cell.day),
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  assert.equal(board[0].cells.length, 7);
});

test('missing times and missing days never claim a fit', () => {
  const board = whoCanWhen([
    row('Ohne Zeiten', ['Mon'], 'kaputt', '23:00'),
    row('Ohne Tage', [], '19:00', '23:00'),
    row('Verdreht', ['Mon'], '23:00', '19:00'),
    { name: 'Kahl', role: 'Flexible' },
  ], [{ day: 'Mon', start: '19:00', end: '22:00' }]);

  for (const entry of board) {
    assert.ok(entry.cells.every((cell) => cell.fits === false), `${entry.name} darf nicht passen`);
  }
  assert.equal(board[0].cells[0].marked, true, 'der Tag selbst ist trotzdem markiert');
  assert.equal(board[3].cells[0].marked, false);
});

test('a broken offered window is ignored instead of fitting everybody', () => {
  const rows = [row('Einer', ['Mon']), row('Zweiter', ['Mon'])];
  for (const kaputt of [[{ day: 'Mon', start: '22:00', end: '19:00' }], [{ day: 'Mon', start: null, end: '22:00' }], [null], [{}]]) {
    const board = whoCanWhen(rows, kaputt);
    assert.ok(board.every((entry) => entry.cells.every((cell) => cell.fits === false)),
      `kaputtes Fenster ${JSON.stringify(kaputt)} darf niemanden passen lassen`);
  }
  assert.ok(whoCanWhen(rows).every((entry) => entry.cells.every((cell) => !cell.fits)),
    'ohne Fenster passt niemand');
});
