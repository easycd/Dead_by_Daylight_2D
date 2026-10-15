import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../game.js';
import {CONFIG as C} from '../config.js';
import {attackRecoveryMultiplier,skillProfile,campRate} from '../rules.js';

function setup(){
  const r=new Room('PARITY','rules'),k=r.addPlayer('killer'),a=r.addPlayer('alice'),b=r.addPlayer('bob');r.start(k.id);
  for(const name of ['walls','windows','pallets','cabinets','totems','chests','items'])r.map[name]=[];
  k.x=1000;k.y=1000;a.x=1060;a.y=1000;b.x=2000;b.y=2000;
  for(const p of r.players.values())p.nextSkill=10000;
  return {r,k,a,b};
}
const advance=(r,time)=>{for(let n=Math.ceil(time*30),i=0;i<n;i++)r.tick(time/n);};

test('attack recovery has distinct curves, locks interactions and permits attacks while carrying',()=>{
  assert.equal(attackRecoveryMultiplier('hit',1.35,2.7),.125);
  assert.equal(attackRecoveryMultiplier('miss',.75,1.5),.25);
  const {r,k,a,b}=setup();a.status='down';a.health=0;k.cooldown=2.7;k.input.work=true;
  r.interact(k,.1,false);assert.equal(k.task,null);
  k.cooldown=0;k.input.work=false;k.carrying=a.id;a.status='carried';b.x=1060;b.y=1000;
  r.attack(k);assert.ok(k.attackState);assert.equal(r.resolveAttack(k),true);assert.equal(b.health,1);assert.equal(k.carrying,a.id);
});

test('held attack lunges forward; quick click misses without lunging',()=>{
  const {r,k,a}=setup();a.x=1200;k.input.attack=true;r.attack(k);advance(r,.35);
  assert.equal(k.attackState?.phase,'lunge');assert.ok(k.x>1000);
  advance(r,.5);assert.equal(a.health,1);assert.ok(k.cooldown>0);
  const q=setup();q.a.x=1800;q.r.attack(q.k);advance(q.r,.2);assert.equal(q.k.x,1000);assert.equal(q.k.recoveryKind,'miss');
});

test('hit sprint reaches 6.6m/s from walking input and actors cannot walk through bodies',()=>{
  const {r,k,a}=setup();a.health=1;a.hitBoost=1.8;a.input.x=1;a.moveSpeed=C.hitBoostSpeed;
  const x=a.x;r.move(a,.1);assert.ok(Math.abs((a.x-x)/.1/42.5-6.6)<1e-8);
  k.x=a.x+32;k.y=a.y;a.hitBoost=0;a.input.run=true;a.moveSpeed=170;
  r.move(a,1);assert.ok(k.x-a.x>=29.9);
});

test('moving cancels repair and healing rather than doing both at once',()=>{
  const {r,a,b}=setup(),g=r.map.generators[0];a.x=g.x;a.y=g.y;a.input.work=true;a.input.x=1;
  advance(r,.1);assert.equal(g.progress,0);
  a.input.x=0;b.health=1;b.x=a.x+40;b.y=a.y;a.input.x=1;
  advance(r,.1);assert.equal(b.healProgress,0);
});

test('window approach selects fast/medium/slow; pallets use their own 1.1/2 second times',()=>{
  const {r,a}=setup(),w={id:'v',x:1500,y:1500,w:80,h:20,axis:'y'};r.map.windows=[w];a.x=1540;a.y=1470;a.input.run=true;a.facing={x:0,y:1};a.runDistance=120;
  r.vault(a,w);assert.equal(a.vault.seconds,.5);a.vault=null;a.runDistance=0;r.vault(a,w);assert.equal(a.vault.seconds,.9);
  a.vault=null;a.input.run=false;r.vault(a,w);assert.equal(a.vault.seconds,1.5);
  const p={...w,id:'p',state:'dropped'};r.map.pallets=[p];a.vault=null;a.input.run=true;r.vault(a,p);assert.equal(a.vault.seconds,1.1);
  a.vault=null;a.input.run=false;r.vault(a,p);assert.equal(a.vault.seconds,2);
});

test('skills vary position, use repair/heal durations and give a three-second failure penalty',()=>{
  const first=skillProfile('repair',()=>0),last=skillProfile('repair',()=>1);
  assert.notEqual(first.good[0],last.good[0]);assert.equal(first.duration,1.1);assert.equal(skillProfile('heal').duration,1.2);
  assert.ok(Math.abs(first.good[1]-first.good[0]-.16)<1e-9);
  const {r,a}=setup(),g=r.map.generators[0];g.progress=30;a.x=g.x;a.y=g.y;r.beginSkill(a,'repair',g.id);
  r.interruptSkill(a);assert.equal(g.progress,30);assert.equal(a.skill,null);
  r.beginSkill(a,'repair',g.id);r.elapsed+=.3;r.interruptSkill(a);assert.equal(g.progress,21);assert.equal(a.cooldown,3);
});

test('healing great checks grant 3%, and toolbox check probability differs from regular repairs',()=>{
  const {r,a,b}=setup();a.x=b.x-40;a.y=b.y;b.health=1;b.healProgress=.5;r.random=()=>0;
  r.beginSkill(a,'heal',b.id);r.elapsed=a.skill.start+a.skill.duration*(a.skill.great[0]+.01);r.skill(a);
  assert.ok(Math.abs(b.healProgress-.53)<1e-9);
  a.nextSkill=0;r.random=()=>.2;r.rollSkill(a,'repair','g0',.1,.08);assert.equal(a.skill,null);
  a.nextSkill=0;r.rollSkill(a,'repair','g0',.1,.4);assert.equal(a.skill.type,'repair');
});

