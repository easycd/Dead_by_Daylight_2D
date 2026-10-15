import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {integrateConcave,prepareServer} from '../scripts/integrate-concave.mjs';

const entry=`import {fileURLToPath} from 'node:url';
export function createGameServer() {
  const io = new Server(http, { maxHttpBufferSize: 16_384 });
  const ready = accounts.init();
  app.get('/api/health',health);
  return {close: () => { clearInterval(interval); http.close(); }};
}`;

test('integration accepts an explicit project path and is repeatable with awaited shutdown',async t=>{
  const target=await mkdtemp(path.join(tmpdir(),'nightfall-integrate-'));
  t.after(async()=>{const resolved=path.resolve(target);assert.equal(path.dirname(resolved),path.resolve(tmpdir()));assert.ok(path.basename(resolved).startsWith('nightfall-integrate-'));await rm(resolved,{recursive:true,force:true});});
  await mkdir(path.join(target,'server'));await writeFile(path.join(target,'server/index.ts'),entry);await writeFile(path.join(target,'package.json'),JSON.stringify({dependencies:{'socket.io':'*',bcryptjs:'*',pg:'*'}}));
  assert.equal(await integrateConcave(target),target);
  const first=await readFile(path.join(target,'server/index.ts'),'utf8');assert.match(first,/close: async/);assert.match(first,/await nightfall.close\(\)/);assert.match(first,/allowGuest: false/);
  assert.ok((await readFile(path.join(target,'nightfall/public/feedback.js'),'utf8')).includes('createFeedback'));
  await integrateConcave(target);assert.equal(await readFile(path.join(target,'server/index.ts'),'utf8'),first);
});

test('integration rejects missing targets and unsupported servers before writing',async()=>{
  await assert.rejects(integrateConcave(),/Usage/);await assert.rejects(integrateConcave(process.cwd()),/separate/);
  assert.throws(()=>prepareServer('export function createGameServer() {}'),/node:url/);
  assert.match(prepareServer(entry.replace('createGameServer()','createGameServer(options)')),/allowGuest: options.allowLegacyAuth/);
});
