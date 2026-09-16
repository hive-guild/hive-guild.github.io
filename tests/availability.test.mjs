import test from 'node:test';
import assert from 'node:assert/strict';
import { mostAvailability } from '../dist/availability.js';
const row = (days, start='19:00', end='23:00', max=2) => ({ days, earliest_start:start, latest_end:end, max_raid_days:max });
// The compromise list ranks the windows that do not suit everybody, best first.
const options = (result) => result.options.map((o) => `${o.day} ${o.start}-${o.end} (${o.count}/${result.count}, ${o.missing} fehlt)`);

test('equally good days are both offered, best group first', () => {
  const rows=[row(['Mon','Wed'],'18:30','23:00'),row(['Mon','Wed'],'19:30','22:30'),row(['Tue'],'19:00','23:00')];
  const result=mostAvailability(rows);
  assert.equal(result.status,'available');
  assert.equal(result.count,3);
  assert.equal(result.excludedCount,0);
  assert.equal(result.availableCount,2);
  // The two flexible people cover 19:30-22:30 together, not the wider 18:30-23:00 of one of them.
  assert.deepEqual(options(result),['Mon 19:30-22:30 (2/3, 1 fehlt)','Wed 19:30-22:30 (2/3, 1 fehlt)']);
  assert.deepEqual(result.slots,[{day:'Mon',start:'19:30',end:'22:30'},{day:'Wed',start:'19:30',end:'22:30'}]);
});

test('a day is offered once, with its fullest window', () => {
  const result=mostAvailability([row(['Mon'],'18:00','23:00'),row(['Mon'],'18:00','21:00'),row(['Mon'],'20:00','23:00')]);
  // All three stretches are on Monday and all suit two people, so only one of them is offered - the
  // earliest, since the ranking falls through to the start. Monday must not fill two places in a list
  // that is meant to name different evenings.
  assert.equal(result.availableCount,2);
  assert.deepEqual(options(result),['Mon 18:00-21:00 (2/3, 1 fehlt)']);
});

test('five different days are offered when five days have a long enough window', () => {
  // Each pair shares one day, and the days are all different.
  const tage=['Mon','Tue','Wed','Thu','Fri'];
  const rows=tage.flatMap((tag) => [row([tag],'19:00','23:00'),row([tag],'19:00','23:00')]);
  const result=mostAvailability(rows);
  assert.equal(result.options.length,5);
  assert.deepEqual(result.options.map((option) => option.day),tage);
  assert.equal(new Set(result.options.map((option) => option.day)).size,5, 'kein Tag darf doppelt vorkommen');
});

test('a window shorter than the raid minimum is no offer', () => {
  // Two people share Monday 19:30-22:00, which is two and a half hours.
  const result=mostAvailability([row(['Mon'],'18:00','22:00'),row(['Mon'],'19:30','23:00')]);
  assert.equal(result.status,'none');
  assert.equal(result.availableCount,0);
  assert.deepEqual(result.options,[]);
});
test('touching windows are not simultaneous and gaps are not bridged', () => {
  const result=mostAvailability([row(['Mon'],'18:30','19:00'),row(['Mon'],'19:00','20:00'),row(['Mon'],'21:00','23:00')]);
  // Nobody shares a minute with anybody else, so there is no option to offer.
  assert.equal(result.status,'none');
  assert.equal(result.availableCount,0);
  assert.deepEqual(result.options,[]);
});

test('the next best group extends through the all-participant window', () => {
  const result=mostAvailability([row(['Mon','Sun'],'18:30','23:00'),row(['Sun'],'19:00','22:30'),row(['Sun'],'19:30','22:30')]);
  assert.equal(result.availableCount,3);
  // All three share Sunday 19:30-22:30; the pair of the other two adds nobody new.
  assert.deepEqual(options(result),['Sun 19:30-22:30 (3/3, 0 fehlt)']);
});

