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

test('largest group uses simultaneous time overlap and returns all equally good days', () => {
 const rows=[row(['Mon','Wed'],'18:30','23:00'),row(['Mon','Wed'],'19:30','22:00'),row(['Tue'],'19:00','23:00')];
 assert.equal(commonAvailability(rows).status,'none');
 assert.deepEqual(mostAvailability(rows),{status:'available',count:3,excludedCount:0,availableCount:2,slots:[
   {day:'Mon',start:'19:30',end:'22:00'},{day:'Wed',start:'19:30',end:'22:00'},
 ]});
});

test('same-sized groups changing at a boundary remain separate time windows', () => {
 const result=mostAvailability([row(['Mon'],'18:30','23:00'),row(['Mon'],'18:30','20:00'),row(['Mon'],'20:00','23:00')]);
 assert.equal(result.availableCount,2);
 assert.deepEqual(result.slots,[{day:'Mon',start:'18:30',end:'20:00'},{day:'Mon',start:'20:00',end:'23:00'}]);
});

test('touching windows are not simultaneous and gaps are not bridged', () => {
 const result=mostAvailability([row(['Mon'],'18:30','19:00'),row(['Mon'],'19:00','20:00'),row(['Mon'],'21:00','23:00')]);
 assert.equal(result.availableCount,1);
 assert.deepEqual(result.slots,[{day:'Mon',start:'18:30',end:'19:00'},{day:'Mon',start:'19:00',end:'20:00'},{day:'Mon',start:'21:00',end:'23:00'}]);
});

test('a later larger group replaces smaller candidates and keeps chronological order', () => {
 const result=mostAvailability([row(['Mon','Sun'],'18:30','23:00'),row(['Sun'],'19:00','22:30'),row(['Sun'],'20:00','22:00')]);
 assert.equal(result.availableCount,3);
 assert.deepEqual(result.slots,[{day:'Sun',start:'20:00',end:'22:00'}]);
});

test('incomplete records are reported without inflating attendance or changing input', () => {
 const rows=[row(['Mon']),row([]),row(['Tue'],'bad'),row(['Wed'],'23:00','19:00'),row(['invalid'])];
 const before=structuredClone(rows);
 assert.deepEqual(mostAvailability(rows),{status:'available',count:5,excludedCount:4,availableCount:1,slots:[{day:'Mon',start:'19:00',end:'23:00'}]});
 assert.deepEqual(rows,before);
 assert.equal(mostAvailability([]).status,'empty');
 assert.equal(mostAvailability([row([])]).status,'incomplete');
});
