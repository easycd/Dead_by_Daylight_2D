import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../game.js';
import {CONFIG as C} from '../config.js';
import {repairSkillChance} from '../rules.js';
import {projectMarker} from '../public/scene.js';
function setup(){const r=new Room('FEEL01','feel'),k=r.addPlayer('killer'),a=r.addPlayer('a'),b=r.addPlayer('b');r.start(k.id);for(const key of ['walls','windows','pallets','cabinets','cages','totems','chests','items','generators','exits'])r.map[key]=[];k.x=1100;k.y=1000;a.x=1000;a.y=1000;b.x=3000;b.y=3000;for(const p of r.players.values())p.nextSkill=10000;return {r,k,a,b};}
function advance(r,t){while(t>1e-8){const dt=Math.min(.025,t);r.tick(dt);t-=dt;}}
test('repair checks rise with progress and guarantee a check even on unlucky rolls',()=>{
 assert.ok(repairSkillChance(0)<repairSkillChance(.5));assert.ok(repairSkillChance(.5)<repairSkillChance(1));assert.ok(repairSkillChance(.5,true)>repairSkillChance(.5));
 for(const [progress,limit]of [[0,6],[.5,5],[.95,4]]){const {r,a}=setup();r.random=()=>.999;r.map.generators=[{id:'g',x:a.x,y:a.y,progress:90*progress}];a.nextSkill=0;for(let n=0;n<limit;n++){r.rollSkill(a,'repair','g',1,repairSkillChance(progress));if(a.skill)break;}assert.equal(a.skill?.type,'repair');assert.equal(a.repairRolls,0);}
});
test('injury and bleeding do not reduce base run speed after the longer hit boost expires',()=>{
 const {r,k,a}=setup();k.x=3000;k.y=1000;a.input={...a.input,x:1,run:true};a.moveSpeed=C.survivorSpeed;r.move(a,1);const healthy=a.x;
 r.damage(a);assert.equal(a.hitBoost,2.2);advance(r,C.hitBoostSeconds+.1);const before=a.x;advance(r,1);assert.ok(Math.abs(a.x-before-C.survivorSpeed)<1e-6);assert.equal(a.health,1);assert.ok(r.traces.some(t=>t.type==='blood'));assert.ok(healthy>1000);
});
test('pickup freezes crawling for two seconds regardless of iteration order and cancels cleanly',()=>{
 for(const victimFirst of [false,true]){const {r,k,a,b}=setup();a.status='down';a.health=0;a.input.x=-1;k.x=a.x+40;k.input.work=true;if(victimFirst)r.players=new Map([[a.id,a],[b.id,b],[k.id,k]]);
 r.tick(.025);assert.equal(a.pickupBy,k.id);const start=a.x;advance(r,1.8);assert.equal(a.x,start);assert.equal(a.status,'down');advance(r,.21);assert.equal(a.status,'carried');assert.equal(k.carrying,a.id);assert.equal(a.pickupBy,null);}
 const {r,k,a}=setup();a.status='down';a.health=0;a.input.x=-1;k.x=a.x+40;k.input.work=true;r.tick(.025);const before=a.x;k.input.work=false;r.tick(.1);assert.ok(a.x<before);assert.equal(a.pickupBy,null);assert.equal(k.task,null);
});
test('pallet impact occurs after 0.5 seconds and only stuns a killer still in impact range',()=>{
 for(const dodge of [false,true]){const {r,k,a}=setup(),pal={id:'p',x:960,y:1030,w:100,h:24,axis:'y',state:'ready'};r.map.pallets=[pal];a.x=1010;a.y=1000;k.x=1010;k.y=1070;r.interact(a,.01,true);assert.equal(pal.state,'falling');assert.equal(k.stun,0);advance(r,.45);assert.equal(pal.state,'falling');if(dodge)k.x+=120;advance(r,.06);assert.equal(pal.state,'dropped');assert.equal(k.stun>1.8,!dodge);}
});
test('objective markers retain direction and stay inside the viewport at extreme distances',()=>{
 for(const [W,H]of [[1280,900],[375,812],[320,240]])for(const p of [{x:10000,y:0},{x:-10000,y:-10000},{x:0,y:10000},{x:0,y:0}]){const q=projectMarker(p,{x:0,y:0},W,H);assert.ok(q.x>=0&&q.x<=W);assert.ok(q.y>=0&&q.y<=H);assert.equal(q.offscreen,!!(p.x||p.y));assert.ok(Number.isFinite(q.angle));}
 assert.equal(C.survivorVision,400);assert.equal(C.survivorVision*C.killerVisionMultiplier,780);
});
