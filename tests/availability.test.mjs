import test from 'node:test';
import assert from 'node:assert/strict';
import { commonAvailability } from '../dist/availability.js';
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
