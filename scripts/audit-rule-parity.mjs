// Read-only diagnostics: all scenarios use disposable in-memory rooms.
// These observations document the implementation, not desired DBD rules.
import { Room } from '../game.js';
import { CONFIG as C } from '../config.js';
function setup(){
  const r=new Room('AUDIT1','parity audit'),k=r.addPlayer('killer'),a=r.addPlayer('survivor');
  r.addPlayer('other');r.start(k.id);
  r.map.walls=[];r.map.windows=[];r.map.pallets=[];
  k.x=1000;k.y=1000;a.x=1050;a.y=1000;
  for(const p of r.players.values())p.nextSkill=10000;
  return {r,k,a};
}
const result={};
{
  const {r,k,a}=setup();k.cooldown=C.attackCooldown/2;k.recoveryDuration=C.attackCooldown;k.recoveryKind='hit';k.input.x=1;
  const x=k.x;r.move(k,.1);
  result.attackRecovery={seconds:C.attackCooldown,killerSpeedMps:(k.x-x)/.1/C.pixelsPerMeter};
  r.damage(a);a.input.x=1;a.input.run=true;
  const runX=a.x;r.move(a,.1);const runMps=(a.x-runX)/.1/C.pixelsPerMeter;
  a.input.run=false;const walkX=a.x;r.move(a,.1);
  result.hitBoost={seconds:a.hitBoost,runMps,walkMps:(a.x-walkX)/.1/C.pixelsPerMeter};
}
{
  const {r,k,a}=setup();a.status='down';a.health=0;k.cooldown=2.7;k.input.work=true;
  r.interact(k,.1,false);
  result.pickupDuringAttackRecovery={cooldown:k.cooldown,pickupStarted:k.task?.key===a.id};
}
{
  const {r,a}=setup(),g=r.map.generators[0];a.x=g.x;a.y=g.y;a.input.work=true;a.input.x=1;
  const x=a.x;r.tick(.1);
  result.moveWhileRepairing={movedPixels:a.x-x,repairCharges:g.progress,action:a.action?.label};
}
{
  const {r,a}=setup(),e=r.map.exits[0];e.open=true;a.status='down';a.health=0;a.x=e.x;a.y=e.y;
  r.tick(.1);result.crawlAtOpenExit={status:a.status};
}
{
  const {r,a}=setup(),p={id:'audit-pallet',x:1500,y:1500,w:80,h:20,axis:'y',state:'dropped'};
  r.map.pallets.push(p);a.x=1540;a.y=1470;a.input.run=true;r.vault(a,p);
  result.palletFastVaultSeconds=a.vault?.seconds;
}
{
  const {r,a}=setup(),g=r.map.generators[0];a.x=g.x;a.y=g.y;g.progress=30;
  r.beginSkill(a,'repair',g.id);r.interact(a,.1,false);
  result.releaseDuringSkillWarning={beforeCharges:30,afterCharges:g.progress,cooldown:a.cooldown,skillCleared:a.skill===null};
}
{
  const {r,k,a}=setup();r.unhook(a);
  result.unhook={protectionSeconds:a.immunity};
  a.input.x=1;a.input.run=true;a.immunity=0;a.haste=0;a.elusive=0;a.health=1;a.y=1600;
  for(let i=0;i<63;i++)r.tick(1/30);
  result.injuredRunningTraces={blood:r.traces.filter(t=>t.type==='blood').length,scratch:r.traces.filter(t=>t.type==='scratch').length};
  k.input={...k.input,x:0,y:0};
}
console.log(JSON.stringify(result,null,2));
