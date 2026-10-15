import test from 'node:test';
import assert from 'node:assert/strict';
import {createScene} from '../public/scene.js';
test('vision draws a radial circle without wall-dependent clipping; floor never draws roads',()=>{
 const calls=[],fogCalls=[],make=(log)=>new Proxy({canvas:{width:1280,height:720},getTransform:()=>({a:1,d:1,e:0,f:0}),createRadialGradient:(...args)=>{log.push(['gradient',...args]);return {addColorStop(){}};}},{get:(o,k)=>k in o?o[k]:(...args)=>log.push([k,...args])});
 const ctx=make(calls),fc=make(fogCalls),oldDocument=globalThis.document,oldMatch=globalThis.matchMedia;
 globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>fc})};globalThis.matchMedia=()=>({matches:false});
 try{const scene=createScene(ctx),base={width:4000,height:4000,zones:[],decor:[],paths:[{x:123,y:456,w:789,h:42}],walls:[]};scene.floor(base);assert.equal(calls.some(c=>c[0]==='roundRect'&&c[1]===123),false);const view={x:1000,y:1000},camera={x:1000,y:1000};scene.visibility(base,view,camera,1280,720,600);const clear=structuredClone(fogCalls);fogCalls.length=0;scene.visibility({...base,walls:[{x:1010,y:900,w:25,h:200}]},view,camera,1280,720,600);assert.deepEqual(fogCalls,clear);assert.deepEqual(fogCalls.find(c=>c[0]==='arc'),['arc',640,360,600,0,Math.PI*2]);assert.equal(fogCalls.some(c=>c[0]==='lineTo'),false);}
 finally{globalThis.document=oldDocument;globalThis.matchMedia=oldMatch;}
});
