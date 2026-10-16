import test from 'node:test';
import assert from 'node:assert/strict';
import {Room,terrorCue} from '../game.js';
import {CONFIG as C} from '../config.js';
import {teamActivity} from '../team-activity.js';
import {diminishingReturns} from '../rules.js';
function setup(){const r=new Room('ALIGN','rules'),k=r.addPlayer('K'),a=r.addPlayer('A'),b=r.addPlayer('B');r.start(k.id);for(const key of ['walls','windows','pallets','cabinets','cages','totems','chests','items','generators','exits'])r.map[key]=[];k.x=3000;k.y=3000;a.x=1000;a.y=1000;b.x=2000;b.y=2000;return {r,k,a,b};}
const advance=(r,t)=>{for(let i=0,n=Math.ceil(t*30);i<n;i++)r.tick(t/n);};
test('a chased survivor cannot block teammates by vaulting the same window three times',()=>{
 const {r,k,a,b}=setup(),w={id:'w',x:1050,y:950,w:24,h:100,axis:'x'};r.map.windows=[w];k.chaseTarget=a.id;
 for(let i=0;i<3;i++){a.x=1020;a.y=1000;a.vault=null;r.vault(a,w);}
 a.vault=null;r.vault(a,w);assert.equal(a.vault,null);assert.ok(a.vaultCounts.w.blockedUntil>r.elapsed);
 b.x=1020;b.y=1000;r.vault(b,w);assert.ok(b.vault);assert.equal(w.blockedUntil,undefined);
});
test('successful wiggle runs at 1 charge per second; missing all checks never escapes',()=>{
 const {r,k,a}=setup();r.carry(k,a);advance(r,17);assert.equal(a.wiggle,0);assert.equal(a.status,'carried');
 const begin=r.elapsed;
 for(let i=0;i<510&&a.status==='carried';i++){const s=a.skill,t=s?(r.elapsed+1/30-s.start)/s.duration:-1;a.input.space=t>=.025&&t<.1;r.tick(1/30);}
 assert.equal(a.status,'alive');assert.ok(r.elapsed-begin>=16);assert.ok(r.elapsed-begin<17);
});
test('map/key channel once per press and aura effects persist after release',()=>{
 const {r,a}=setup();a.itemType='map';a.itemCharge=5;a.input.item=true;advance(r,C.itemChannelSeconds+.1);assert.equal(a.itemCharge,4);assert.ok(a.mapReading);
 advance(r,1);assert.equal(a.itemCharge,4);assert.equal(r.beacons.length,0);
 a.input.item=false;r.tick(.05);assert.ok(a.mapReading);a.input.item=true;r.tick(.05);assert.equal(r.beacons.length,1);assert.equal(a.itemCharge,4);
 a.input.item=false;r.tick(.05);a.itemType='key';a.input.item=true;advance(r,C.itemChannelSeconds+.1);assert.equal(a.itemCharge,3);assert.ok(a.keyReading);a.input.item=false;r.tick(.05);assert.ok(a.keyReading);
});
test('key unlock costs one use, permits exactly one other survivor to rummage',()=>{
 const {r,a,b}=setup(),ch={id:'c',x:a.x,y:a.y,item:'toolbox',opened:false};r.map.chests=[ch];a.itemType='key';a.itemCharge=5;a.input.item=true;advance(r,2.1);assert.equal(a.itemCharge,4);assert.ok(ch.opened);assert.equal(ch.keyOwner,a.id);
 a.input.item=false;a.input.work=true;advance(r,8.1);assert.equal(ch.rummaged,false);
 b.x=ch.x;b.y=ch.y;b.input.work=true;a.input.work=false;advance(r,8.1);assert.equal(ch.rummaged,true);assert.equal(b.itemType,'toolbox');
});
test('team activity derives actual work and clears instantly without coordinates or target IDs',()=>{
 const {r,k,a}=setup(),g={id:'g',x:a.x,y:a.y,progress:45,workers:[a.id]};r.map.generators=[g];k.chaseTarget=a.id;
 assert.deepEqual(teamActivity(r,a),{type:'repair',progress:.5,chased:true});g.workers=[];a.moveSpeed=0;k.chaseTarget=null;assert.deepEqual(teamActivity(r,a),{type:'idle',progress:null,chased:false});
 a.status='down';a.recovery=.6;assert.equal(teamActivity(r,a).type,'recover');a.status='out';assert.equal(teamActivity(r,a),null);assert.equal(teamActivity(r,k),null);
});
test('healthy solo cannot surrender without bots; diminishing returns and nondirectional terror follow baseline',()=>{
 const {r,k,a,b}=setup();b.status='out';assert.throws(()=>r.endTrial(a.id));b.status='alive';b.bot=true;r.endTrial(a.id);assert.equal(a.status,'out');
 assert.equal(diminishingReturns([.1,.2]),.25);assert.deepEqual(terrorCue('playing',{...b,x:0,y:0},{...k,x:100,y:0}),{strength:1-100/C.terrorRadius,direction:null});
});
test('finishing Mori also supports one dying survivor plus one on hook struggle stage',()=>{
 const {r,k,a,b}=setup();a.status='down';a.health=0;b.status='caged';b.hookStage=2;b.hookTime=70;b.hookedAt=r.elapsed;k.x=a.x+40;k.y=a.y;k.input.self=true;
 r.tick(.1);assert.equal(b.status,'out');assert.equal(a.status,'down');advance(r,3);assert.equal(a.status,'out');assert.equal(r.phase,'finished');
 const q=setup();q.a.status='down';q.a.health=0;q.b.status='caged';q.b.hookStage=1;q.b.hookTime=70;q.k.x=q.a.x+40;q.k.y=q.a.y;q.k.input.self=true;q.r.tick(.1);assert.equal(q.b.status,'caged');assert.equal(q.k.task,null);
});