test('unhook separates 10-second haste/endurance/elusive; conspicuous actions retain haste',()=>{
  const {r,a}=setup();a.status='caged';r.unhook(a);assert.equal(a.immunity,10);assert.equal(a.haste,10);assert.equal(a.elusive,10);
  r.conspicuous(a);assert.equal(a.immunity,0);assert.equal(a.elusive,0);assert.equal(a.haste,10);
  r.map.generators.slice(0,r.generatorGoal).forEach(g=>g.progress=90);r.unhook(a);assert.equal(a.elusive,0);
});

test('camping range is 16m, scales with proximity and applies grace to every hooked player',()=>{
  assert.equal(campRate(16,0,0),0);assert.ok(campRate(3,0,0)>campRate(12,0,0));
  assert.equal(campRate(1,0,21),campRate(1,0,0)*4);
  const {r,k,a,b}=setup(),h=r.map.cages[0];a.status='caged';a.health=1;a.hookTime=70;a.hookStage=1;a.hookedAt=0;
  r.elapsed=30;k.x=h.x;k.y=h.y;b.status='carried';b.health=0;k.carrying=b.id;k.input.work=true;
  advance(r,1.6);assert.equal(b.status,'caged');assert.ok(a.hookedAt>=31.4);
});

test('wiggle fills automatically in 16 seconds, preserves progress on drop and adds 25%',()=>{
  const {r,k,a}=setup();k.carrying=a.id;a.status='carried';a.health=0;
  advance(r,8);assert.ok(a.wiggle>=7.99);r.dropCarried(k);assert.equal(a.status,'down');assert.ok(a.wiggle>=11.99);
  k.carrying=a.id;a.status='carried';advance(r,4.1);assert.equal(a.status,'alive');assert.equal(k.carrying,null);assert.ok(k.stun>0);
});

test('downed survivors can escape via gates and hatch; hatch closes after escape',()=>{
  const {r,a}=setup(),e=r.map.exits[0];a.status='down';a.health=0;a.x=e.x;a.y=e.y;e.open=true;
  advance(r,.1);assert.equal(a.status,'escaped');
  const q=setup();q.a.status='down';q.a.health=0;q.a.x=q.r.map.hatch.x;q.a.y=q.r.map.hatch.y;q.r.map.hatch.visible=true;q.r.map.hatch.open=true;
  advance(q.r,.1);assert.equal(q.a.status,'escaped');assert.equal(q.r.map.hatch.open,false);
});

test('key opens a closed hatch, dropped items retain charge and a map consumes charges',()=>{
  const {r,a}=setup(),h=r.map.hatch;h.visible=true;h.open=false;a.x=h.x;a.y=h.y;a.itemType='key';a.itemCharge=5;a.input.item=true;
  advance(r,2.6);assert.equal(a.status,'escaped');assert.equal(a.itemCharge,0);
  const q=setup();q.a.itemType='map';q.a.itemCharge=12;q.r.dropItem(q.a);assert.equal(q.r.map.items[0].charge,12);assert.equal(q.a.itemType,'none');
  q.a.input.work=true;advance(q.r,.1);assert.equal(q.a.itemType,'map');q.a.input.work=false;q.a.input.item=true;advance(q.r,.2);assert.ok(q.a.itemCharge<12);assert.equal(q.a.mapReading,true);
});

test('toolbox sabotages a hook temporarily and five totems can be cleansed',()=>{
  const {r,a}=setup(),h=r.map.cages[0];a.x=h.x;a.y=h.y;a.itemType='toolbox';a.itemCharge=32;a.input.item=true;
  advance(r,2.6);assert.ok(h.availableUntil>r.elapsed);assert.equal(a.itemCharge,26);
  a.input.item=false;a.input.work=true;r.map.totems=[{id:'t0',x:a.x,y:a.y,cleansed:false}];advance(r,14.1);assert.equal(r.map.totems[0].cleansed,true);
});

test('locker entry is timed, damage interrupts it and AFK crows reveal prolonged hiding',()=>{
  const {r,a}=setup();r.map.cabinets=[{id:'l',x:a.x,y:a.y,occupant:null}];r.interact(a,.1,true);assert.equal(a.hidden,null);assert.ok(a.lockerTransition);
  r.damage(a);assert.equal(a.lockerTransition,null);assert.equal(r.map.cabinets[0].occupant,null);
  r.interact(a,.1,true);advance(r,1.3);assert.equal(a.hidden,'l');advance(r,120.1);assert.equal(a.crows,3);assert.ok(r.noises.some(n=>n.text==='까마귀'));
});

test('disconnected survivor is replaced by a navigating bot and end trial eligibility is enforced',()=>{
  const {r,k,a,b}=setup();a.connected=false;a.disconnectTime=30;const g=r.map.generators[0];g.x=a.x+160;g.y=a.y;
  advance(r,5);assert.equal(a.bot,true);assert.ok(g.progress>0);
  assert.throws(()=>r.endTrial(k.id));b.bot=true;r.endTrial(k.id);assert.equal(a.status,'out');assert.equal(b.status,'out');
});
