import test from 'node:test';
import assert from 'node:assert/strict';
import {Room,terrorCue} from '../game.js';
import {CONFIG as C} from '../config.js';
import {createFeedbackPresentation} from '../public/feedback.js';

const survivor={id:'s',role:'survivor',status:'alive',x:0,y:0};
const killer={role:'killer',status:'alive',x:0,y:0};
const state=()=>({code:'TEST',phase:'playing',elapsed:1,viewId:'s',players:[{...survivor}],heartbeat:.8,heartbeatDirection:0,hit:{sequence:0,time:null}});

test('terror range is independent of vision and only gives eight directions inside 16m',()=>{
  for(const [meters,strength,direction] of [[33,0,null],[32,0,null],[24,.25,null],[16,.5,null],[12,.625,0],[8,.75,0],[0,1,0]]){
    assert.deepEqual(terrorCue('playing',survivor,{...killer,x:meters*C.pixelsPerMeter}),{strength,direction});
  }
  assert.equal(terrorCue('playing',survivor,{...killer,x:500,y:200}).direction,0);
  assert.equal(terrorCue('playing',survivor,{...killer,x:200,y:500}).direction,2);
  for(const [phase,view,k] of [['lobby',survivor,killer],['finished',survivor,killer],['playing',killer,killer],['playing',{...survivor,status:'out'},killer],['playing',survivor,{...killer,status:'out'}],['playing',survivor,null]])assert.equal(terrorCue(phase,view,k).strength,0);
});

test('only accepted damage records hits, including endurance, with no private hit fields in player snapshots',()=>{
  const r=new Room('TEST','test'),p=r.addPlayer('s','survivor');
  assert.equal(r.damage(p),true);assert.equal(p.hitSequence,1);assert.equal(p.lastHitAt,0);
  p.immunity=2;r.elapsed=1;assert.equal(r.damage(p),true);assert.equal(p.health,1);assert.equal(p.hitSequence,2);
  assert.equal(r.damage(p),true);assert.equal(p.status,'down');assert.equal(p.hitSequence,3);
  assert.equal(r.damage(p),false);assert.equal(p.hitSequence,3);
  assert.equal('hitSequence' in r.snapshot().players[0],false);
});

test('paired pulse uses one clock, fades outside radius, and clears when leaving or watching killer',()=>{
  const p=createFeedbackPresentation(),s=state();p.frame(s,1000);
  assert.equal(p.frame(s,1016).beat,1);
  assert.ok(p.frame(s,1096).pulse>0);assert.equal(p.frame(s,1200).beat,2);
  assert.ok(p.frame(s,1280).pulse>.4);
  const before=p.frame(s,1300).strength;s.heartbeat=0;
  const after=p.frame(s,1400).strength;assert.ok(after>0&&after<before);
  for(let t=1500;t<4000;t+=100)p.frame(s,t);
  assert.equal(p.frame(s,4000).strength,0);
  s.players[0].role='killer';assert.equal(p.frame(s,4100).strength,0);
  assert.equal(p.frame(null,4200).hit,0);
});

test('hit overlay restarts without stacking, ignores state changes, reconnect and spectator switches',()=>{
  const p=createFeedbackPresentation(),s=state();p.frame(s,1000);
  s.players[0].health=1;assert.equal(p.frame(s,1010).hit,0);
  s.hit={sequence:1,time:1};p.frame(s,1020);
  assert.ok(p.frame(s,1080).hit>.2);
  s.hit.sequence=2;p.frame(s,1100);assert.ok(p.frame(s,1150).hit<=.25);
  assert.equal(p.frame(s,1650).hit,0);
  p.reset();assert.equal(p.frame(s,1700).hit,0);
  s.viewId='other';s.players=[{...survivor,id:'other'}];s.hit.sequence=10;assert.equal(p.frame(s,1800).hit,0);
  s.hit.sequence++;p.frame(s,1810,true);const reduced=p.frame(s,1870,true);
  assert.equal(reduced.pulse,0);assert.ok(reduced.hit>0);
  assert.equal(p.frame({...s,phase:'finished'},1900).hit,0);
});
