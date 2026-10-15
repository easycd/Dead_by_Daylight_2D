import test from 'node:test';
import assert from 'node:assert/strict';
import {createAudio} from '../public/audio.js';

test('sound starts muted, spectators hear their viewed location, mute cuts existing audio, nodes disconnect',async()=>{
  const keys=['localStorage','AudioContext','addEventListener','document'],original=Object.fromEntries(keys.map(k=>[k,globalThis[k]])),gains=[],oscillators=[];
  const parameter=()=>({value:0,setValueAtTime(value){this.value=value;},exponentialRampToValueAtTime(value){this.value=value;}});
  const node=()=>({connect(){},disconnect(){this.disconnected=true;}});
  class FakeAudioContext{
    constructor(){this.currentTime=1;this.state='running';this.destination={};}
    async resume(){}
    createGain(){const n={...node(),gain:parameter()};gains.push(n);return n;}
    createOscillator(){const n={...node(),frequency:parameter(),start(){},stop(){}};oscillators.push(n);return n;}
  }
  const button={textContent:'',setAttribute(){}},s={code:'TEST',elapsed:1,phase:'playing',viewId:'view',players:[{id:'own',role:'survivor',status:'escaped',x:0,y:0},{id:'view',role:'survivor',x:1000,y:1000}],map:{hatch:{visible:true,open:true,x:1100,y:1000}},config:{pixelsPerMeter:42.5}};
  try{
    globalThis.localStorage={getItem:()=>null,setItem(){}};globalThis.AudioContext=FakeAudioContext;globalThis.addEventListener=()=>{};globalThis.document={hidden:false};
    const audio=createAudio({getState:()=>s,getMyId:()=> 'own',button});assert.equal(button.textContent,'소리 꺼짐');
    audio.frame(1000,{});assert.equal(oscillators.length,0);
    await button.onclick();assert.equal(gains[0].gain.value,1);audio.frame(1000,{});assert.equal(oscillators.length,1);
    await button.onclick();assert.equal(gains[0].gain.value,0);audio.frame(2000,{});assert.equal(oscillators.length,1);
    oscillators[0].onended();assert.equal(oscillators[0].disconnected,true);assert.equal(gains[1].disconnected,true);
  }finally{for(const key of keys)if(original[key]===undefined)delete globalThis[key];else globalThis[key]=original[key];}
});
