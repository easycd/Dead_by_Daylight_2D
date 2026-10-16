import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../game.js';
import {CONFIG as C} from '../config.js';
import {penetration,smoothAngle,blocksMovement} from '../public/motion.js';
import {loadingPresentation} from '../public/loading.js';
import {createInteractionPreview} from '../public/interaction-preview.js';
import {createSkillCheckPresentation} from '../public/skill-check.js';
function setup(){const r=new Room('PLAY01','play'),k=r.addPlayer('K'),a=r.addPlayer('A'),b=r.addPlayer('B');r.start(k.id);for(const key of ['walls','windows','pallets','cabinets','totems','chests','generators','items','cages','exits'])r.map[key]=[];k.x=3000;k.y=3000;a.x=1000;a.y=1000;b.x=2000;b.y=2000;return {r,k,a,b};}
test('touching or partially overlapping walls allows backing away and sliding without tunnelling',()=>{
 for(const material of ['wood','tree','stone'])for(const overlap of [0,.05,5,16]){
  const {r,a}=setup(),w={x:1015-overlap,y:900,w:30,h:200,material};r.map.walls=[w];a.moveSpeed=96;a.input.x=-1;const before=penetration(a.x,a.y,15,w);r.move(a,.1);assert.ok(a.x<1000);assert.ok(penetration(a.x,a.y,15,w)<=before);
  a.x=1000;a.input.x=0;a.input.y=1;const y=a.y;r.move(a,.1);assert.ok(a.y>y);
 }
 const {r,a}=setup();r.map.walls=[{x:1030,y:900,w:20,h:200}];a.input.x=1;a.input.run=true;r.move(a,1);assert.ok(a.x<=1015.000001);assert.ok(blocksMovement({x:1015,y:1000},{x:1016,y:1000},15,r.map.walls[0]));
});
test('movement escapes a pallet that landed overlapping a player',()=>{
 const {r,a}=setup();r.map.pallets=[{x:1008,y:980,w:90,h:24,state:'dropped'}];a.input.y=1;for(let i=0;i<20;i++)r.move(a,.05);assert.ok(a.y>1030);
});
test('a queued second SPACE press is not swallowed by the previous tick held state',()=>{
 const {r,a}=setup();r.map.cabinets=[{id:'l',x:1000,y:1000,occupant:a.id}];a.hidden='l';a.previous.space=true;a.input.space=false;a.pendingPress.add('space');r.tick(1/30);assert.equal(a.lockerTransition?.type,'exit');assert.equal(a.pendingPress.size,0);
});
test('loading keeps game simulation frozen for ten seconds then clears held inputs',()=>{
 const {r,k,a}=setup();r.phase='lobby';r.start(k.id,{loadingSeconds:10});const pos={x:a.x,y:a.y};a.input.x=1;a.input.work=true;a.pendingPress.add('space');
 for(let i=0;i<99;i++)r.tick(.1);assert.equal(r.phase,'loading');assert.equal(r.elapsed,0);assert.deepEqual({x:a.x,y:a.y},pos);assert.equal(a.input.x,0);assert.equal(a.pendingPress.size,0);
 r.tick(.1);assert.equal(r.phase,'playing');assert.equal(r.elapsed,0);r.tick(.1);assert.ok(r.elapsed>0);
 const s=r.snapshot();s.loadingRemaining=8;s.config=C;assert.ok(loadingPresentation(s).tip.length>0);assert.equal(loadingPresentation({...s,loadingRemaining:10},-.01).remaining,10);assert.ok(Math.abs(loadingPresentation(s).progress-.2)<1e-8);
});
test('disconnecting a participant during loading cancels start rather than leaving a killerless game',()=>{
 const {r,k,a}=setup();r.phase='lobby';r.start(k.id,{loadingSeconds:10});a.connected=false;r.tick(.1);assert.equal(r.phase,'lobby');assert.equal(r.loadingRemaining,0);assert.equal(r.elapsed,0);
});
test('view rotation crosses the -pi/pi seam smoothly and responds between network snapshots',()=>{
 let current=Math.PI-.01,target=-Math.PI+.01;const next=smoothAngle(current,target,1/60);assert.ok(next>current);assert.ok(next-current<.02);
 current=0;const one=smoothAngle(current,Math.PI/2,1/120),two=smoothAngle(one,Math.PI/2,1/120);assert.ok(two>one&&one>0);assert.ok(two<Math.PI/2);
});
test('local SPACE feedback starts immediately and is replaced by authoritative state or timeout',()=>{
 const {r,a}=setup(),pal={id:'p',x:970,y:1030,w:90,h:24,axis:'y',state:'ready'};r.map.pallets=[pal];const s=r.snapshot(),p=s.players.find(p=>p.id===a.id),preview=createInteractionPreview();preview.press(s,p,{run:false},1000);
 assert.equal(preview.frame(s,s.players,1000).map.pallets[0].state,'falling');assert.equal(r.map.pallets[0].state,'ready');assert.equal(preview.frame(s,s.players,1400).map.pallets[0].state,'ready');
 preview.press(s,p,{run:false},1500);s.map.pallets[0].state='dropped';assert.equal(preview.frame(s,s.players,1550).map.pallets[0].state,'dropped');
});
test('skill needle freezes on keydown while waiting for the server instead of continuing to rotate',()=>{
 const c=createSkillCheckPresentation(),p={id:'a',skill:{type:'heal',start:1,duration:1.2}},s={phase:'playing',elapsed:1.5,map:{generators:[]}},camera={x:0,y:0};const first=c.frame(s,p,1000,800,0,camera,1000);c.press(1001);s.elapsed=1.7;const frozen=c.frame(s,p,1000,800,0,camera,1050);assert.equal(frozen.phase,first.phase);assert.ok(frozen.opacity<1);assert.equal(c.frame(s,p,1000,800,0,camera,1300),null);
});
