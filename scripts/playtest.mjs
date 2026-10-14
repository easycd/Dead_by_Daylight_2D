import {createStandaloneServer} from '../server.js';
import {Room} from '../game.js';
// Local-only deterministic scenario for manual interaction testing, never imported by production.
const server=createStandaloneServer(),room=new Room('PLAY01','로컬 전용 규칙 검증',5);
for(let i=0;i<3;i++)room.addPlayer('검증 대역'+i);
server.game.rooms.set(room.code,room);
const start=room.start.bind(room);room.start=id=>{start(id);for(const [i,p]of [...room.players.values()].entries()){p.nextSkill=10000;if(p.name==='admin'){p.x=1000;p.y=1300;}else if(p.name==='플레이 생존자'){p.x=1080;p.y=1300;}else{p.x=2100+i*90;p.y=1500;}}room.map.generators[0].x=1050;room.map.generators[0].y=1420;room.map.cages[0].x=1000;room.map.cages[0].y=1470;};
const host=setInterval(()=>{if(room.phase==='lobby'){const admin=[...room.players.values()].find(p=>p.name==='admin');if(admin)room.hostId=admin.id;}},100);
server.http.listen(3002,'127.0.0.1',()=>console.log('Local playtest: http://127.0.0.1:3002/dbd/?room=PLAY01'));
process.on('SIGINT',()=>{clearInterval(host);server.close().then(()=>process.exit(0));});
