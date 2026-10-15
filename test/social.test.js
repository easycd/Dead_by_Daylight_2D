import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {io} from 'socket.io-client';
import {createStandaloneServer} from '../server.js';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const emit=(s,event,data={})=>new Promise((resolve,reject)=>s.timeout(3000).emit(event,data,(e,r)=>e?reject(e):resolve(r)));
async function waitFor(fn){for(let n=0;n<100;n++){if(fn())return;await pause(20);}throw new Error('Socket update not received');}
async function fixture(t){
  const dir=await mkdtemp(path.join(tmpdir(),'nightfall-social-')),file=path.join(dir,'accounts.json'),run=createStandaloneServer({dataFile:file}),clients=[];
  const identity=await run.game.ready;await new Promise(r=>run.http.listen(0,'127.0.0.1',r));
  t.after(async()=>{clients.forEach(s=>s.disconnect());await run.close();await unlink(file);await rmdir(dir);});
  const url='http://127.0.0.1:'+run.http.address().port;
  async function client(name){const account=await identity.accounts.register(name,'Local-Social-Test-123'),token=await identity.accounts.createSession(account.id),s=io(url+'/nightfall',{forceNew:true,transports:['websocket'],extraHeaders:{Cookie:'nightfall_session='+token}});
    s.account=account;s.state=null;s.people=[];s.social={};s.invite=null;s.on('state',v=>s.state=v);s.on('social:presence',v=>s.people=v);s.on('social:state',v=>s.social=v);s.on('social:invite',v=>s.invite=v);clients.push(s);await new Promise((r,j)=>{s.once('connect',r);s.once('connect_error',j);});return s;}
  return {run,url,client};
}

test('main and room chat are isolated; presence tracks state and invitations require the intended recipient',async t=>{
  const {run,client}=await fixture(t),a=await client('Alpha'),b=await client('Beta'),c=await client('Gamma'),d=await client('Delta');
  await waitFor(()=>a.people.length===4);assert.ok(a.people.every(p=>p.status==='main'));
  assert.equal((await emit(b,'social:send',{text:'main hello',name:'forged',scope:'room'})).ok,true);
  await waitFor(()=>a.social.messages?.some(m=>m.text==='main hello'));assert.equal(a.social.messages.at(-1).name,'Beta');
  await emit(a,'create',{name:'first',maxPlayers:3});await waitFor(()=>a.state?.code);const code=a.state.code;
  assert.ok(a.state.players.every(p=>p.role==='waiting'));await waitFor(()=>b.people.find(p=>p.id===a.account.id)?.status==='room');
  assert.equal((await emit(a,'social:send',{text:'room secret'})).ok,true);assert.ok(!b.social.messages.some(m=>m.text==='room secret'));
  await emit(d,'create',{name:'second',maxPlayers:3});await waitFor(()=>d.state?.code);assert.ok(!d.social.messages.some(m=>m.text==='room secret'));
  assert.equal((await emit(a,'social:invite',{targetId:b.account.id,fromName:'forged'})).ok,true);await waitFor(()=>b.invite);
  assert.equal(b.invite.fromName,'Alpha');assert.equal(c.invite,null);
  assert.equal((await emit(c,'social:accept',{id:b.invite.id})).ok,false);
  assert.equal((await emit(a,'social:invite',{targetId:b.account.id})).ok,false);
  assert.equal((await emit(b,'social:accept',{id:b.invite.id})).ok,true);await waitFor(()=>b.state?.code===code);
  assert.ok(b.social.messages.some(m=>m.text==='room secret'));assert.equal(b.state.players.find(p=>p.accountId===b.account.id).role,'waiting');
  assert.equal((await emit(a,'social:invite',{targetId:d.account.id})).ok,false);
  assert.equal((await emit(c,'social:send',{text:'only main'})).ok,true);assert.ok(!a.social.messages.some(m=>m.text==='only main'));
  await pause(120);await emit(b,'leave');await waitFor(()=>!b.state);await waitFor(()=>a.people.find(p=>p.id===b.account.id)?.status==='main');
  await pause(720);assert.equal((await emit(a,'social:invite',{targetId:c.account.id})).ok,true);await waitFor(()=>c.invite);
  const pending=c.invite;pending.expires=0; // Client edits cannot grant authority; server retains its own expiry.
  await pause(120);await emit(a,'leave');assert.equal((await emit(c,'social:accept',{id:pending.id})).ok,false);
  d.disconnect();await waitFor(()=>!a.people.some(p=>p.id===d.account.id));assert.equal(run.game.rooms.has(code),false);
});

test('waiting entry, exclusive killer slot, team moves and match start validation are authoritative',async t=>{
  const {client}=await fixture(t),a=await client('First'),b=await client('Second'),c=await client('Third');
  await emit(a,'create',{name:'teams',maxPlayers:3});await waitFor(()=>a.state?.code);const code=a.state.code;
  await emit(b,'join',{code});await emit(c,'join',{code});await waitFor(()=>a.state.players.length===3);
  assert.ok(a.state.players.every(p=>p.role==='waiting'));await pause(120);
  assert.equal((await emit(a,'start')).ok,false);await pause(120);
  const race=await Promise.all([emit(a,'role',{role:'killer'}),emit(b,'role',{role:'killer'})]);assert.equal(race.filter(r=>r.ok).length,1);
  await waitFor(()=>a.state.players.filter(p=>p.role==='killer').length===1);
  const winner=race[0].ok?a:b,loser=winner===a?b:a;
  await pause(120);assert.equal((await emit(winner,'role',{role:'waiting'})).ok,true);await pause(120);
  assert.equal((await emit(loser,'role',{role:'killer'})).ok,true);
  await pause(120);await emit(winner,'role',{role:'survivor'});await emit(c,'role',{role:'survivor'});await pause(120);
  assert.equal((await emit(a,'start')).ok,true);await waitFor(()=>a.state.phase==='playing');
  assert.ok(a.people.every(p=>p.status==='playing'));
  await pause(120);assert.equal((await emit(loser,'role',{role:'waiting'})).ok,false);
  assert.equal((await emit(a,'social:send',{text:'forbidden during trial'})).ok,false);
  assert.equal((await emit(a,'social:invite',{targetId:c.account.id})).ok,false);
});


