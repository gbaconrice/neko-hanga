/* Import 3×3 atlases, prepare the three inks and embed the complete game.
   node scripts/build-art.cjs --import atlas.png 18
   node scripts/build-art.cjs --background border-atlas.png 18
   node scripts/build-art.cjs --embed
   npm install --no-save sharp */
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const root=path.join(__dirname,'..'),htmlPath=path.join(root,'index.html');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'art/catalog.json'),'utf8'));
const files=catalog.map(w=>w.file),inks=[[215,132,121],[59,104,99],[196,160,82],[245,239,222]];
// Close tiny outline gaps before flooding exterior paper. This preserves the
// cat's ivory body when its surroundings are added, without a rectangular mask.
async function paperShape(file){
 const {data,info}=await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const s=info.width,n=s*s,d=new Uint16Array(n);d.fill(8192);
 for(let i=0;i<n;i++)if(data[i*info.channels]!==245||data[i*info.channels+1]!==239||data[i*info.channels+2]!==222)d[i]=0;
 for(let y=0;y<s;y++)for(let x=0;x<s;x++){let i=y*s+x;if(x)d[i]=Math.min(d[i],d[i-1]+1);if(y)d[i]=Math.min(d[i],d[i-s]+1)}
 for(let y=s-1;y>=0;y--)for(let x=s-1;x>=0;x--){let i=y*s+x;if(x<s-1)d[i]=Math.min(d[i],d[i+1]+1);if(y<s-1)d[i]=Math.min(d[i],d[i+s]+1)}
 const outside=new Uint8Array(n),queue=new Uint32Array(n);let head=0,tail=0;
 function add(i){if(!outside[i]&&d[i]>4){outside[i]=1;queue[tail++]=i}}
 for(let x=0;x<s;x++){add(x);add((s-1)*s+x)}for(let y=1;y<s-1;y++){add(y*s);add(y*s+s-1)}
 while(head<tail){let i=queue[head++],x=i%s;if(x)add(i-1);if(x<s-1)add(i+1);if(i>=s)add(i-s);if(i<n-s)add(i+s)}
 const rgba=Buffer.alloc(n*4);
 for(let i=0;i<n;i++)if(!outside[i]){rgba[i*4]=245;rgba[i*4+1]=239;rgba[i*4+2]=222;rgba[i*4+3]=255}
 return sharp(rgba,{raw:{width:s,height:s,channels:4}}).resize(256,256,{kernel:'nearest'}).png({palette:true,colours:2,dither:0,compressionLevel:9}).toBuffer();
}
async function main(){
 fs.mkdirSync(path.join(root,'art/finish'),{recursive:true});fs.mkdirSync(path.join(root,'art/shapes'),{recursive:true});
 const mode=process.argv[2];
 if(mode==='--import'||mode==='--background'){
  const input=process.argv[3],offset=Number(process.argv[4]);
  if(!input||!Number.isInteger(offset)||offset<0||offset+9>files.length)throw Error('Offset must select nine catalog entries');
  const meta=await sharp(input).metadata();
  for(let i=0;i<9;i++){
   const left=Math.round(i%3*meta.width/3)+3,top=Math.round(Math.floor(i/3)*meta.height/3)+3;
   const width=Math.round((i%3+1)*meta.width/3)-3-left,height=Math.round((Math.floor(i/3)+1)*meta.height/3)-3-top;
   const tile=sharp(input).extract({left,top,width,height});
   if(mode==='--background'){
    await tile.resize(384,384).webp({quality:85}).toFile(path.join(root,'art/finish',files[offset+i]+'.webp'));continue;
   }
   const {data,info}=await tile.resize(512,512).removeAlpha().raw().toBuffer({resolveWithObject:true});
   const out=Buffer.alloc(512*512*3),counts=[0,0,0,0];
   for(let p=0;p<data.length;p+=info.channels){let min=Infinity,k=3;
    for(let j=0;j<4;j++){const q=inks[j],d=(data[p]-q[0])**2+(data[p+1]-q[1])**2+(data[p+2]-q[2])**2;if(d<min){min=d;k=j}}
    const n=p/info.channels*3;out[n]=inks[k][0];out[n+1]=inks[k][1];out[n+2]=inks[k][2];counts[k]++;
   }
   if(counts.some(c=>c<256))throw Error('Missing ink in '+files[offset+i]);
   await sharp(out,{raw:{width:512,height:512,channels:3}}).png({palette:true,colours:4,dither:0}).toFile(path.join(root,'art',files[offset+i]+'.png'));
   console.log(files[offset+i],counts);
  }
 }else if(mode!=='--embed')throw Error('Choose --import, --background or --embed');
 if(mode!=='--embed')return;
 const images=[],backgrounds=[],shapes=[];
 for(const n of files){
  const art=path.join(root,'art',n+'.png');
  images.push('data:image/png;base64,'+fs.readFileSync(art).toString('base64'));
  backgrounds.push('data:image/webp;base64,'+fs.readFileSync(path.join(root,'art/finish',n+'.webp')).toString('base64'));
  const shape=await paperShape(art);fs.writeFileSync(path.join(root,'art/shapes',n+'.png'),shape);shapes.push('data:image/png;base64,'+shape.toString('base64'));
 }
 const sound='data:audio/mpeg;base64,'+fs.readFileSync(path.join(root,'sounds/cat-soft.mp3')).toString('base64');
 let html=fs.readFileSync(htmlPath,'utf8');
 html=html.replace(/\/\* WORKS_START \*\/[\s\S]*?\/\* WORKS_END \*\//,()=> '/* WORKS_START */\nvar W='+JSON.stringify(catalog)+';\n/* WORKS_END */');
 html=html.replace(/\/\* ART_DATA_START \*\/[\s\S]*?\/\* ART_DATA_END \*\//,()=> '/* ART_DATA_START */\nvar ART_DATA='+JSON.stringify(images)+';\n/* ART_DATA_END */');
 html=html.replace(/\/\* FINISH_DATA_START \*\/[\s\S]*?\/\* FINISH_DATA_END \*\//,()=> '/* FINISH_DATA_START */\nvar FINISH_DATA='+JSON.stringify(backgrounds)+',SHAPE_DATA='+JSON.stringify(shapes)+';\n/* FINISH_DATA_END */');
 html=html.replace(/\/\* AUDIO_DATA_START \*\/[\s\S]*?\/\* AUDIO_DATA_END \*\//,()=> '/* AUDIO_DATA_START */\nvar CAT_AUDIO='+JSON.stringify(sound)+';\n/* AUDIO_DATA_END */');
 fs.writeFileSync(htmlPath,html);console.log('Embedded',files.length,'paired works, backgrounds and one voice:',Buffer.byteLength(html),'bytes');
}
main().catch(e=>{console.error(e);process.exitCode=1});