test('six participants get wider five-person windows and an additional day', () => {
  const rows=[...Array.from({length:5},()=>row(['Mon','Wed'],'19:00','23:00')),row(['Wed'],'19:30','22:30')];
  const result=mostAvailability(rows);
  assert.equal(result.count,6);
  assert.equal(result.availableCount,6);
  // Everybody fits on Wednesday; on Monday the one person with the short Wednesday window is out.
  assert.deepEqual(options(result),[
    'Wed 19:30-22:30 (6/6, 0 fehlt)','Mon 19:00-23:00 (5/6, 1 fehlt)',
  ]);
});

test('three compromises are offered even when more than one person drops out', () => {
  const rows=[
    row(['Mon','Tue','Wed','Thu'],'19:00','23:00'),
    row(['Mon','Tue','Wed'],'19:00','23:00'),
    row(['Mon','Tue'],'19:00','23:00'),
    row(['Mon'],'19:00','23:00'),
    row(['Mon','Fri'],'19:00','23:00'),
  ];
  const result=mostAvailability(rows);
  assert.equal(result.status,'available');
  assert.equal(result.options.length,3);
  assert.equal(result.options[0].count,5);
  const counts=result.options.map((o)=>o.count);
  assert.deepEqual(counts,[...counts].sort((a,b)=>b-a));
  for (const option of result.options) assert.equal(option.count+option.missing,result.count);
  // The second and third option really are compromises: fewer people, explicitly named.
  assert.ok(result.options[1].count < result.count);
  assert.ok(result.options[1].missing >= 1);
  assert.deepEqual(options(result),[
    'Mon 19:00-23:00 (5/5, 0 fehlt)','Tue 19:00-23:00 (3/5, 2 fehlt)','Wed 19:00-23:00 (2/5, 3 fehlt)',
  ]);
});

test('different groups cannot be merged across an everyone-available window', () => {
  const result=mostAvailability([row(['Wed'],'19:00','23:00'),row(['Wed'],'19:00','22:00'),row(['Wed'],'19:30','23:00')]);
  // All three overlap only 19:30-22:00, which is short of the raid minimum. What is left is the pair
  // that shares a long enough evening - one window, not two stitched together, and the day appears once.
  assert.equal(result.availableCount,2);
  assert.deepEqual(options(result),['Wed 19:30-23:00 (2/3, 1 fehlt)']);
});

test('identical schedules and a single participant have no wider alternative', () => {
  assert.equal(mostAvailability([row(['Wed']),row(['Wed'])]).status,'available');
  assert.equal(mostAvailability([row(['Wed']),row(['Wed'])]).availableCount,2);
  assert.equal(mostAvailability([row(['Wed'])]).status,'none');
});

test('falls back to the highest smaller group that actually adds flexibility', () => {
  const rows=[...Array.from({length:4},()=>row(['Wed'])),row(['Wed','Sun']),row(['Wed','Sun'])];
  const result=mostAvailability(rows);
  assert.equal(result.availableCount,6);
  assert.deepEqual(options(result),['Wed 19:00-23:00 (6/6, 0 fehlt)','Sun 19:00-23:00 (2/6, 4 fehlt)']);
});

test('incomplete records are reported without inflating attendance or changing input', () => {
  const rows=[row(['Mon']),row([]),row(['Tue'],'bad'),row(['Wed'],'23:00','19:00'),row(['invalid'])];
  const before=structuredClone(rows);
  const result=mostAvailability(rows);
  // Only one usable record is left, and a single person is no raid option.
  assert.equal(result.status,'none');
  assert.equal(result.count,5);
  assert.equal(result.excludedCount,4);
  assert.deepEqual(result.options,[]);
  assert.deepEqual(rows,before);
  assert.equal(mostAvailability([]).status,'empty');
  assert.equal(mostAvailability([row([])]).status,'incomplete');
});

test('a window that suits everybody is offered as the option without a compromise', () => {
  // All three share Monday 19:00-23:00; only two of them also share Sunday.
  const rows=[row(['Mon','Sun']),row(['Mon','Sun']),row(['Mon'])];
  const result=mostAvailability(rows);
  assert.deepEqual(options(result),['Mon 19:00-23:00 (3/3, 0 fehlt)','Sun 19:00-23:00 (2/3, 1 fehlt)']);
  assert.equal(result.options[0].missing,0);
  assert.equal(result.options[1].missing,1);
});
