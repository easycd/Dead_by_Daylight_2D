import test from 'node:test';
import assert from 'node:assert/strict';
import { createMap,Room } from '../game.js';
import { CONFIG as C } from '../config.js';

const positions=list=>list.map(({x,y,w,h})=>[x,y,w,h]);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
test('seeded generation moves every object family while retaining exactly fixed gates',()=>{
  const a=createMap(19),b=createMap(817);
  assert.deepEqual(a,createMap(19),'a seed must reproduce the entire layout for debugging');
  assert.deepEqual(a.exits,b.exits);
  assert.deepEqual(positions(a.exits),[[65,C.mapHeight/2,undefined,undefined],[C.mapWidth-65,C.mapHeight/2,undefined,undefined]]);
  for(const family of ['walls','windows','pallets','cabinets','generators','cages','chests','totems','bushes','decor','spawns','paths'])assert.notDeepEqual(positions(a[family]),positions(b[family]),family);
  assert.notDeepEqual(positions(a.zones.filter(z=>z.type==='building')),positions(b.zones.filter(z=>z.type==='building')));
  assert.notDeepEqual(a.hatch,b.hatch);assert.notDeepEqual(a.killerSpawn,b.killerSpawn);
});

test('100 layouts distribute objectives and preserve spacing and full-roster spawn separation',()=>{
  for(let seed=1;seed<=100;seed++){
    const m=createMap(seed*73),regions=p=>(p.y<C.mapHeight/2?0:3)+Math.floor(p.x/(C.mapWidth/3));
    for(let r=0;r<6;r++)assert.ok(m.generators.some(g=>regions(g)===r),`seed ${seed}: generator region ${r}`);
    for(const size of [5,6,7]){
      const gens=m.generators.slice(0,size);
      for(const south of [false,true])assert.ok(gens.filter(g=>(g.y>=C.mapHeight/2)===south).length>=2,'small-room halves must both have at least two generators');
      for(let col=0;col<3;col++)assert.ok(gens.some(g=>Math.floor(g.x/(C.mapWidth/3))===col));
      for(let i=0;i<gens.length;i++)for(let j=i+1;j<gens.length;j++)assert.ok(distance(gens[i],gens[j])>=600);
    }
    assert.ok(m.generators.filter(g=>g.y<C.mapHeight/2).length<=4);
    assert.ok(m.generators.filter(g=>g.y>=C.mapHeight/2).length<=4);
    for(let q=0;q<4;q++)assert.equal(m.cages.filter(p=>(p.y<C.mapHeight/2?0:2)+(p.x<C.mapWidth/2?0:1)===q).length,2);
    assert.ok(m.chests.some(p=>p.y<C.mapHeight/2));assert.ok(m.chests.some(p=>p.y>=C.mapHeight/2));
    assert.equal(m.spawns.length,C.maxPlayers-1);
    for(const p of m.spawns)assert.ok(distance(p,m.killerSpawn)>=850);
    for(let i=0;i<m.spawns.length;i++)for(let j=i+1;j<m.spawns.length;j++)assert.ok(distance(m.spawns[i],m.spawns[j])>=230);
  }
});

test('a new match regenerates geometry and objectives, keeps exits fixed and clears progress',()=>{
  const r=new Room('REGEN1','test',3),k=r.addPlayer('k');r.addPlayer('a');r.addPlayer('b');r.start(k.id);
  const before=r.map;r.map.generators[0].progress=30;r.phase='finished';r.reset(k.id);r.start(k.id);
  assert.notEqual(r.map.seed,before.seed);assert.deepEqual(r.map.exits,before.exits);
  for(const family of ['walls','generators','cages','chests','cabinets','pallets'])assert.notDeepEqual(positions(before[family]),positions(r.map[family]));
  assert.ok(r.map.generators.every(g=>g.progress===0));
});


test('every wall structure has exactly two or three actual perimeter openings',()=>{
 for(let seed=1;seed<=25;seed++){
  const m=createMap(seed*41),byId=new Map(m.walls.map(w=>[w.id,w]));assert.equal(m.structures.length,15);
  for(const s of m.structures){
   assert.ok([2,3].includes(s.openings.length));assert.equal(s.openings.filter(o=>o.type!=='window').length,2);
   const walls=s.wallIds.map(id=>byId.get(id)),points=[];
   for(let x=s.x+1;x<s.x+s.w;x+=2)points.push({x,y:s.y+12});
   for(let y=s.y+1;y<s.y+s.h;y+=2)points.push({x:s.x+s.w-12,y});
   for(let x=s.x+s.w-1;x>s.x;x-=2)points.push({x,y:s.y+s.h-12});
   for(let y=s.y+s.h-1;y>s.y;y-=2)points.push({x:s.x+12,y});
   const free=points.map(p=>!walls.some(w=>p.x>=w.x&&p.x<=w.x+w.w&&p.y>=w.y&&p.y<=w.y+w.h));
   const openings=free.filter((v,i)=>v&&!free[(i+free.length-1)%free.length]).length;
   assert.equal(openings,s.openings.length,`seed ${seed} ${s.id}: accidental perimeter gap`);
   for(const o of s.openings)assert.ok(!walls.some(w=>o.x+o.w/2>w.x&&o.x+o.w/2<w.x+w.w&&o.y+o.h/2>w.y&&o.y+o.h/2<w.y+w.h));
  }
 }
});
