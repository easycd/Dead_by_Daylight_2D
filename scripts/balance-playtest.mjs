// Local QA fixture. Never mounted by the production server.
import {createStandaloneServer} from '../server.js';
import {Room,createMap,distance} from '../game.js';
import path from 'node:path';
const server=createStandaloneServer({dataFile:path.resolve('.data/balance-accounts.json')});
const room=new Room('BAL001','밸런스 검증 · 로컬 전용',5);
for(let i=0;i<4;i++)room.addPlayer('검증 대역'+i);
server.game.rooms.set(room.code,room);
let mode='idle',human,opponent,started=0,records=[];
function scenario(name){
  human=[...room.players.values()].find(p=>p.accountId);if(!human)throw new Error('먼저 방에 참가하세요.');
  room.phase='lobby';room.setRole(human.id,name==='killer'?'killer':'survivor');
  if(name!=='killer')room.setRole([...room.players.values()].find(p=>p.id!==human.id).id,'killer');
  room.hostId=human.id;room.start(human.id);room.map=createMap(731);
  opponent=[...room.players.values()].find(p=>p.id!==human.id&&(name==='killer'?p.role==='survivor':p.role==='killer'));
  for(const [i,p]of [...room.players.values()].entries()){p.x=3600;p.y=3500+i*60;p.nextSkill=10000;}
  const y=room.map.paths[2].y+room.map.paths[2].h/2;
  human.x=name==='killer'?650:900;human.y=y;opponent.x=name==='killer'?900:650;opponent.y=y;
  if(name==='repair'){const g=room.map.generators[0];human.x=g.x+42;human.y=g.y;opponent.x=3600;opponent.y=3500;human.nextSkill=10000;}
  if(name==='pallet'){
    const p=room.map.pallets[0],cx=p.x+p.w/2,cy=p.y+p.h/2;
    human.x=cx+(p.axis==='x'?45:0);human.y=cy+(p.axis==='y'?45:0);
    opponent.x=cx-(p.axis==='x'?45:0);opponent.y=cy-(p.axis==='y'?45:0);
  }
  mode=name;started=room.elapsed;records=[];
  // Reconnect normally so the client receives the full seeded layout.
  for(const socket of server.game.namespace.sockets.values())socket.disconnect(true);
  return {mode,seed:room.map.seed,human:{x:human.x,y:human.y},opponent:{x:opponent.x,y:opponent.y}};
}
const control=setInterval(()=>{
  if(!human||room.phase!=='playing')return;
  const elapsed=room.elapsed-started;
  if(mode==='killer')opponent.input={...opponent.input,x:1,y:0,run:true,aimX:1,aimY:0};
  if(mode==='survivor'){
    const d=distance(opponent,human);opponent.input={...opponent.input,x:1,y:0,aimX:1,aimY:0,attack:elapsed>4&&d<90&&!opponent.cooldown};
  }
  if(records.length===0||elapsed-records.at(-1).time>=.5)records.push({time:+elapsed.toFixed(2),gap:+distance(human,opponent).toFixed(1),human:{x:+human.x.toFixed(1),y:+human.y.toFixed(1),health:human.health,status:human.status},opponent:{health:opponent.health,status:opponent.status,stun:+opponent.stun.toFixed(2),cooldown:+opponent.cooldown.toFixed(2)},generators:room.map.generators.map(g=>+g.progress.toFixed(2)),pallet:room.map.pallets[0].state});
},33);
const original=server.http.listeners('request');
server.http.removeAllListeners('request');
server.http.on('request',(req,res)=>{
  if(req.url.startsWith('/__balance/')){try{const name=req.url.slice('/__balance/'.length);const result=name==='records'?{mode,records,events:room.events}:scenario(name);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));}catch(e){res.writeHead(400);res.end(e.message);}return;}
  for(const listener of original)listener(req,res);
});
await server.game.ready;
server.http.listen(3003,'127.0.0.1',()=>console.log('Balance QA http://127.0.0.1:3003/dbd/?room=BAL001'));
process.on('SIGINT',()=>{clearInterval(control);server.close().then(()=>process.exit());});
