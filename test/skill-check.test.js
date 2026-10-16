import test from 'node:test';
import assert from 'node:assert/strict';
import { createSkillCheckPresentation } from '../public/skill-check.js';

const check={type:'repair',target:'g1',start:10,duration:1.2,good:[.52,.8],great:[.68,.73]};
const state={phase:'playing',elapsed:10.72,map:{generators:[{id:'g1',x:1000,y:1000}]}};
const player={id:'p1',skill:check};
const camera={x:1000,y:1000};
const draw=(ui,p=player,now=0,cam=camera,s=state,W=1000,H=700,reduced=false)=>ui.frame(s,p,W,H,0,cam,now,reduced);

test('repair check stays screen-centred as the camera moves and stays within the viewport',()=>{
  const ui=createSkillCheckPresentation(),a=draw(ui),b=draw(ui,player,10,{x:1040,y:1020});
  assert.equal(a.x,500);assert.equal(a.y,350);
  assert.equal(b.x,a.x);assert.equal(b.y,a.y);
  for(const cam of [{x:-5000,y:-5000},{x:5000,y:5000}]){
    const f=draw(ui,player,20,cam,state,320,280);
    assert.ok(f.x>=78&&f.x<=242);assert.ok(f.y>=68&&f.y+90<=280);
  }
});

test('cleared check fades for 250ms with a frozen needle, then disappears',()=>{
  const ui=createSkillCheckPresentation(),active=draw(ui),ended={id:'p1',skill:null};
  const first=draw(ui,ended,100),middle=draw(ui,ended,225);
  assert.equal(first.opacity,1);assert.equal(middle.opacity,.25);
  assert.equal(middle.phase,active.phase);
  assert.equal(draw(ui,ended,350),null);
});

test('new checks replace fading checks; spectator, match end and reset remove stale visuals',()=>{
  const ui=createSkillCheckPresentation();draw(ui);draw(ui,{id:'p1',skill:null},100);
  const heal={id:'p1',skill:{...check,type:'heal',start:10.4}};
  const f=draw(ui,heal,150);assert.equal(f.opacity,1);assert.equal(f.x,500);assert.equal(f.y,350);
  assert.equal(draw(ui,{id:'spectator',skill:null},160),null);
  draw(ui);assert.equal(draw(ui,player,170,camera,{...state,phase:'finished'}),null);
  draw(ui);ui.reset();assert.equal(draw(ui,{id:'p1',skill:null},180),null);
});

test('reduced motion removes completed checks immediately',()=>{
  const ui=createSkillCheckPresentation();draw(ui);
  assert.equal(draw(ui,{id:'p1',skill:null},100,camera,state,1000,700,true),null);
});
