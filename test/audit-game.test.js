import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../game.js';

function setup(){
  const r=new Room('AUDIT','audit'),k=r.addPlayer('killer'),a=r.addPlayer('alice'),b=r.addPlayer('bob');r.start(k.id);
  for(const key of ['walls','windows','pallets','cabinets','totems','chests','items'])r.map[key]=[];
  k.x=1200;k.y=1000;a.x=1000;a.y=1000;b.x=3000;b.y=3000;
  for(const p of r.players.values())p.nextSkill=10000;
  return {r,k,a,b};
}

test('flashlight works while walking and uses mouse aim instead of movement facing',()=>{
  const {r,k,a}=setup();a.itemType='flashlight';a.itemCharge=8;a.input.item=true;a.input.x=1;a.input.aimX=1;a.input.aimY=0;k.input.aimX=-1;
  r.tick(.1);assert.ok(a.x>1000);assert.equal(a.flashlight,true);assert.ok(a.itemCharge<8);assert.ok(k.blindProgress>0);assert.equal(a.facing.x,1);
});

test('a moving survivor can read a map or use a flashlight without being forced to mend',()=>{
  const {r,a}=setup();a.input.x=1;a.input.item=true;a.deepWound=10;a.itemType='map';a.itemCharge=5;
  r.interact(a,.1,false);assert.equal(a.task.key,'read-map');assert.equal(a.itemCharge,5);assert.equal(a.deepWound,10);
  a.itemType='flashlight';r.interact(a,.1,false);assert.equal(a.flashlight,true);assert.equal(a.task,null);
  a.input.item=false;a.input.work=true;r.interact(a,.1,false);assert.equal(a.task.key,'mend');
});

test('endurance hits interrupt healing and locker entry just like normal hits',()=>{
  const {r,a}=setup();a.health=1;a.immunity=5;a.healProgress=.8;a.mend=.5;a.skill={type:'heal'};a.task={key:'mend',progress:1};a.action={label:'healing'};a.lockerTransition={id:'l',remaining:1,type:'enter'};r.map.cabinets=[{id:'l',occupant:a.id}];
  assert.equal(r.damage(a),true);assert.equal(a.health,1);assert.equal(a.deepWound,20);
  for(const key of ['skill','task','action','lockerTransition'])assert.equal(a[key],null);
  assert.equal(a.healProgress,0);assert.equal(a.mend,0);assert.equal(r.map.cabinets[0].occupant,null);
});

test('capture clears previous actions and transitions while preserving carried wiggle progress',()=>{
  const {r,k,a}=setup();a.hidden='l';a.lockerTransition={id:'l',type:'exit',remaining:.5};a.skill={type:'heal'};a.task={key:'mend'};a.healProgress=.8;a.wiggle=4;r.map.cabinets=[{id:'l',occupant:a.id}];
  r.carry(k,a);assert.equal(k.carrying,a.id);assert.equal(a.status,'carried');assert.equal(a.wiggle,4);assert.equal(a.health,0);
  for(const key of ['hidden','lockerTransition','vault','task','skill'])assert.equal(a[key],null);
  assert.equal(a.healProgress,0);assert.equal(r.map.cabinets[0].occupant,null);
});

test('rescues and locker exits choose a free side instead of teleporting into a wall',()=>{
  const {r,a}=setup();a.x=2000;a.y=2000;a.status='caged';r.map.walls=[{x:2020,y:1970,w:60,h:60}];
  r.unhook(a);assert.equal(a.x,1955);assert.equal(r.free(a.x,a.y),true);
  const locker={id:'l',x:2000,y:2000,occupant:a.id};r.map.cabinets=[locker];a.hidden='l';a.lockerTransition={id:'l',remaining:.1,type:'exit'};
  r.updateAmbient(a,.2);assert.equal(a.hidden,null);assert.equal(a.x,1964);assert.equal(r.free(a.x,a.y),true);
  r.map.windows=[{x:a.x-10,y:a.y-10,w:20,h:20}];assert.equal(r.free(a.x,a.y),false);
});

test('bot finishes the gap after an empty grid route, mends wounds, and uses its medkit',()=>{
  const {r,k,a}=setup();k.x=3000;k.y=1000;r.map.generators=[{id:'g',x:1055,y:1000,progress:0}];r.bots.route=()=>[];
  r.bots.frame(a);assert.ok(a.input.x>0);
  a.deepWound=10;r.bots.frame(a);assert.equal(a.input.work,true);assert.equal(a.input.x,0);
  a.deepWound=0;a.health=1;r.bots.frame(a);assert.equal(a.input.item,true);assert.equal(a.input.x,0);
});

test('downed bot crawls to an available hatch and reset removes old match data',()=>{
  const {r,k,a}=setup();a.status='down';a.health=0;r.map.hatch={x:a.x+55,y:a.y,visible:true,open:true};r.bots.route=()=>[];
  r.bots.frame(a);assert.ok(a.input.x>0);
  r.phase='finished';r.elapsed=40;r.events=[{}];r.traces=[{}];r.noises=[{}];
  assert.throws(()=>r.reset(a.id),/방장/);r.reset(k.id);assert.equal(r.elapsed,0);
  for(const key of ['events','traces','noises'])assert.deepEqual(r[key],[]);
});
