const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const {readAuthoredAnimations,restoreAuthoredAnimation}=require('../scripts/authored-animation.cjs');
const os=require('node:os');
const root=path.join(__dirname,'..'),dir=path.join(root,'art/animation');
(async()=>{
 const works=JSON.parse(fs.readFileSync(path.join(root,'art/catalog.json'))),manifest=JSON.parse(fs.readFileSync(path.join(dir,'catalog.json')));
 assert.equal(works.length,153);assert.equal(manifest.length,works.length);
 const authored=readAuthoredAnimations(dir,new Set(works.map(w=>w.file)));
 assert.equal(authored.size,19,'19 reviewed animation overrides');
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
  assert(fs.readFileSync(path.join(fixture,'masks','singapura-stool.png')).equals(fs.readFileSync(existing.mask)));
 }finally{fs.rmSync(fixture,{recursive:true,force:true});}
 const hashes=new Set();let movingMin=Infinity,totalBytes=0;
 for(const w of works){
  const core=await sharp(path.join(root,'art',w.file+'.png')).removeAlpha().raw().toBuffer();
  const palette=new Set([0xd78479,0x3b6863,0xc4a052,0xf5efde]),used=new Set();
  for(let i=0;i<core.length;i+=3){const c=(core[i]<<16)|(core[i+1]<<8)|core[i+2];assert(palette.has(c),w.file+' puzzle stays within three inks plus paper');used.add(c)}
  assert.equal(used.size,4,w.file+' uses the complete puzzle palette');
  const file=path.join(dir,w.file+'.webp'),m=await sharp(file).metadata();assert.equal(m.width,1152);assert.equal(m.height,768);
  totalBytes+=fs.statSync(file).size;const frames=[];
  for(let i=0;i<6;i++)frames.push(await sharp(file).extract({left:i%3*384,top:Math.floor(i/3)*384,width:384,height:384}).ensureAlpha().raw().toBuffer());
  if(w.file==='singapura-stool'){
   for(const f of frames)for(let i=0;i<f.length;i+=4)if(f[i+3]){
    assert(f[i+3]===255&&palette.has((f[i]<<16)|(f[i+1]<<8)|f[i+2]),'each visible pixel can be recolored exactly');
   }
  }
  hashes.add(frames[0].toString('base64'));assert.equal(new Set(frames.map(f=>f.toString('base64'))).size,6,w.file+' has six separately drawn poses');
  const mask=await sharp(path.join(dir,'masks',w.file+'.png')).greyscale().raw().toBuffer();let changed=0,outside=0;
  for(let i=0;i<384*384;i++){
   let differs=false;for(let f=1;f<6;f++)for(let c=0;c<4;c++)if(frames[f][i*4+c]!==frames[0][i*4+c])differs=true;
   if(differs){changed++;if(!mask[i])outside++}
  }
  assert(changed>150,w.file+' changes real drawing pixels');assert.equal(outside,0,w.file+' scenery/props outside cat silhouettes stay byte-identical');movingMin=Math.min(movingMin,changed);
 }
 assert.equal(hashes.size,works.length,'every scene has its own animation artwork');
 console.log('PASS:',works.length,'authored six-pose animations; every non-cat pixel fixed; minimum changed pixels',movingMin,'sprite bytes',totalBytes);
})().catch(e=>{console.error(e);process.exit(1)});
