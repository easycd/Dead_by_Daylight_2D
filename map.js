import { randomInt } from 'node:crypto';
import { CONFIG as C } from './config.js';

// Authored landmarks and loop tiles share clear lanes; a seed varies props and tile layouts.
export function createMap(seed=randomInt(1,2147483646)) {
  let v=seed; const rand=()=>((v=v*16807%2147483647)-1)/2147483646;
  const m={seed,name:'BLACKPINE · 폐쇄된 벌목장',width:C.mapWidth,height:C.mapHeight,walls:[],windows:[],pallets:[],bushes:[],cabinets:[],cages:[],generators:[],exits:[],decor:[],zones:[],paths:[],chests:[],hatch:{x:1800,y:1750,visible:false,open:false},spawns:[]};
  const wall=(x,y,w,h,material='wood')=>m.walls.push({id:`w${m.walls.length}`,x,y,w,h,material});
  const window=(x,y,w,h,axis)=>m.windows.push({id:`v${m.windows.length}`,x,y,w,h,axis});
  const pallet=(x,y,w=90,h=24,axis='y')=>m.pallets.push({id:`p${m.pallets.length}`,x,y,w,h,axis,state:'ready',breakProgress:0});
  const locker=(x,y)=>m.cabinets.push({id:`l${m.cabinets.length}`,x,y,occupant:null,searchProgress:0});
  const building=(x,y,w,h,name)=>{m.zones.push({x,y,w,h,type:'building',name});wall(x,y,w*.55,24);window(x+w*.55,y,90,24,'y');wall(x+w*.55+90,y,w*.45-90,24);wall(x,y+24,24,h-24);wall(x+w-24,y+24,24,h*.35);window(x+w-24,y+h*.35+24,24,90,'x');wall(x+w-24,y+h*.35+114,24,h*.65-114);wall(x,y+h-24,w*.35,24);wall(x+w*.35+110,y+h-24,w*.65-110,24);};
  m.zones.push({x:80,y:80,w:1050,h:850,type:'forest',name:'검은 소나무 숲'},{x:2220,y:120,w:860,h:900,type:'yard',name:'폐차장'},{x:170,y:1450,w:1020,h:760,type:'ruins',name:'무너진 작업장'},{x:2180,y:1400,w:900,h:790,type:'logging',name:'목재 적재장'});
  m.paths=[{x:70,y:1120,w:3060,h:140},{x:1530,y:80,w:140,h:2240},{x:480,y:720,w:1120,h:90},{x:800,y:1200,w:90,h:900},{x:1600,y:1770,w:1200,h:90}];
  building(1240,840,650,500,'중앙 산장');wall(1540,1010,24,160);wall(1640,1010,170,24);pallet(1520,1160,24,100,'x');locker(1310,940);locker(1810,1250);
  building(300,300,390,330,'숲속 오두막');pallet(437,606,110,24);locker(365,380);
  // Different T/L walls, junk lanes and rock loops rather than a repeated rectangular grid.
  const tiles=[[870,270],[2150,310],[2600,650],[450,1050],[2160,1120],[400,1640],[1000,1780],[2470,1730]];
  for(let i=0;i<tiles.length;i++) {const [x,y]=tiles[i],kind=(i+Math.floor(rand()*3))%3;
    if(kind===0){wall(x,y,190,28,'stone');wall(x+162,y+28,28,150,'stone');wall(x+280,y+90,28,160,'stone');window(x+190,y,90,28,'y');pallet(x+190,y+150,90,24);}
    if(kind===1){wall(x,y,120,80,'car');wall(x+210,y+50,130,80,'car');wall(x,y+195,170,45,'metal');pallet(x+120,y+40,90,24);window(x+170,y+195,90,24,'y');}
    if(kind===2){wall(x,y,140,80,'rock');wall(x+230,y+90,120,70,'rock');wall(x+50,y+200,180,30,'wood');pallet(x+140,y+50,90,24);}
    locker(x+360,y+240);m.bushes.push({id:`b${i}`,x:x+15,y:y+295,w:150,h:80});
  }
  const sites=[[190,850],[530,460],[1070,1400],[1410,1130],[2600,330],[2040,1980],[2840,2020],[1850,440],[380,2040],[2760,1210],[1140,2140],[2100,760]];
  for(let i=sites.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[sites[i],sites[j]]=[sites[j],sites[i]];}
  m.generators=sites.slice(0,C.generatorCount).map(([x,y],i)=>({id:`g${i}`,x,y,progress:0,regressing:false,regressionCount:0,repairToStop:0,workers:[],kickProgress:0}));
  for(const [x,y]of [[190,600],[960,630],[1180,1040],[2000,970],[2820,500],[2700,1430],[1750,1670],[650,2040],[1160,2210],[2980,2140]])m.cages.push({id:`h${m.cages.length}`,x,y,occupant:null,rescueProgress:0,availableUntil:0});
  m.exits=[{x:65,y:1180},{x:C.mapWidth-65,y:1180}].map((p,i)=>({...p,id:`e${i}`,progress:0,open:false}));
  m.chests=[[760,750],[1690,1220],[2310,2040]].map(([x,y],i)=>({id:`ch${i}`,x,y,progress:0,opened:false,item:['medkit','toolbox','flashlight'][i]}));
  m.spawns=[{x:145,y:170},{x:220,y:220},{x:150,y:220},{x:240,y:240},{x:180,y:300},{x:145,y:350}];
  // Non-blocking ground props provide texture without creating invisible collision traps.
  for(let i=0;i<220;i++){const x=80+rand()*(m.width-160),y=80+rand()*(m.height-160);m.decor.push({x,y,size:12+rand()*24,type:rand()>.6?'stump':'grass',angle:rand()*6.28});}
  for(let i=0;i<35;i++){const x=95+i*86,y=90+(i%3)*28;wall(x,y,30,32,'tree');wall(x,m.height-y-32,30,32,'tree');}
  return m;
}
