import {cp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const source=fileURLToPath(new URL('../',import.meta.url));

export function prepareServer(content){
  if(!content.includes('createNightfall')){
    if(!/export (?:async )?function createGameServer\(/.test(content))throw new Error('Cannot locate createGameServer in server/index.ts. No files were changed.');
    content=content.replace(/import\s*\{([^}]*\bfileURLToPath\b[^}]*)\}\s*from\s*(['"])node:url\2;/,(match,names)=>names.includes('pathToFileURL')?match:`import {${names.trim().replace(/,\s*$/,'')}, pathToFileURL} from 'node:url';`);
    if(!content.includes('pathToFileURL'))throw new Error('Cannot locate node:url import. No files were changed.');
    content=content.replace(/export (?:async )?function createGameServer\(/,match=>`const {createNightfall,handleNightfallRequest}=await import(pathToFileURL(path.resolve(process.cwd(),'nightfall/server.js')).href);

${match}`);
    const ioPattern=/const io = new Server\(http, \{ maxHttpBufferSize: 16_384 \}\);/;
    if(!ioPattern.test(content))throw new Error('Cannot locate Socket.IO setup. No files were changed.');
    content=content.replace(ioPattern,match=>match+'\n  const nightfall = createNightfall(io);');
    const healthPattern=/^(\s*)app\.get\((['"])\/api\/health\2/m;
    if(!healthPattern.test(content))throw new Error('Cannot locate HTTP route setup. No files were changed.');
    content=content.replace(healthPattern,(match,space)=>`${space}app.use((req,res,next)=>{void handleNightfallRequest(req,res).then((handled:boolean)=>{if(!handled)next();}).catch(next);});
${match}`);
  }
  if(content.includes('  const nightfall = createNightfall(io);')&&content.includes('  const ready = accounts.init();')){
    content=content.replace(/  const nightfall = createNightfall\(io\);\r?\n/,'');
    const legacy=/createGameServer\([^)]*\boptions\b/.test(content)?'options.allowLegacyAuth === true':'false';
    content=content.replace('  const ready = accounts.init();',`  const ready = accounts.init();
  const nightfall = createNightfall(io, {accountStore: process.env.DATABASE_URL ? accounts : undefined, ready, allowGuest: ${legacy}});`);
  }
  if(!content.includes('await nightfall.close();')){
    const closePattern=/close:\s*(?:async\s*)?\(\)\s*=>\s*\{\s*clearInterval\(interval\);(?:\s*nightfall\.close\(\);)?/;
    if(!closePattern.test(content))throw new Error('Cannot locate async shutdown. No files were changed.');
    content=content.replace(closePattern,'close: async () => { clearInterval(interval); await nightfall.close();');
  }
  if(!content.includes('createNightfall(io')||!content.includes('handleNightfallRequest(req')||!content.includes('await nightfall.close();'))throw new Error('Incomplete integration. No files were changed.');
  return content;
}

export async function integrateConcave(targetPath){
  if(!targetPath)throw new Error('Usage: node scripts/integrate-concave.mjs <Concave directory>');
  const target=path.resolve(targetPath),relative=path.relative(source,target),inverse=path.relative(target,source);
  const within=r=>r===''||(!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r));
  if(within(relative)||within(inverse))throw new Error('Source and target must be separate project directories.');
  const entry=path.join(target,'server/index.ts'),ignorePath=path.join(target,'.gitignore');
  const [original,packageText]=await Promise.all([readFile(entry,'utf8'),readFile(path.join(target,'package.json'),'utf8')]);
  const manifest=JSON.parse(packageText),missing=['socket.io','bcryptjs','pg'].filter(name=>!manifest.dependencies?.[name]);
  if(missing.length)throw new Error('Install runtime dependencies in the target first: '+missing.join(', '));
  const content=prepareServer(original);
  let ignore='';try{ignore=await readFile(ignorePath,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
  const dest=path.join(target,'nightfall');await mkdir(dest,{recursive:true});
  for(const item of ['trial-ui.js','config.js','rules.js','team-activity.js','bots.js','social.js','accounts.js','map.js','game.js','server.js','server.d.ts','public'])await cp(path.join(source,item),path.join(dest,item),{recursive:true});
  if(!ignore.split(/\r?\n/).some(line=>['.data/','.data/nightfall-accounts.json*'].includes(line)))await writeFile(ignorePath,ignore+'\n# Local NIGHTFALL credentials and sessions\n.data/nightfall-accounts.json*\n');
  await writeFile(entry,content);
  await writeFile(path.join(dest,'README.md'),`# NIGHTFALL

Source: ${source}
Mounted at /dbd/ on the existing server, Socket.IO namespace /nightfall.
Synchronize with scripts/integrate-concave.mjs from the source project.
`);
  return target;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  integrateConcave(process.argv[2]).then(target=>console.log(`Integrated NIGHTFALL into ${target}; existing routes remain at /.`)).catch(error=>{console.error(error.message);process.exitCode=1;});
}