test('invitations recheck capacity and phase; rejected chat cannot mutate shared history',async t=>{
  const {run,client}=await fixture(t),a=await client('CapacityA'),b=await client('CapacityB'),c=await client('CapacityC'),d=await client('CapacityD');
  await emit(a,'create',{name:'capacity',maxPlayers:3});await waitFor(()=>a.state?.code);const code=a.state.code;
  await emit(a,'social:invite',{targetId:d.account.id});await waitFor(()=>d.invite);
  await emit(b,'join',{code});await emit(c,'join',{code});await waitFor(()=>a.state.players.length===3);
  const full=await emit(d,'social:accept',{id:d.invite.id});assert.equal(full.ok,false);assert.match(full.error,/가득/);assert.equal(d.state,null);
  await pause(120);await emit(c,'leave');assert.equal((await emit(d,'social:accept',{id:d.invite.id})).ok,true);
  const count=a.social.messages.length;
  for(const text of ['', ' '.repeat(5), '\u0000\n', '\u0000  \u0000', 'x'.repeat(201), null])assert.equal((await emit(a,'social:send',{text})).ok,false);
  assert.equal(a.social.messages.length,count);
  assert.equal((await emit(a,'social:send',{text:'<img src=x onerror=alert(1)>'})).ok,true);
  await waitFor(()=>b.social.messages.length===count+1);assert.equal(b.social.messages.at(-1).text,'<img src=x onerror=alert(1)>');
  assert.equal((await emit(a,'social:send',{text:'too fast'})).ok,false);
  assert.equal((await emit(a,'social:sync')).ok,true);assert.equal((await emit(a,'social:sync')).ok,false);
  await pause(120);await emit(a,'role',{role:'killer'});await emit(b,'role',{role:'survivor'});await emit(d,'role',{role:'survivor'});await pause(120);await emit(a,'start');
  assert.equal(run.game.rooms.get(code).phase,'playing');
  assert.equal((await emit(c,'join',{code})).ok,false);assert.equal((await emit(d,'social:accept',{id:d.invite.id})).ok,false);
});

test('finished match transfers host, resets, and reconnect removes duplicate presence',async t=>{
  const {run,client,url}=await fixture(t),a=await client('HostA'),b=await client('HostB'),c=await client('HostC');
  await emit(a,'create',{name:'host change',maxPlayers:3});await waitFor(()=>a.state?.code);const code=a.state.code;
  await emit(b,'join',{code});await emit(c,'join',{code});await pause(120);await emit(a,'role',{role:'killer'});await emit(b,'role',{role:'survivor'});await emit(c,'role',{role:'survivor'});await pause(120);await emit(a,'start');
  const room=run.game.rooms.get(code);room.finish('individual','test complete');await waitFor(()=>b.state?.phase==='finished');
  a.disconnect();await waitFor(()=>b.state.hostId===b.state.players.find(p=>p.accountId===b.account.id).id);
  await pause(120);assert.equal((await emit(b,'reset')).ok,true);await waitFor(()=>b.state.phase==='lobby');assert.equal(b.state.players.length,2);assert.equal(b.state.players.find(p=>p.accountId===b.account.id).role,'survivor');assert.equal(b.state.players.filter(p=>p.role==='killer').length,0);
  const identity=await run.game.ready,token=await identity.accounts.createSession(b.account.id);
  const again=io(url+'/nightfall',{forceNew:true,transports:['websocket'],extraHeaders:{Cookie:'nightfall_session='+token}});t.after(()=>again.disconnect());
  let people=[],state=null;again.on('social:presence',v=>people=v);again.on('state',v=>state=v);
  await new Promise((r,j)=>{again.once('connect',r);again.once('connect_error',j);});await waitFor(()=>state?.code===code&&people.length===2);
  assert.equal(b.connected,false);assert.equal(people.filter(p=>p.id===b.account.id).length,1);assert.ok(state.players.find(p=>p.accountId===b.account.id).connected);
});

test('an unexpired lobby invitation is restored after the recipient reconnects',async t=>{
  const {client}=await fixture(t),a=await client('InviteHost'),b=await client('InviteGuest');
  await emit(a,'create',{name:'invite recovery',maxPlayers:3});await waitFor(()=>a.state?.code);
  assert.equal((await emit(a,'social:invite',{targetId:b.account.id})).ok,true);await waitFor(()=>b.invite);
  const id=b.invite.id;b.disconnect();b.invite=null;b.connect();
  await waitFor(()=>b.invite?.id===id);assert.equal(b.invite.code,a.state.code);
  assert.equal((await emit(b,'social:accept',{id})).ok,true);await waitFor(()=>b.state?.code===a.state.code);
});
