import test from 'node:test';
import assert from 'node:assert/strict';
import { commonAvailability, mostAvailability } from '../dist/availability.js';
const row = (days, start='19:00', end='23:00', max=2) => ({ days, earliest_start:start, latest_end:end, max_raid_days:max });
test('intersection uses latest start, earliest end, common days and weekly cap', () => {
 const rows=[row(['Sun','Wed','Mon'],'19:00','23:00',3),row(['Fri','Wed','Sun'],'19:30','22:30',1)];
 assert.deepEqual(commonAvailability(rows),{status:'available',count:2,days:['Wed','Sun'],start:'19:30',end:'22:30',maxDays:1});
 assert.deepEqual(rows[0].days,['Sun','Wed','Mon']);
});
test('no common day, no positive time overlap and incomplete data never claim everyone is available', () => {
 assert.equal(commonAvailability([]).status,'empty');
 assert.equal(commonAvailability([row(['Mon']),row(['Tue'])]).status,'none');
 assert.equal(commonAvailability([row(['Mon'],'18:30','19:30'),row(['Mon'],'19:30')]).status,'none');
 assert.equal(commonAvailability([row(['Mon']),row(['Mon'],'bad')]).status,'incomplete');
 assert.equal(commonAvailability([row([])]).status,'incomplete');
});
test('one participant retains their valid days and time range', () => {
 assert.deepEqual(commonAvailability([row(['Wed','Sun'])]),{status:'available',count:1,days:['Wed','Sun'],start:'19:00',end:'23:00',maxDays:2});
});

// The compromise list ranks the windows that do not suit everybody, best first.
const options = (result) => result.options.map((o) => `${o.day} ${o.start}-${o.end} (${o.count}/${result.count}, ${o.missing} fehlt)`);

test('equally good days are both offered, best group first', () => {
  const rows=[row(['Mon','Wed'],'18:30','23:00'),row(['Mon','Wed'],'19:30','22:00'),row(['Tue'],'19:00','23:00')];
  assert.equal(commonAvailability(rows).status,'none');
  const result=mostAvailability(rows);
  assert.equal(result.status,'available');
  assert.equal(result.count,3);
  assert.equal(result.excludedCount,0);
  assert.equal(result.availableCount,2);
  // The two flexible people cover 19:30-22:00 together, not the wider 18:30-23:00 of one of them.
  assert.deepEqual(options(result),['Mon 19:30-22:00 (2/3, 1 fehlt)','Wed 19:30-22:00 (2/3, 1 fehlt)']);
  assert.deepEqual(result.slots,[{day:'Mon',start:'19:30',end:'22:00'},{day:'Wed',start:'19:30',end:'22:00'}]);
});

test('same-sized groups changing at a boundary remain separate time windows', () => {
  const result=mostAvailability([row(['Mon'],'18:30','23:00'),row(['Mon'],'18:30','20:00'),row(['Mon'],'20:00','23:00')]);
  // Nobody can do the whole evening, so the two stretches count separately - each brings one person
  // the other does not have.
  assert.equal(result.availableCount,2);
  assert.deepEqual(options(result),['Mon 18:30-20:00 (2/3, 1 fehlt)','Mon 20:00-23:00 (2/3, 1 fehlt)']);
});
test('touching windows are not simultaneous and gaps are not bridged', () => {
  const result=mostAvailability([row(['Mon'],'18:30','19:00'),row(['Mon'],'19:00','20:00'),row(['Mon'],'21:00','23:00')]);
  // Nobody shares a minute with anybody else, so there is no option to offer.
  assert.equal(result.status,'none');
  assert.equal(result.availableCount,0);
  assert.deepEqual(result.options,[]);
});

test('the next best group extends through the all-participant window', () => {
  const result=mostAvailability([row(['Mon','Sun'],'18:30','23:00'),row(['Sun'],'19:00','22:30'),row(['Sun'],'20:00','22:00')]);
  assert.equal(result.availableCount,3);
  // The pair covers more of Sunday but adds nobody the full group does not already cover.
  assert.deepEqual(options(result),['Sun 20:00-22:00 (3/3, 0 fehlt)']);
});

test('six participants get wider five-person windows and an additional day', () => {
  const rows=[...Array.from({length:5},()=>row(['Mon','Wed'],'19:00','23:00')),row(['Wed'],'19:30','22:30')];
  assert.deepEqual(commonAvailability(rows).days,['Wed']);
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
  const result=mostAvailability([row(['Wed'],'18:30','23:00'),row(['Wed'],'18:30','22:00'),row(['Wed'],'20:00','23:00')]);
  assert.equal(result.availableCount,3);
  assert.deepEqual(options(result),['Wed 20:00-22:00 (3/3, 0 fehlt)']);
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
