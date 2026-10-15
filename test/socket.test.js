import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { io as connect } from 'socket.io-client';
import { createStandaloneServer } from '../server.js';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(predicate){const deadline=Date.now()+2000;while(!predicate()){if(Date.now()>deadline)throw new Error('Expected socket state was not received');await sleep(20);}}
const emitRaw=(s,event,data={})=>new Promise((resolve,reject)=>s.timeout(2000).emit(event,data,(e,r)=>e?reject(e):resolve(r)));
// Combat fixtures explicitly select teams after entering the new waiting area.
async function emit(s,event,data={}){const reply=await emitRaw(s,event,data);if(reply?.ok&&['create','join'].includes(event)){await sleep(110);await emitRaw(s,'role',{role:event==='create'?'killer':'survivor'});await sleep(110);}return reply;}
async function fixture(t,options={}){const server=createStandaloneServer({allowGuest:true,...options});await new Promise(resolve=>server.http.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.http.address().port}`,clients=[];
  t.after(async()=>{for(const c of clients)c.disconnect();await server.close();});
  async function client(token=randomUUID()){const s=connect(`${url}/nightfall`,{auth:{token},forceNew:true,transports:['websocket']});s.latest=null;s.identity=null;s.on('state',v=>{s.latest=v?{...v,map:{...s.latest?.map,...v.map}}:null;});s.on('identity',id=>s.identity=id);clients.push(s);await new Promise((resolve,reject)=>{s.once('connect',resolve);s.once('connect_error',reject);});return s;}
  return {server,url,client};
}

test('feedback sends masked proximity and only the watched survivor hit record',async t=>{
  const {server,url,client}=await fixture(t),k=await client(),a=await client(),b=await client();
  assert.equal((await fetch(`${url}/dbd/feedback.js`)).status,200);
  await emit(k,'create',{name:'feedback',nickname:'K',maxPlayers:3});const code=k.latest.code;
  await emit(a,'join',{code,nickname:'A'});await emit(b,'join',{code,nickname:'B'});await emit(k,'start');
  const room=server.game.rooms.get(code),killer=room.players.get(k.identity),p=room.players.get(a.identity),watcher=room.players.get(b.identity);
  killer.x=1000;killer.y=1300;p.x=1550;p.y=1300;
  room.map.walls.push({x:1200,y:1200,w:30,h:200});
  await waitFor(()=>a.latest.heartbeatDirection===4);
  assert.equal(a.latest.players.find(q=>q.id===killer.id).x,null);
  assert.equal(a.latest.heartbeat,1-550/1360);assert.equal(k.latest.heartbeat,0);assert.equal(k.latest.hit,null);
  room.damage(p);await waitFor(()=>a.latest.hit?.sequence===1);
  assert.equal(a.latest.hit.time,p.lastHitAt);assert.equal(a.latest.players.some(q=>'hitSequence' in q),false);
  watcher.status='out';watcher.spectateId=p.id;
  await waitFor(()=>b.latest.viewId===p.id);assert.deepEqual(b.latest.hit,a.latest.hit);
  watcher.spectateId=killer.id;await waitFor(()=>b.latest.viewId===killer.id);assert.equal(b.latest.heartbeat,0);assert.equal(b.latest.hit,null);
  killer.status='out';await waitFor(()=>a.latest.heartbeat===0);assert.equal(a.latest.heartbeatDirection,null);
});

test('private positions and locker IDs stay hidden; refresh preserves the connection and stale input expires',async t=>{
  const {server,client}=await fixture(t),k=await client(),a=await client(),b=await client();
  await emit(k,'create',{name:'privacy',nickname:'K',maxPlayers:3});const code=k.latest.code;
  await emit(a,'join',{code,nickname:'A'});await emit(b,'join',{code,nickname:'B'});await emit(k,'start');
  const room=server.game.rooms.get(code),p=room.players.get(a.identity),killer=room.players.get(k.identity),l=room.map.cabinets[0];
  l.x=1500;l.y=1500;l.occupant=p.id;p.x=l.x;p.y=l.y;p.hidden=l.id;p.afkOrigin={x:p.x,y:p.y};p.lockerTransition={id:l.id,type:'exit',remaining:20};p.palletDrop={id:'secret-pallet',until:room.elapsed+30};killer.x=1000;killer.y=1500;
  await waitFor(()=>a.latest.players.find(q=>q.id===a.identity)?.hidden===l.id);
  const masked=k.latest.players.find(q=>q.id===a.identity);assert.equal(masked.x,null);assert.equal(masked.hidden,null);assert.equal(masked.palletDrop,null);
  assert.equal('afkOrigin' in masked,false);assert.equal('lockerTransition' in masked,false);assert.equal(k.latest.map.hatch.x,null);assert.equal('item' in k.latest.map.chests[0],false);
  await sleep(110);const socketId=a.id;let disconnected=false;a.once('disconnect',()=>disconnected=true);
  assert.equal((await emitRaw(a,'directory:refresh')).ok,true);assert.equal(a.id,socketId);assert.equal(disconnected,false);
  p.input={x:1,y:0,aimX:1,aimY:0,work:true};p.pendingPress.add('attack');p.lastInputAt=Date.now()-3000;
  await waitFor(()=>p.lastInputAt===null);assert.equal(p.input.x,0);assert.equal(p.pendingPress.size,0);
});

test('debug nickname cannot grant full-map access when local debugging is disabled',async t=>{
  const {client}=await fixture(t,{allowLocalDebug:false}),admin=await client();
  await emit(admin,'create',{name:'production',nickname:'admin',maxPlayers:3});
  assert.equal(admin.latest.debug.enabled,false);assert.equal((await emitRaw(admin,'debug-view',{fullMap:true})).ok,false);
});

test('normal shutdown permits client reconnection and can be closed more than once',async t=>{
  const {server,client}=await fixture(t),s=await client();
  const disconnected=new Promise(resolve=>s.once('disconnect',resolve));
  await server.close();const reason=await disconnected;
  assert.notEqual(reason,'io server disconnect');assert.equal(s.active,true);s.disconnect();await server.close();
});
test('real sockets create/join, validate roles, move, isolate rooms, reconnect and serve assets',async t=>{
  const {server,url,client}=await fixture(t),k=await client(),aToken=randomUUID(),a=await client(aToken),b=await client(),other=await client();
  assert.equal((await fetch(`${url}/dbd/api/health`)).status,200);assert.match(await (await fetch(`${url}/dbd/`)).text(),/데바데2D/);assert.equal((await fetch(`${url}/dbd/no-file`)).status,404);assert.equal((await fetch(`${url}/dbd/skill-check.js`)).status,200);
  assert.equal((await emit(k,'create',{name:'room',nickname:'K',maxPlayers:6})).ok,true);await sleep(20);const code=k.latest.code;
  assert.equal((await emit(a,'join',{code,nickname:'A'})).ok,true);assert.equal((await emit(b,'join',{code,nickname:'B'})).ok,true);
  assert.equal((await emit(other,'create',{name:'other',nickname:'O',maxPlayers:3})).ok,true);await sleep(120);
  assert.equal((await emit(a,'start')).ok,false);assert.equal((await emit(k,'start')).ok,true);await sleep(120);
  assert.equal(a.latest.phase,'playing');assert.equal(other.latest.phase,'lobby');const room=server.game.rooms.get(code),p=room.players.get(a.identity),initial=p.x;
  a.emit('input',{x:1,y:0,space:false});await sleep(180);a.emit('input',{x:0,y:0,space:false});assert.ok(p.x>initial);
  const id=a.identity;a.disconnect();await sleep(40);assert.equal(p.connected,false);const again=await client(aToken);await sleep(120);assert.equal(again.identity,id);assert.equal(p.connected,true);assert.equal(again.latest.phase,'playing');
  assert.equal((await emit(again,'leave')).ok,true);await sleep(120);assert.equal(again.latest,null);assert.equal(room.players.get(id).bot,true);
});
test('circular vision ignores wall shadows, masks distance and lockers; spectators follow vision',async t=>{
  const {server,client}=await fixture(t),k=await client(),a=await client(),b=await client();await emit(k,'create',{name:'fog',nickname:'K',maxPlayers:3});await sleep(30);const code=k.latest.code;await emit(a,'join',{code,nickname:'A'});await emit(b,'join',{code,nickname:'B'});await sleep(120);await emit(k,'start');await sleep(120);
  const room=server.game.rooms.get(code),killer=room.players.get(k.identity),survivor=room.players.get(a.identity);room.map.walls=[];killer.x=1000;killer.y=1300;survivor.x=2800;survivor.y=2200;await sleep(150);assert.equal(k.latest.players.find(p=>p.id===a.identity).x,null);
  survivor.x=1100;survivor.y=1300;await sleep(150);assert.equal(k.latest.players.find(p=>p.id===a.identity).x,1100);
  const bush=room.map.bushes[0];survivor.x=bush.x+50;survivor.y=bush.y+50;killer.x=survivor.x-160;killer.y=survivor.y;await sleep(150);assert.notEqual(k.latest.players.find(p=>p.id===a.identity).x,null);room.map.walls.push({x:survivor.x-80,y:survivor.y-50,w:15,h:100});await sleep(150);assert.notEqual(k.latest.players.find(p=>p.id===a.identity).x,null);room.map.walls=[];killer.x=survivor.x-50;await sleep(150);assert.notEqual(k.latest.players.find(p=>p.id===a.identity).x,null);
  survivor.hidden=room.map.cabinets[0].id;await sleep(150);assert.equal(k.latest.players.find(p=>p.id===a.identity).x,null);assert.equal(k.latest.map.cabinets[0].occupant,undefined);
  survivor.hidden=null;survivor.status='out';survivor.spectateId=killer.id;await sleep(150);assert.equal(a.latest.viewId,killer.id);assert.notEqual(a.latest.players.find(p=>p.id===killer.id).x,null);
});
test('admin can inspect the lobby and full map; regular users retain fog and cannot enable debug',async t=>{
  const {server,url,client}=await fixture(t),adminToken=randomUUID(),admin=await client(adminToken),a=await client(),b=await client();
  assert.equal((await fetch(`${url}/dbd/debug.js`)).status,200);assert.equal((await fetch(`${url}/dbd/debug.css`)).status,200);
  await emit(admin,'create',{name:'debug',nickname:'admin',maxPlayers:3});await sleep(30);const code=admin.latest.code;
  await emit(a,'join',{code,nickname:'normal'});await emit(b,'join',{code,nickname:'second'});await sleep(120);
  assert.equal(admin.latest.debug.enabled,true);assert.equal(a.latest.debug.enabled,false);
  assert.equal((await emit(a,'debug-view',{fullMap:true})).ok,false);
  assert.equal((await emit(admin,'debug-view',{fullMap:'true'})).ok,false);await sleep(120);
  assert.equal((await emit(admin,'debug-view',{fullMap:true})).ok,true);await sleep(30);
  assert.equal(admin.latest.debug.fullMap,true);assert.equal(admin.latest.phase,'lobby');assert.ok(admin.latest.map.walls.length>60);
  await sleep(120);await emit(admin,'start');await sleep(120);
  const room=server.game.rooms.get(code),p=room.players.get(a.identity),other=room.players.get(b.identity),h=room.map.cabinets[0];
  h.x=1000;h.y=1000;p.x=h.x;p.y=h.y;p.hidden=h.id;h.occupant=p.id;other.x=4200;other.y=3900;
  await sleep(150);
  assert.equal(admin.latest.players.find(q=>q.id===p.id).x,h.x);assert.equal(admin.latest.map.cabinets[0].occupant,p.id);
  assert.equal(admin.latest.players.find(q=>q.id===other.id).x,4200);assert.equal(a.latest.players.find(q=>q.id===other.id).x,null);assert.equal(a.latest.map.cabinets[0].occupant,undefined);
  assert.equal((await emit(admin,'debug-view',{fullMap:false})).ok,true);await sleep(120);
  assert.equal(admin.latest.players.find(q=>q.id===p.id).x,null);assert.equal(admin.latest.map.cabinets[0].occupant,undefined);
  await emit(admin,'debug-view',{fullMap:true});await sleep(120);admin.disconnect();await sleep(40);const again=await client(adminToken);await sleep(120);assert.equal(again.latest.debug.fullMap,true);
  const ping=await new Promise((resolve,reject)=>again.timeout(2000).emit('debug-ping',(err,r)=>err?reject(err):resolve(r)));assert.equal(ping.ok,true);
  await emit(again,'leave');await sleep(120);await emit(again,'create',{name:'ordinary',nickname:'regular',maxPlayers:3});await sleep(30);assert.equal(again.latest.debug.enabled,false);assert.equal(again.latest.debug.fullMap,false);
});
test('chat separates survivors and dead players, denies killers and forged channels, resets per match',async t=>{
  const {server,client}=await fixture(t),k=await client(),a=await client(),b=await client(),d=await client(),e=await client(),outside=await client();
  await emit(k,'create',{name:'chat',nickname:'admin',maxPlayers:6});await sleep(30);const code=k.latest.code;
  for(const [s,nickname]of [[a,'A'],[b,'B'],[d,'D'],[e,'E']])await emit(s,'join',{code,nickname});
  await emit(outside,'create',{name:'other',nickname:'other',maxPlayers:3});await sleep(120);
  assert.equal((await emit(a,'chat',{text:'lobby'})).ok,false);await emit(k,'start');await sleep(120);
  assert.equal((await emit(k,'chat',{text:'killer'})).ok,false);assert.equal(k.latest.chat.channel,null);
  assert.equal((await emit(a,'chat',{text:'생존 메시지',channel:'dead',name:'fake'})).ok,true);await sleep(120);
  assert.equal(b.latest.chat.messages[0].name,'A');assert.equal(b.latest.chat.messages[0].text,'생존 메시지');assert.deepEqual(k.latest.chat.messages,[]);assert.deepEqual(outside.latest.chat.messages,[]);
  assert.match((await emit(a,'chat',{text:'too fast'})).error,/빠르게/);
  const room=server.game.rooms.get(code);room.players.get(d.identity).status='out';room.players.get(e.identity).status='out';await sleep(150);
  assert.equal(d.latest.chat.channel,'dead');assert.deepEqual(d.latest.chat.messages,[]);
  assert.equal((await emit(d,'chat',{text:'사망 메시지',channel:'survivors'})).ok,true);await sleep(120);
  assert.equal(e.latest.chat.messages[0].text,'사망 메시지');assert.equal(a.latest.chat.messages.length,1);assert.deepEqual(k.latest.chat.messages,[]);
  await emit(k,'debug-view',{fullMap:true});await sleep(120);assert.deepEqual(k.latest.chat.messages,[]);
  room.players.get(b.identity).status='escaped';await sleep(150);assert.equal(b.latest.chat.channel,'survivors');assert.equal(b.latest.chat.messages[0].text,'생존 메시지');
  assert.equal((await emit(b,'chat',{text:'x'.repeat(201)})).ok,false);await sleep(120);assert.equal((await emit(b,'chat',{text:'<img src=x onerror=alert(1)>'})).ok,true);await sleep(120);
  room.players.get(a.identity).status='out';await sleep(150);assert.equal(a.latest.chat.channel,'dead');assert.equal(a.latest.chat.messages[0].text,'사망 메시지');assert.equal(a.latest.chat.messages.length,1);
  await emit(k,'reset');await sleep(120);assert.equal(a.latest.chat.channel,null);await emit(k,'start');await sleep(120);assert.deepEqual(a.latest.chat.messages,[]);assert.equal(a.latest.chat.channel,'survivors');
});

test('a short network click attacks once, validated inputs and private skill checks',async t=>{
 const {server,client}=await fixture(t),k=await client(),a=await client(),b=await client();await emit(k,'create',{name:'combat',nickname:'K',maxPlayers:5});await sleep(30);const code=k.latest.code;await emit(a,'join',{code,nickname:'A'});await emit(b,'join',{code,nickname:'B'});await sleep(120);
 assert.equal((await emit(a,'loadout',{item:'medkit',perks:['breaker']})).ok,false);await sleep(120);assert.equal((await emit(a,'loadout',{item:'toolbox',perks:['engineer']})).ok,true);await emit(k,'start');await sleep(120);
 const room=server.game.rooms.get(code),kp=room.players.get(k.identity),ap=room.players.get(a.identity);kp.x=1600;kp.y=1500;ap.x=1660;ap.y=1500;
 k.emit('input',{attack:true,aimX:100,aimY:0});k.emit('input',{attack:false,aimX:100,aimY:0});await sleep(350);assert.equal(ap.health,1);assert.equal(kp.facing.x,1);assert.equal(kp.carrying,null);
 a.emit('input',{x:Infinity,y:NaN,health:99,status:'escaped'});await sleep(80);assert.equal(ap.health,1);assert.equal(ap.status,'alive');assert.ok(Number.isFinite(ap.x));assert.equal((await emit(a,'loadout',{item:'none',perks:[]})).ok,false);
 room.beginSkill(ap,'hook',null);await waitFor(()=>a.latest.players.find(p=>p.id===a.identity).skill);assert.ok(a.latest.players.find(p=>p.id===a.identity).skill);assert.equal(b.latest.players.find(p=>p.id===a.identity).skill,null);assert.equal(k.latest.players.find(p=>p.id===a.identity).skill,null);
});

test('hook rescue auras cross fog until rescued; killer always receives objective positions',async t=>{
 const {server,client}=await fixture(t),k=await client(),a=await client(),b=await client();await emit(k,'create',{name:'objective visibility',nickname:'K',maxPlayers:3});const code=k.latest.code;await emit(a,'join',{code,nickname:'A'});await emit(b,'join',{code,nickname:'B'});await emit(k,'start');
 const room=server.game.rooms.get(code),p=room.players.get(a.identity),q=room.players.get(b.identity),killer=room.players.get(k.identity),h=room.map.cages[0];room.map.walls=[];killer.x=1000;killer.y=1000;p.x=1500;p.y=1000;q.x=4000;q.y=3500;q.status='caged';q.hookStage=2;q.hookTime=70;q.hookedAt=room.elapsed;h.x=q.x;h.y=q.y;h.occupant=q.id;
 await sleep(180);assert.equal(a.latest.players.find(v=>v.id===q.id).x,4000);assert.equal(a.latest.players.find(v=>v.id===q.id).hookStage,2);assert.equal(k.latest.map.cages.find(v=>v.id===h.id).x,4000);assert.equal(k.latest.map.generators.length,5);assert.ok(k.latest.map.generators.every(g=>Number.isFinite(g.x)&&Number.isFinite(g.y)));room.unhook(q);await sleep(180);assert.equal(a.latest.players.find(v=>v.id===q.id).status,'alive');assert.equal(a.latest.players.find(v=>v.id===q.id).x,null);
});
