const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const {readAuthoredAnimations,restoreAuthoredAnimation}=require('../scripts/authored-animation.cjs');
const os=require('node:os'),{spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..'),dir=path.join(root,'art/animation');
(async()=>{
 const works=JSON.parse(fs.readFileSync(path.join(root,'art/catalog.json'))),manifest=JSON.parse(fs.readFileSync(path.join(dir,'catalog.json')));
 const slugs=new Set(works.map(w=>w.file)),manifestSlugs=new Set(manifest.map(w=>w.file));
 assert(works.length>=153,'keep all the original 153 works');
 assert.equal(slugs.size,works.length,'unique work filenames');
 assert.equal(manifestSlugs.size,manifest.length,'unique animation metadata rows');
 assert.deepEqual(slugs,manifestSlugs,'animation metadata covers every work');
 const jobs=JSON.parse(fs.readFileSync(path.join(dir,'jobs.json'))),jobSlugs=jobs.flatMap(job=>job.files),seenJobs=new Set(jobSlugs);
 assert.equal(seenJobs.size,jobSlugs.length,'no work is assigned to two atlas positions');
 assert(jobSlugs.every(file=>slugs.has(file)),'all atlas positions are known works');
 const authored=readAuthoredAnimations(dir,slugs);
 assert(authored.size>=19,'keep all existing reviewed animation overrides');
 const standalone=new Set([...slugs].filter(file=>!seenJobs.has(file)));
 for(const file of standalone)assert(authored.has(file),file+' has a standalone animation source');
 for(const [file,{entry,sprite,mask}] of authored){
  assert.deepEqual(entry,manifest.find(row=>row.file===file),file+' retains reviewed metadata');
  assert(fs.readFileSync(sprite).equals(fs.readFileSync(path.join(dir,file+'.webp'))),file+' retains authored poses');
  assert(fs.readFileSync(mask).equals(fs.readFileSync(path.join(dir,'masks',file+'.png'))),file+' retains authored mask');
 }
 const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'neko-authored-animation-'));
 try{
  const source=path.join(fixture,'sources','singapura-stool'),existing=authored.get('singapura-stool');
  fs.mkdirSync(source,{recursive:true});
  fs.writeFileSync(path.join(fixture,'sources','authored.json'),JSON.stringify([existing.entry]));
  fs.copyFileSync(existing.sprite,path.join(source,'poses.webp'));
  const allowed=new Set(['singapura-stool']);
  assert.throws(()=>readAuthoredAnimations(fixture,allowed),/Missing authored animation source: .*cat-mask.png/);
  fs.copyFileSync(existing.mask,path.join(source,'cat-mask.png'));
  const restored=restoreAuthoredAnimation(fixture,readAuthoredAnimations(fixture,allowed).get('singapura-stool'));
  assert.deepEqual(restored,existing.entry);
  assert(fs.readFileSync(path.join(fixture,'singapura-stool.webp')).equals(fs.readFileSync(existing.sprite)));
  const builtMask=path.join(fixture,'masks','singapura-stool.png');
  assert(fs.readFileSync(builtMask).equals(fs.readFileSync(existing.mask)));

  // Run the actual builder with a reviewed pair and no atlas job in an isolated root.
  const isolated=path.join(fixture,'project'),scriptDir=path.join(isolated,'scripts');
  const animation=path.join(isolated,'art','animation'),catalogFile=path.join(animation,'catalog.json');
  fs.mkdirSync(scriptDir,{recursive:true});
  fs.mkdirSync(animation,{recursive:true});
  for(const file of ['build-animation.cjs','authored-animation.cjs','animation-layouts.json']){
   fs.copyFileSync(path.join(root,'scripts',file),path.join(scriptDir,file));
  }
  // In CI, sharp is installed alongside the real checkout rather than under this temporary folder.
  const nodeEnv={...process.env,NODE_PATH:[path.join(root,'node_modules'),process.env.NODE_PATH].filter(Boolean).join(path.delimiter)};
  const build=(...args)=>spawnSync(process.execPath,[path.join(scriptDir,'build-animation.cjs'),...args],{encoding:'utf8',env:nodeEnv});
  fs.cpSync(path.join(fixture,'sources'),path.join(animation,'sources'),{recursive:true});
  const onlyWork=[works.find(w=>w.file==='singapura-stool')],jobsFile=path.join(animation,'jobs.json');
  fs.writeFileSync(path.join(isolated,'art','catalog.json'),JSON.stringify(onlyWork));
  fs.writeFileSync(jobsFile,'[]');
  const checkBuild=result=>assert.equal(result.status,0,result.stderr||result.error?.message);
  const backgroundJobs=()=>assert.deepEqual(JSON.parse(fs.readFileSync(jobsFile)),[],'standalone source does not add a fake atlas job');
  const verify=()=>{
   assert(fs.readFileSync(path.join(animation,'singapura-stool.webp')).equals(fs.readFileSync(existing.sprite)));
   assert(fs.readFileSync(path.join(animation,'masks','singapura-stool.png')).equals(fs.readFileSync(existing.mask)));
   assert.deepEqual(JSON.parse(fs.readFileSync(catalogFile)),[existing.entry]);
   backgroundJobs();
  };
  checkBuild(build());verify();
  fs.rmSync(catalogFile);
  checkBuild(build());verify(); // pre-supplied output pair may lack metadata
  fs.writeFileSync(path.join(animation,'singapura-stool.webp'),'stale pose output');
  checkBuild(build('--rebuild'));verify();
  fs.unlinkSync(path.join(animation,'masks','singapura-stool.png'));
  checkBuild(build());verify();
  fs.writeFileSync(jobsFile,JSON.stringify([{job:1,files:['singapura-stool']},{job:2,files:['singapura-stool']}]));
  const duplicate=build();
  assert.notEqual(duplicate.status,0);
  assert.match(duplicate.stderr,/Duplicate animation job scene: singapura-stool/);
  fs.writeFileSync(jobsFile,'[]');
  fs.writeFileSync(path.join(isolated,'art','catalog.json'),JSON.stringify([...onlyWork,...onlyWork]));
  const duplicateCatalog=build();
  assert.notEqual(duplicateCatalog.status,0);
  assert.match(duplicateCatalog.stderr,/Duplicate work filename/);
  fs.writeFileSync(path.join(isolated,'art','catalog.json'),JSON.stringify([...onlyWork,{file:'unregistered-cat'}]));
  const unregistered=build();
  assert.notEqual(unregistered.status,0);
  assert.match(unregistered.stderr,/No animation source for scene: unregistered-cat/);
  // Scratch imports retain their separate source/scene semantics: never consume the canonical registry.
  const scratch=path.join(fixture,'import');
  fs.mkdirSync(scratch);
  fs.writeFileSync(path.join(scratch,'scenes.json'),'[]');
  fs.writeFileSync(path.join(animation,'sources','authored.json'),'intentionally invalid');
  checkBuild(build('--rebuild',scratch));
  backgroundJobs();
 }finally{fs.rmSync(fixture,{recursive:true,force:true});}
 const hashes=new Set();let movingMin=Infinity,totalBytes=0;
 for(const w of works){
  const coreImage=sharp(path.join(root,'art',w.file+'.png'));
  const puzzleMeta=await coreImage.metadata();
  assert.equal(puzzleMeta.width,512);assert.equal(puzzleMeta.height,512);
  const core=await coreImage.removeAlpha().raw().toBuffer();
  const palette=new Set([0xd78479,0x3b6863,0xc4a052,0xf5efde]),used=new Set();
  for(let i=0;i<core.length;i+=3){const c=(core[i]<<16)|(core[i+1]<<8)|core[i+2];assert(palette.has(c),w.file+' puzzle stays within three inks plus paper');used.add(c)}
  assert.equal(used.size,4,w.file+' uses the complete puzzle palette');
  const file=path.join(dir,w.file+'.webp'),m=await sharp(file).metadata();assert.equal(m.width,1152);assert.equal(m.height,768);
  totalBytes+=fs.statSync(file).size;const frames=[];
  for(let i=0;i<6;i++)frames.push(await sharp(file).extract({left:i%3*384,top:Math.floor(i/3)*384,width:384,height:384}).ensureAlpha().raw().toBuffer());
  if(w.file==='singapura-stool'||standalone.has(w.file)){
   const finish=await sharp(path.join(root,'art','finish',w.file+'.webp')).metadata();
   assert.equal(finish.width,384);assert.equal(finish.height,384);
   assert(m.hasAlpha,w.file+' has a transparent sprite sheet');
   assert.equal(fs.readFileSync(file).subarray(12,16).toString(),'VP8L',w.file+' uses lossless WebP');
   for(const f of frames){
    let invisible=0,visible=0;
    for(let i=0;i<f.length;i+=4)if(f[i+3]){
     visible++;
     assert(f[i+3]===255&&palette.has((f[i]<<16)|(f[i+1]<<8)|f[i+2]),'each visible pixel can be recolored exactly');
    }else invisible++;
    assert(invisible>0&&visible>0,w.file+' has a visible character over transparent background in every pose');
   }
  }
  hashes.add(frames[0].toString('base64'));assert.equal(new Set(frames.map(f=>f.toString('base64'))).size,6,w.file+' has six separately drawn poses');
  const maskImage=sharp(path.join(dir,'masks',w.file+'.png'));
  const mask=await maskImage.greyscale().raw().toBuffer();let changed=0,outside=0;
  if(standalone.has(w.file)){
   const m=await maskImage.metadata();
   assert.equal(m.width,384);assert.equal(m.height,384);
   assert(mask.every(v=>v===0||v===255),w.file+' uses a binary cat mask');
   assert.equal(mask.reduce((n,v)=>n+(v===255),0),authored.get(w.file).entry.catPixels,w.file+' catalogue records the exact cat-mask area');
  }
  for(let i=0;i<384*384;i++){
   let differs=false;for(let f=1;f<6;f++)for(let c=0;c<4;c++)if(frames[f][i*4+c]!==frames[0][i*4+c])differs=true;
   if(differs){changed++;if(!mask[i])outside++}
  }
  assert(changed>150,w.file+' changes real drawing pixels');assert.equal(outside,0,w.file+' scenery/props outside cat silhouettes stay byte-identical');movingMin=Math.min(movingMin,changed);
 }
 assert.equal(hashes.size,works.length,'every scene has its own animation artwork');
 console.log('PASS:',works.length,'authored six-pose animations; every non-cat pixel fixed; minimum changed pixels',movingMin,'sprite bytes',totalBytes);
})().catch(e=>{console.error(e);process.exit(1)});
