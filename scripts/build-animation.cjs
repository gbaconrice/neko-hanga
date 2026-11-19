/* Extract authored cat poses and bake identical scenery into every frame.
   Inputs are recorded by image generation jobs in a scratch directory.
   node scripts/build-animation.cjs /workspace/scratch/animation */
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const root=path.join(__dirname,'..'),scratch=process.argv.slice(2).find(a=>!a.startsWith('--'));
const inks=[[215,132,121],[59,104,99],[196,160,82],[245,239,222]];
const layouts=JSON.parse(fs.readFileSync(path.join(__dirname,'animation-layouts.json'))),noFront=new Set(layouts.noFront);
async function cleanTile(source,cell,canonical=false){
 const m=await sharp(source).metadata(),left=Math.round(cell%4*m.width/4),top=Math.round(Math.floor(cell/4)*m.height/4),right=Math.round((cell%4+1)*m.width/4),bottom=Math.round((Math.floor(cell/4)+1)*m.height/4);
 const pad=canonical?0:2;
 const {data,info}=await sharp(source).extract({left:left+pad,top:top+pad,width:right-left-pad*2,height:bottom-top-pad*2}).resize(384,384).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 // The generator leaves arbitrary RGB in transparent pixels. Remove it before
 // trimming or scaling; otherwise colorful halos contaminate silhouettes.
 for(let p=0;p<data.length;p+=4){if(data[p+3]<150){data.fill(0,p,p+4);continue}let k=3,best=Infinity;for(let j=0;j<4;j++){const c=inks[j],d=(data[p]-c[0])**2+(data[p+1]-c[1])**2+(data[p+2]-c[2])**2;if(d<best){best=d;k=j}}data[p]=inks[k][0];data[p+1]=inks[k][1];data[p+2]=inks[k][2];data[p+3]=255}
 // A few generated atlases have opaque paper despite requesting alpha.
 // Flood only exterior paper, closing tiny outline gaps to preserve white fur.
 const paper=i=>data[i*4+3]&&data[i*4]===245&&data[i*4+1]===239&&data[i*4+2]===222;
 let paperEdge=0;for(let i=0;i<384;i++)paperEdge+=paper(i)+paper(383*384+i)+paper(i*384)+paper(i*384+383);
 if(paperEdge>384){
  const barrier=new Uint8Array(384*384),outside=new Uint8Array(384*384),queue=new Uint32Array(384*384);let h=0,t=0;
  for(let y=0;y<384;y++)for(let x=0;x<384;x++){const i=y*384+x;if(data[i*4+3]&&!paper(i))for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(x+dx>=0&&x+dx<384&&y+dy>=0&&y+dy<384)barrier[(y+dy)*384+x+dx]=1}
  function add(i){if(!barrier[i]&&!outside[i]){outside[i]=1;queue[t++]=i}}
  for(let x=0;x<384;x++){add(x);add(383*384+x)}for(let y=1;y<383;y++){add(y*384);add(y*384+383)}
  while(h<t){const i=queue[h++],x=i%384;if(x)add(i-1);if(x<383)add(i+1);if(i>=384)add(i-384);if(i<384*383)add(i+384)}
  for(let i=0;i<outside.length;i++)if(outside[i])data.fill(0,i*4,i*4+4);
 }
 // Drop isolated specks, retaining all substantial ink and fur components.
 const seen=new Uint8Array(384*384),q=new Uint32Array(384*384),components=[];
 for(let i=0;i<seen.length;i++){if(seen[i]||!data[i*4+3])continue;let h=0,t=0;q[t++]=i;seen[i]=1;while(h<t){const n=q[h++],x=n%384;for(const v of [x?n-1:-1,x<383?n+1:-1,n>=384?n-384:-1,n<384*383?n+384:-1])if(v>=0&&!seen[v]&&data[v*4+3]){seen[v]=1;q[t++]=v}}components.push(q.slice(0,t))}
 const minimum=cell%8>=2?Math.max(10,Math.max(...components.map(c=>c.length),0)*.03):10;
 for(const component of components)if(component.length<minimum)for(const i of component)data.fill(0,i*4,i*4+4);
 let x0=384,y0=384,x1=-1,y1=-1,count=0;
 for(let i=0;i<seen.length;i++)if(data[i*4+3]){const x=i%384,y=i/384|0;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);count++}
 const png=await sharp(data,{raw:{width:384,height:384,channels:4}}).png().toBuffer();
 return {png,bounds:count?{left:x0,top:y0,width:x1-x0+1,height:y1-y0+1}:null,count};
}
async function place(tile,scale,anchorX,baseline){
 if(!tile.bounds)return null;const b=tile.bounds,w=Math.max(1,Math.round(b.width*scale)),h=Math.max(1,Math.round(b.height*scale));
 const input=await sharp(tile.png).extract(b).resize(w,h,{kernel:'nearest'}).png().toBuffer();
 return {input,left:Math.round(anchorX-w/2),top:Math.round(baseline-h)};
}
async function signature(layer){
 const png=await sharp({create:{width:384,height:384,channels:4,background:'#00000000'}}).composite([layer]).png().toBuffer();
 return sharp(png).resize(64,64,{kernel:'nearest'}).ensureAlpha().raw().toBuffer();
}
function registration(reference,current){
 let best=-Infinity,move=[0,0];
 // Register the largest stable body area. This only corrects sprite-sheet
 // placement drift; the different limb/tail drawings remain intact.
 for(let dy=-4;dy<=4;dy++)for(let dx=-5;dx<=5;dx++){
  let overlap=0,union=0,color=0;
  for(let y=4;y<60;y++)for(let x=5;x<59;x++){
   const a=(y*64+x)*4,b=((y-dy)*64+x-dx)*4,aa=reference[a+3]>128,bb=current[b+3]>128;
   if(aa||bb)union++;if(aa&&bb){overlap++;if(reference[a]===current[b]&&reference[a+1]===current[b+1])color++}
  }
  const score=(overlap+color*.3)/(union||1)-.0002*(dx*dx+dy*dy);
  if(score>best){best=score;move=[dx*6,dy*6]}
 }
 return move;
}
async function touchingForepaw(cat){
 // The third authored pose has the left cat reaching across the scarf.
 // Retain that original ink in front of the cloth. This polygon is only an
 // occlusion window; it copies original pixels and never draws another paw.
 const matte=Buffer.from('<svg width="384" height="384"><path fill="white" d="M143 196L157 185L169 179L183 178L193 185L198 194L192 207L171 220L141 224L132 211Z"/></svg>');
 const placed=await sharp({create:{width:384,height:384,channels:4,background:'#00000000'}}).composite([cat]).png().toBuffer();
 const input=await sharp(placed).composite([{input:matte,blend:'dest-in'}]).png().toBuffer();
 return {input,top:0,left:0};
}
async function scarfAcross(tile){
 const width=223,height=49,rise=30;
 const d=await sharp(tile.png).extract(tile.bounds).resize(width,height,{fit:'fill',kernel:'nearest'}).ensureAlpha().raw().toBuffer();
 const output=Buffer.alloc(width*(height+rise)*4);
 for(let x=0;x<width;x++)for(let y=0;y<height;y++){
  const a=(y*width+x)*4,b=((y+Math.round(x*rise/(width-1)))*width+x)*4;
  d.copy(output,b,a,a+4);
 }
 const input=await sharp(output,{raw:{width,height:height+rise,channels:4}}).png().toBuffer();
 return {input,left:79,top:151};
}
async function cleanCushionFringe(cat){
 // Only atlas-74's poses 4–6 carry a torn strip of opaque paper below the
 // paws. Preserve the original ink/pose and its placement, then clear only
 // paper underneath the traced lower edge of that drawing.
 const d=await sharp({create:{width:384,height:384,channels:4,background:'#00000000'}}).composite([cat]).raw().toBuffer();
 const last=new Int16Array(384).fill(224);
 for(let y=224;y<384;y++)for(let x=0;x<384;x++){
  const p=(y*384+x)*4;
  if(d[p+3]&&!(d[p]===245&&d[p+1]===239&&d[p+2]===222))last[x]=y;
 }
 let removed=0;
 for(let x=0;x<384;x++){
  const edge=Math.max(last[x],last[Math.max(0,x-1)],last[Math.min(383,x+1)])+1;
  for(let y=edge+1;y<384;y++){
   const p=(y*384+x)*4;
   if(d[p+3]&&d[p]===245&&d[p+1]===239&&d[p+2]===222){d.fill(0,p,p+4);removed++}
  }
 }
 if(removed<200)throw Error('Expected opaque paper fringe on atlas-74');
 return {input:await sharp(d,{raw:{width:384,height:384,channels:4}}).png().toBuffer(),left:0,top:0};
}
async function build(scene,source,offset){
 const tiles=[];for(let k=0;k<8;k++)tiles.push(await cleanTile(source,offset+k,true));
 const cats=tiles.slice(2);if(cats.some(t=>t.count<300))throw Error('Missing cat pose: '+scene.file);
 const prop=layouts.propPlacement?.[scene.file],poseProp=layouts.poseProp?.[scene.file],poseReg=layouts.poseRegistration?.[scene.file];
 // A single scale for all poses preserves real stretches/limb extensions.
 const scale=Math.min((prop?.catWidth??252)/Math.max(...cats.map(t=>t.bounds.width)),212/Math.max(...cats.map(t=>t.bounds.height)))*(poseReg?.scale??poseProp?.catScale??1);
 let back={input:await sharp(tiles[0].png).resize(324,324,{kernel:'nearest'}).toBuffer(),left:30,top:30};
 // The bell is part of atlas-73 cell 8 (cell 9 is empty). Restore the
 // space between its rim and the resting cat's whiskers without changing
 // the established paw registration. Keep the other native decor in place.
 if(scene.file==='balinese-bell'){
  const raw={width:324,height:324,channels:4},pix=await sharp(back.input).ensureAlpha().raw().toBuffer(),shifted=Buffer.alloc(pix.length);
  for(let y=0;y<203;y++)for(let x=0;x<117;x++){
   const i=(y*324+x)*4;
   if(!pix[i+3])continue;
   const gold=pix[i]===196&&pix[i+1]===160, ivory=pix[i]===245&&pix[i+1]===239;
   const rose=pix[i]===215&&pix[i+1]===132&&y>=23&&x>=35&&x<116&&(y<197||x>=55);
   if(!gold&&!ivory&&!rose)continue;
   if(x<32)throw Error('Unexpected native bell bounds');
   const q=((y+11)*324+x-32)*4;
   pix.copy(shifted,q,i,i+4);pix.fill(0,i,i+4);
   // In rows where both sides of the original hanger are the same
   // branch ink, bridge the gap with a native adjacent branch pixel.
   if(y<33&&x>=70&&x<=80){
    const l=(y*324+x-8)*4,r=(y*324+x+8)*4;
    if(pix[l]===59&&pix[l+3]&&pix[r]===59&&pix[r+3])pix.copy(pix,i,l,l+4);
   }
  }
  const png=await sharp(shifted,{raw}).png().toBuffer();
  back.input=await sharp(pix,{raw}).composite([{input:png}]).png().toBuffer();
 }
 // The canonical atlas has a narrow continuation of these scenes' back
 // art in the next cell; that strip is not an independent foreground prop.
 // Preserve the original 324px back layer and cat registration.
 const backRightOverflow={gift:34,shell:7,lotus:5,'calico-rain':7}[scene.file];
 if(backRightOverflow){
  const w=Math.ceil(backRightOverflow*324/384);
  const rawRight=await sharp(source).extract({
   left:(offset%4+1)*384,top:Math.floor(offset/4)*384,width:backRightOverflow,height:384
  }).resize(w,324,{fit:'fill',kernel:'nearest'}).png().toBuffer();
  const right={input:rawRight,left:354,top:30};
  back={input:await sharp({create:{width:384,height:384,channels:4,background:'#00000000'}})
    .composite([back,right]).png().toBuffer(),left:0,top:0};
 }
 // The original ragdoll print has its upper sprig beside the ear, not behind
 // it. Preserve the lower sprig in place and register only the upper sprig.
 if(scene.file==='ragdoll-knead'){
  const upper=await sharp(back.input).extract({left:0,top:0,width:324,height:202}).resize(260,162,{kernel:'nearest'}).png().toBuffer();
  const lower=await sharp(back.input).extract({left:0,top:202,width:324,height:122}).png().toBuffer();
  back={input:await sharp({create:{width:384,height:384,channels:4,background:'#00000000'}}).composite([{input:upper,left:10,top:25},{input:lower,left:30,top:232}]).png().toBuffer(),left:0,top:0};
 }
 // Keep Lykoi's native mustard sprig clear of the now-visible basket handle.
 if(scene.file==='lykoi-basket'){
  const left=await sharp(back.input).extract({left:0,top:0,width:220,height:324}).png().toBuffer();
  const sprig=await sharp(back.input).extract({left:220,top:85,width:104,height:135}).png().toBuffer();
  back={input:await sharp({create:{width:384,height:384,channels:4,background:'#00000000'}}).composite([{input:left,left:30,top:30},{input:sprig,left:250,top:66}]).png().toBuffer(),left:0,top:0};
 }
 const side=layouts.propSide[scene.file];
 if(poseProp?.sourceCrop){const [left,top,width,height]=poseProp.sourceCrop;tiles[1].bounds={left,top,width,height}}
 let front=null;if(tiles[1].count>200&&!noFront.has(scene.file)){const b=tiles[1].bounds;
  front=poseProp?await place(tiles[1],poseProp.width/b.width,poseProp.x,poseProp.bottom):prop?await place(tiles[1],Math.min(prop.maxWidth/b.width,prop.maxHeight/b.height),prop.anchor,prop.baseline):side?await place(tiles[1],Math.min(106/b.width,128/b.height),side==='left'?78:306,338):b.width>300&&b.height>300?{input:await sharp(tiles[1].png).resize(324,324,{kernel:'nearest'}).toBuffer(),left:30,top:30}:await place(tiles[1],Math.min(268/b.width,128/b.height),192,345);
 }
 // Preserve the source prop for these poses without changing established cat
 // registration. The streamer sits behind the reaching paw; the scarf wraps
 // both necks, so it is placed in front.
 let continuity=null;
 if(scene.file==='american-koinobori'){
  continuity=await place(tiles[1],Math.min(100/tiles[1].bounds.width,168/tiles[1].bounds.height),325,259);
 }
 if(scene.file==='russian-angora-scarf'){
  continuity=await scarfAcross(tiles[1]);
 }
 // The low-stalking pose was registered without the generic foreground
 // branch. Restore its original atlas mouse low and left of all six reaches.
 if(scene.file==='siamese-lowstalk'){
  const t=tiles[1];
  continuity=await place(t,84/t.bounds.width,122,349);
 }
 if(scene.file==='sphynx-listening'){
  continuity=await place(tiles[1],Math.min(256/tiles[1].bounds.width,126/tiles[1].bounds.height),192,313);
 }
 // Reintroduce the authored cushion/rug as static layers, without enabling
 // the generic front-placement branch that would move the authored cat.
 const originalCushion={
  'british-rearloaf':{x:180,bottom:322,maxWidth:250,maxHeight:75},
  'sphynx-lookback':{x:264,bottom:323,maxWidth:155,maxHeight:68},
  'kitten-trio':{x:192,bottom:364,maxWidth:270,maxHeight:86}
 }[scene.file];
 if(originalCushion){
  const t=tiles[1],o=originalCushion;
  continuity=await place(t,Math.min(o.maxWidth/t.bounds.width,o.maxHeight/t.bounds.height),o.x,o.bottom);
 }
 // The backdrop already contains the pincushion, two spools and loose
 // thread from the sewing scene. Keep the authored basket at its existing
 // registration but omit only the overlapping foreground copies.
 if(scene.file==='ragamuffin-sewing'){
  const matte=Buffer.from('<svg width="384" height="384"><path shape-rendering="crispEdges" fill="white" d="M64 0H383V225L328 226L316 232L305 239L302 249L302 255L308 260L310 269L290 266L274 266L258 270L252 280L259 294L258 315L235 320L201 318L190 321L152 323L120 323L115 316L106 306L92 296L77 289L62 286L62 272L59 256L53 238L43 223L32 162L0 149V0Z"/></svg>');
  const basket=await sharp(tiles[1].png).composite([{input:matte,blend:'dest-in'}]).png().toBuffer();
  back=null; // Background already provides both native flower shapes.
  front={...front,input:await sharp(basket).resize(324,324,{kernel:'nearest'}).png().toBuffer()};
 }
 const drawnFront=backRightOverflow?null:front;
 const floor=/(book|yarn|mat|blanket|knead|stretch|roll|sleep|olive|feather|quilt|circle|rug|carpet|bench|chair|bed)/.test(scene.file);
 const baseline=poseReg?.baseline??poseProp?.catBaseline??(prop?prop.catBaseline:side?292:front?(floor?270:274):294),anchor=poseReg?.x??prop?.catAnchor??poseProp?.catX??(side?(side==='left'?226:158):192),frames=[],catLayers=[];let reference=null;
 for(let k=0;k<6;k++){
  const cat=await place(cats[k],scale,anchor,baseline),sig=await signature(cat);
  if(!reference)reference=sig;else{const [dx,dy]=registration(reference,sig);cat.left+=dx;cat.top+=dy}
  // Keep articulated forelegs visible above container rims. Tall props such
  // as sewing boxes otherwise hide the entire cat with a generic placement.
  const touching=scene.file==='russian-angora-scarf'&&k===2?await touchingForepaw(cat):null;
  const finalCat=scene.file==='himalayan-cushion'&&k>=3?await cleanCushionFringe(cat):cat;
  const layers=scene.file==='russian-angora-scarf'?[back,drawnFront,cat,continuity,touching]:poseProp?.frontOfCat?[back,cat,drawnFront]:[back,drawnFront,continuity,finalCat];
  const frame=await sharp({create:{width:384,height:384,channels:4,background:'#00000000'}}).composite(layers.filter(Boolean)).png().toBuffer();frames.push(frame);
  catLayers.push(await sharp({create:{width:384,height:384,channels:4,background:'#00000000'}}).composite([finalCat]).png().toBuffer());
 }
 const dir=path.join(root,'art/animation');fs.mkdirSync(dir,{recursive:true});
 await sharp({create:{width:1152,height:768,channels:4,background:'#00000000'}}).composite(frames.map((input,i)=>({input,left:i%3*384,top:Math.floor(i/3)*384}))).webp({lossless:true,effort:6}).toFile(path.join(dir,scene.file+'.webp'));
 // The union of actual cat silhouettes lets QA prove that background and
 // prop pixels outside the cat remain byte-identical across every pose.
 const mask=Buffer.alloc(384*384);for(const cat of catLayers){const d=await sharp(cat).ensureAlpha().raw().toBuffer();for(let i=0;i<mask.length;i++)if(d[i*4+3])mask[i]=255}
 fs.mkdirSync(path.join(dir,'masks'),{recursive:true});await sharp(mask,{raw:{width:384,height:384,channels:1}}).png().toFile(path.join(dir,'masks',scene.file+'.png'));
 return {file:scene.file,frames:6,source:path.basename(source),catPixels:mask.reduce((n,a)=>n+(a>0),0),front:!!(drawnFront||continuity),floor};
}
// This scene has a hand-authored grounded reach whose composition is not in
// atlas-75. Keep that atlas intact for its second scene, somali-birdhouse.
async function restoreSingapura(dir){
 const plates=path.join(dir,'sources','singapura-stool'),sprite=path.join(plates,'poses.webp'),mask=path.join(plates,'cat-mask.png');
 fs.mkdirSync(path.join(dir,'masks'),{recursive:true});
 fs.copyFileSync(sprite,path.join(dir,'singapura-stool.webp'));
 fs.copyFileSync(mask,path.join(dir,'masks','singapura-stool.png'));
 const bits=await sharp(mask).greyscale().raw().toBuffer();
 return {file:'singapura-stool',frames:6,source:'singapura-stool/poses.webp',catPixels:bits.reduce((n,a)=>n+(a>0),0),front:true,floor:true};
}
async function main(){
 const scenes=JSON.parse(fs.readFileSync(scratch?path.join(scratch,'scenes.json'):path.join(root,'art/catalog.json'))),byFile=new Map(scenes.map(s=>[s.file,s]));let manifest=[];
 const dir=path.join(root,'art/animation'),sources=path.join(dir,'sources');fs.mkdirSync(sources,{recursive:true});
 const jobs=scratch?fs.readdirSync(scratch).filter(f=>/^job-\d+\.json$/.test(f)).sort().map(f=>JSON.parse(fs.readFileSync(path.join(scratch,f)))):JSON.parse(fs.readFileSync(path.join(dir,'jobs.json')));
 const canonicalJobs=[];
 for(const j of jobs){
  const atlas='atlas-'+String(j.job).padStart(2,'0')+'.webp',source=path.join(sources,atlas);
  if(!fs.existsSync(source)){
   const tiles=[];for(let i=0;i<16;i++)tiles.push({input:(await cleanTile(j.source,i)).png,left:i%4*384,top:Math.floor(i/4)*384});
   await sharp({create:{width:1536,height:1536,channels:4,background:'#00000000'}}).composite(tiles).webp({lossless:true,effort:6}).toFile(source);
  }
  canonicalJobs.push({job:j.job,files:j.files,atlas,generatedSource:j.generatedSource||path.basename(j.source)});
  for(let k=0;k<j.files.length;k++){
   const scene=byFile.get(j.files[k]);if(!scene)throw Error('Unknown scene '+j.files[k]);
   const output=path.join(dir,scene.file+'.webp'),authored=!scratch&&scene.file==='singapura-stool';
   const complete=fs.existsSync(output)&&(!authored||fs.existsSync(path.join(dir,'masks',scene.file+'.png')));
   if(complete&&!process.argv.includes('--rebuild'))continue;
   manifest.push(authored?await restoreSingapura(dir):await build(scene,source,k*8));console.log(scene.file);
  }
 }
 fs.writeFileSync(path.join(dir,'jobs.json'),JSON.stringify(canonicalJobs,null,2)+'\n');
 const file=path.join(root,'art/animation/catalog.json'),old=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):[];const combined=new Map(old.map(x=>[x.file,x]));for(const item of manifest)combined.set(item.file,item);fs.writeFileSync(file,JSON.stringify([...combined.values()],null,2)+'\n');
}
main().catch(e=>{console.error(e);process.exitCode=1});
