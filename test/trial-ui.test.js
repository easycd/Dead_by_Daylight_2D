import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../game.js';
import {CONFIG as C} from '../config.js';
import {sendIntent,trialDetails} from '../trial-ui.js';
import {actionTempo,effectList,perkState,hookProgress,visibleActivities,healthState,healthLabel} from '../public/hud-model.js';
import {placeEdgeMarker} from '../public/marker-layout.js';
function fixture(){const room=new Room('HUD123','hud'),k=room.addPlayer('K'),a=room.addPlayer('A'),b=room.addPlayer('B');room.start(k.id);return {room,k,a,b};}
test('trial details expose allied loadouts only; killer reveal persists and resets with a new trial',()=>{
 const {room,k,a,b}=fixture();k.perks=['tracker'];a.perks=['engineer'];b.itemType='toolbox';
 let details=trialDetails(room,a);assert.equal(details.killerKnown,false);assert.equal(details.players.find(p=>p.id===k.id).loadout,null);assert.deepEqual(details.players.find(p=>p.id===a.id).loadout.perks,['engineer']);
 assert.equal(trialDetails(room,k).players.find(p=>p.id===a.id).loadout,null);
 a.health=1;assert.equal(trialDetails(room,b).killerKnown,true);a.health=2;assert.equal(trialDetails(room,a).killerKnown,true);
 room.phase='finished';assert.deepEqual(trialDetails(room,a).players.find(p=>p.id===k.id).loadout.perks,['tracker']);room.phase='lobby';room.start(k.id);assert.equal(trialDetails(room,a).killerKnown,false);
});
test('intent messages validate role, life state, whitelist, anti-spam, expiry and new trial cleanup',()=>{
 const {room,k,a}=fixture();assert.throws(()=>sendIntent(room,k,0,1000));assert.throws(()=>sendIntent(room,a,'arbitrary',1000));
 const message=sendIntent(room,a,2,1000);assert.equal(message.text,'치료가 필요해요');assert.throws(()=>sendIntent(room,a,0,1200));assert.equal(a.intentCooldown,2000);
 room.elapsed=6;sendIntent(room,a,0,8000);assert.equal(room.intents.length,1);a.status='out';assert.throws(()=>sendIntent(room,a,0,16000));room.phase='lobby';room.start(k.id);assert.deepEqual(room.intents,[]);assert.equal(a.lastIntentAt,null);
});
test('perk cooldown and independent timed effects follow actual player fields',()=>{
 const {a}=fixture();a.exhaustion=12;a.immunity=6;a.deepWound=10;a.haste=6;a.sprintBoost=0;
 assert.equal(perkState('sprinter',a).mode,'cooldown');assert.equal(perkState('sprinter',a).remaining,12);
 const effects=effectList(a,C);assert.ok(effects.some(e=>e.id==='endurance'&&e.buff));assert.ok(effects.some(e=>e.id==='wound'&&!e.buff));assert.equal(effects.some(e=>e.id==='sprint'),false);
 assert.deepEqual(hookProgress({...a,hookTime:35,resolve:1.2,bleed:120},C),{sacrifice:.5,resolve:1,bleed:.5});
 assert.equal(actionTempo(.67),'slow');assert.equal(actionTempo(1.7),'fast');assert.equal(actionTempo(1),'normal');assert.equal(visibleActivities({teamActivity:{type:'locker'}}),null);
});
test('repair HUD reports real combined rate; self-heal displays its slower base rate',()=>{
 const {room,k,a,b}=fixture();room.map.walls=[];room.map.windows=[];room.map.pallets=[];room.map.cages=[];room.map.chests=[];room.map.totems=[];room.map.cabinets=[];const g=room.map.generators[0];a.x=g.x;a.y=g.y;b.x=g.x+40;b.y=g.y;k.x=4000;k.y=4000;a.input.work=b.input.work=true;a.nextSkill=b.nextSkill=1000;room.tick(.1);assert.ok(Math.abs(a.action.speed-1.7)<.0001);
 a.input.work=b.input.work=false;a.health=1;a.input.item=true;a.itemType='medkit';a.itemCharge=24;room.tick(.1);assert.ok(Math.abs(a.action.speed-16/24)<.0001);
});
test('offscreen objectives route around team, chat, perk and action overlays without stacking',()=>{
 const W=375,H=812,reserved=[{left:16,right:190,top:450,bottom:620},{left:190,right:363,top:90,bottom:250},{left:205,right:310,top:620,bottom:740},{left:20,right:355,top:770,bottom:810}],occupied=[];
 for(let i=0;i<14;i++){const p=placeEdgeMarker({x:327,y:650,edge:'right',angle:1,offscreen:true},W,H,reserved,occupied);assert.ok(!reserved.some(r=>p.x+22>r.left&&p.x-22<r.right&&p.y+22>r.top&&p.y-22<r.bottom));assert.ok(!occupied.some(o=>Math.hypot(p.x-o.x,p.y-o.y)<34));assert.equal(p.angle,1);occupied.push(p);}
});
test('HUD preserves sacrifice, kill, bleed-out and abandon outcomes and clears them on restart',()=>{
 for(const [reason,kind,label]of [['갈고리 희생','sacrificed','희생'],['살인마 처형','killed','살해됨'],['출혈로 탈락','dead','사망'],['경기 포기','abandoned','경기 포기']]){
  const {room,a,k}=fixture();room.eliminate(a,reason);assert.equal(healthState(a),kind);assert.equal(healthLabel(a),label);room.phase='lobby';room.start(k.id);assert.equal(a.deathKind,null);
 }
});
