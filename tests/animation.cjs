const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const root=path.join(__dirname,'..'),dir=path.join(root,'art/animation');
(async()=>{
 const works=JSON.parse(fs.readFileSync(path.join(root,'art/catalog.json'))),manifest=JSON.parse(fs.readFileSync(path.join(dir,'catalog.json')));
 assert.equal(works.length,153);assert.equal(manifest.length,works.length);
 const hashes=new Set();let movingMin=Infinity,totalBytes=0;
 for(const w of works){
  const core=await sharp(path.join(root,'art',w.file+'.png')).removeAlpha().raw().toBuffer();
  const palette=new Set([0xd78479,0x3b6863,0xc4a052,0xf5efde]),used=new Set();
  for(let i=0;i<core.length;i+=3){const c=(core[i]<<16)|(core[i+1]<<8)|core[i+2];assert(palette.has(c),w.file+' puzzle stays within three inks plus paper');used.add(c)}
  assert.equal(used.size,4,w.file+' uses the complete puzzle palette');
  const file=path.join(dir,w.file+'.webp'),m=await sharp(file).metadata();assert.equal(m.width,1152);assert.equal(m.height,768);
  totalBytes+=fs.statSync(file).size;const frames=[];
  for(let i=0;i<6;i++)frames.push(await sharp(file).extract({left:i%3*384,top:Math.floor(i/3)*384,width:384,height:384}).ensureAlpha().raw().toBuffer());
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
