import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {io} from 'socket.io-client';
import {FileAccounts,credentials,colors} from '../accounts.js';
import {createStandaloneServer,handleNightfallRequest} from '../server.js';

const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function temp(t){const dir=await mkdtemp(path.join(tmpdir(),'nightfall-auth-test-')),file=path.join(dir,'accounts.json');t.after(async()=>{await unlink(file).catch(()=>{});await rmdir(dir);});return file;}
async function start(file){const server=createStandaloneServer({dataFile:file});await server.game.ready;await new Promise(r=>server.http.listen(0,'127.0.0.1',r));return {server,url:'http://127.0.0.1:'+server.http.address().port};}
async function post(url,route,body,cookie){const response=await fetch(url+'/dbd/api/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-Nightfall-Request':'1',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
async function connect(url,cookie){const s=io(url+'/nightfall',{forceNew:true,transports:['websocket'],extraHeaders:{Cookie:cookie}});await new Promise((r,j)=>{s.once('connect',r);s.once('connect_error',j);});return s;}
const emit=(s,event,data)=>new Promise((r,j)=>s.timeout(5000).emit(event,data,(e,v)=>e?j(e):r(v)));

test('credentials and cosmetics reject malformed or oversized input',()=>{
  assert.throws(()=>credentials({nickname:'<script>',password:'password123'}));
  assert.throws(()=>credentials({nickname:'player',password:'short'}));
  assert.throws(()=>credentials({nickname:'player',password:'가'.repeat(25)}));
  assert.equal(credentials({nickname:' 플레이어 ',password:'password123'}).nickname,'플레이어');
  assert.throws(()=>colors({survivorColor:'url(x)',killerColor:'#123456'}));
});

test('accounts, hashed sessions and separate colors survive reopening the file; duplicate creation is atomic',async t=>{
  const file=await temp(t),store=new FileAccounts(file);await store.init();
  const results=await Promise.allSettled([store.register('Alice','test-password-123'),store.register('ALICE','test-password-123')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const user=results.find(r=>r.status==='fulfilled').value,token=await store.createSession(user.id);
  await store.saveProfile(user.id,{survivorColor:'#567f95',killerColor:'#9d5853'});
  const saved=await readFile(file,'utf8');assert.ok(!saved.includes('test-password-123'));assert.ok(!saved.includes(token));assert.ok(!('passwordHash' in user));
  const reopened=new FileAccounts(file);await reopened.init();assert.equal((await reopened.login('alice','test-password-123')).id,user.id);
  assert.equal(await reopened.login('Alice','wrong-password'),null);assert.equal((await reopened.authenticate(token)).id,user.id);
  assert.deepEqual(await reopened.getProfile(user.id),{survivorColor:'#567f95',killerColor:'#9d5853'});
  await reopened.logout(token);assert.equal(await reopened.authenticate(token),null);
});

test('real HTTP and sockets enforce account identity, isolate profile saves and invalidate logout',async t=>{
  const file=await temp(t),{server,url}=await start(file);t.after(()=>server.close());
  const a=await post(url,'auth/register',{nickname:'Alice',password:'test-password-123'}),b=await post(url,'auth/register',{nickname:'Bob',password:'test-password-456'});
  assert.equal(a.status,201);assert.equal(b.status,201);assert.ok(a.cookie);assert.ok(!('passwordHash' in a.data.account));
  assert.equal((await post(url,'auth/register',{nickname:'ALICE',password:'test-password-123'})).status,409);
  assert.equal((await post(url,'auth/login',{nickname:'Alice',password:'wrong-password'})).status,401);
  const me=await fetch(url+'/dbd/api/me',{headers:{Cookie:a.cookie}});assert.equal(me.status,200);
  const unauthorized=io(url+'/nightfall',{forceNew:true,transports:['websocket'],auth:{token:randomUUID()}});t.after(()=>unauthorized.disconnect());
  const denial=await new Promise(r=>unauthorized.once('connect_error',r));assert.match(denial.message,/로그인/);
  const s=await connect(url,a.cookie);t.after(()=>s.disconnect());
  assert.equal((await emit(s,'profile:set',{accountId:b.data.account.id,survivorColor:'#567f95',killerColor:'#9d5853'})).ok,true);
  const store=await server.game.ready;assert.equal((await store.getProfile(a.data.account.id)).survivorColor,'#567f95');assert.equal((await store.getProfile(b.data.account.id)).survivorColor,'#657f62');
  await pause(120);assert.equal((await emit(s,'create',{name:'identity',nickname:'forged-name',maxPlayers:3})).ok,true);
  const player=[...server.game.rooms.values()][0].players.values().next().value;assert.equal(player.name,'Alice');assert.equal(player.cosmetics.survivorColor,'#567f95');
  await pause(120);assert.equal((await emit(s,'profile:set',{survivorColor:'<script>',killerColor:'#000000'})).ok,false);
  const room=[...server.game.rooms.values()][0];room.phase='playing';
  await pause(120);assert.equal((await emit(s,'profile:set',{survivorColor:'#ffffff',killerColor:'#ffffff'})).ok,false);
  assert.equal((await store.getProfile(a.data.account.id)).survivorColor,'#567f95');room.phase='lobby';
  const loggedOut=await post(url,'auth/logout',{},a.cookie);assert.equal(loggedOut.status,200);assert.equal((await fetch(url+'/dbd/api/me',{headers:{Cookie:a.cookie}})).status,401);
});

test('login and cosmetic colors survive an actual server restart',async t=>{
  const file=await temp(t);let run=await start(file);let current=run.server;t.after(()=>current?.close());
  const registered=await post(run.url,'auth/register',{nickname:'SavedUser',password:'restart-test-123'});
  const s=await connect(run.url,registered.cookie);await emit(s,'profile:set',{survivorColor:'#8e6f9e',killerColor:'#c09b53'});s.disconnect();
  await current.close();current=null;run=await start(file);current=run.server;
  const login=await post(run.url,'auth/login',{nickname:'saveduser',password:'restart-test-123'});assert.equal(login.status,200);assert.equal(login.data.account.survivorColor,'#8e6f9e');assert.equal(login.data.account.killerColor,'#c09b53');
});

test('authentication mutation requires CSRF request header and excessive attempts are throttled',async t=>{
  const file=await temp(t),{server,url}=await start(file);t.after(()=>server.close());
  const blocked=await fetch(url+'/dbd/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname:'NoHeader',password:'test-password'})});assert.equal(blocked.status,403);
  for(let i=0;i<12;i++)assert.equal((await post(url,'auth/login',{nickname:'X',password:'bad'})).status,400);
  assert.equal((await post(url,'auth/login',{nickname:'X',password:'bad'})).status,429);
  assert.equal((await post(url,'auth/login',{nickname:'Another',password:'bad'})).status,400);
});

test('older local account files without profiles remain usable without losing account data',async t=>{
  const file=await temp(t);await writeFile(file,JSON.stringify({users:[{id:'old-user',nickname:'OldUser'}],sessions:[]}));
  const store=new FileAccounts(file);await store.init();assert.equal((await store.getProfile('old-user')).survivorColor,'#657f62');
  await store.saveProfile('old-user',{survivorColor:'#123456',killerColor:'#abcdef'});
  const saved=JSON.parse(await readFile(file,'utf8'));assert.equal(saved.users[0].nickname,'OldUser');assert.equal(saved.profiles['old-user'].killerColor,'#abcdef');
});

test('oversized requests and invalid URLs return errors, and auth tracking stays bounded',async t=>{
  const file=await temp(t),{server,url}=await start(file);t.after(()=>server.close());
  assert.equal((await post(url,'auth/login',{nickname:'Large',password:'x'.repeat(3000)})).status,413);
  const invalidOrigin=await fetch(url+'/dbd/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-Nightfall-Request':'1',Origin:'null'},body:JSON.stringify({nickname:'Player',password:'test-password'})});assert.equal(invalidOrigin.status,403);
  const attempts=server.game.auth.attempts;for(let i=0;i<5001;i++)attempts.set('fixture:'+i,{start:Date.now(),count:1});
  assert.equal((await post(url,'auth/login',{nickname:'X',password:'short'})).status,400);assert.ok(attempts.size<=5000);
  let status,body;await handleNightfallRequest({url:'http://[',socket:{}},{writeHead:n=>status=n,end:v=>body=v});
  assert.equal(status,400);assert.match(body,/Invalid/);
  assert.equal((await fetch(url+'/dbd/api/health')).status,200);
});
