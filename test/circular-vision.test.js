import test from 'node:test';
import assert from 'node:assert/strict';
import {canSee,visionPolygon,viewFov} from '../public/vision.js';
import {CONFIG as C} from '../config.js';
test('directional vision excludes rear and range, respects walls, and uses role FOV',()=>{
 const view={x:1000,y:1000,role:'survivor',facing:{x:1,y:0}},map={walls:[]};
 assert.ok(canSee(map,view,{x:1200,y:1000},C));assert.equal(canSee(map,view,{x:900,y:1000},C),false);assert.equal(canSee(map,view,{x:1500,y:1000},C),false);
 map.walls=[{x:1100,y:950,w:24,h:100}];assert.equal(canSee(map,view,{x:1200,y:1000},C),false);assert.ok(canSee(map,view,{x:1080,y:1000},C));
 view.facing={x:-1,y:0};assert.ok(canSee(map,view,{x:900,y:1000},C));assert.equal(canSee(map,view,{x:1080,y:1000},C),false);
 assert.ok(viewFov({role:'survivor'},C)>viewFov({role:'killer'},C));
});
test('vision mask follows wall edges and never opens the rear hemisphere',()=>{
 const view={x:1000,y:1000,role:'survivor',facing:{x:1,y:0}},map={walls:[{x:1100,y:950,w:24,h:100}]};
 const points=visionPolygon(map,view,400,viewFov(view,C));assert.ok(points.length>60);assert.ok(points.every(p=>p.x>=view.x));
 const center=points.find(p=>Math.abs(p.delta)<1e-8);assert.ok(center);assert.equal(center.x,1100);assert.ok(points.some(p=>Math.hypot(p.x-view.x,p.y-view.y)>390));
});
