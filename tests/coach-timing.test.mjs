import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nextCoachTick} from '../frontend/coach-timing.mjs';
const config={mode:'reps',sets:2,reps:2,repSeconds:3,restSeconds:2,command:'Contraia',releaseSeconds:0};
const start={stage:'prepare',set:1,rep:1,count:3,paused:false};
function tick(run,c=config,n=1){for(let i=0;i<n;i++)run=nextCoachTick(run,c).run;return run;}
test('Preparation then each repetition lasts its full execution interval',()=>{
 const first=tick(start,config,3);assert.equal(first.stage,'exercise');assert.equal(first.count,3);assert.equal(first.rep,1);
 assert.equal(tick(first,config,2).count,1);
 const second=tick(first,config,3);assert.equal(second.stage,'exercise');assert.equal(second.rep,2);assert.equal(second.count,3);
 const rest=tick(second,config,3);assert.equal(rest.stage,'rest');assert.equal(rest.count,2);
 assert.equal(tick(rest,config,2).stage,'next');
});
test('Relaxation follows each repetition without reducing execution time',()=>{
 const c={...config,releaseSeconds:2};let run=tick(start,c,3);
 run=tick(run,c,3);assert.equal(run.stage,'release');assert.equal(run.rep,1);assert.equal(run.count,2);
 run=tick(run,c,2);assert.equal(run.stage,'exercise');assert.equal(run.rep,2);assert.equal(run.count,3);
 run=tick(run,c,3);assert.equal(run.stage,'release');
 assert.equal(tick(run,c,2).stage,'rest');
});
test('Final set completes once; paused/completed timers remain unchanged',()=>{
 const c={...config,sets:1,restSeconds:0};let run=tick(start,c,9);assert.equal(run.stage,'finished');assert.equal(run.count,0);
 assert.strictEqual(nextCoachTick(run,c).run,run);
 const paused={...start,paused:true};assert.strictEqual(nextCoachTick(paused,c).run,paused);
});
test('Timed series counts down exact seconds and ignores rep relaxation',()=>{
 const c={mode:'time',sets:1,seconds:5,restSeconds:0,releaseSeconds:20};const first=tick(start,c,3);assert.equal(first.count,5);
 assert.equal(tick(first,c,4).count,1);assert.equal(tick(first,c,5).stage,'finished');
});
test('Zero rest moves to next series; phase cues identify movement and release',()=>{
 const c={...config,restSeconds:0,releaseSeconds:1};const begin=nextCoachTick({...start,count:1},c);assert.equal(begin.cue,'Contraia.');
 const release=nextCoachTick({...begin.run,count:1},c);assert.equal(release.cue,'Relaxe.');
 const end=nextCoachTick({...release.run,rep:2},c);assert.equal(end.run.stage,'next');
});
