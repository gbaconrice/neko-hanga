/* Import a generated 3×3 atlas and build the self-contained GRAVITY HTML.
   node scripts/build-art.cjs --import /path/to/atlas.png 0
   node scripts/build-art.cjs --import /path/to/second-atlas.png 9
   node scripts/build-art.cjs --embed
   Requires sharp (npm install --no-save sharp). Original atlases are never modified. */
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const root=path.join(__dirname,'..'),htmlPath=path.join(root,'index.html');
const inks=[[215,132,121],[59,104,99],[196,160,82],[245,239,222]];
const files=['tea','picnic','hydrangea','book','umbrella','moon','tulip','yarn','boat','cake','mushroom','sunflower','gift','window','rocking-horse','olive','shell','garden'];
async function main(){
  if(process.argv[2]==='--import'){
    const input=process.argv[3],offset=Number(process.argv[4]);
    if(!input||!Number.isInteger(offset)||offset<0||offset+9>files.length)throw new Error('Offset must select nine entries in files');
    const meta=await sharp(input).metadata();
    for(let i=0;i<9;i++){
      // Trim the atlas rules at the tile boundary; no parts of neighbouring tiles.
      const left=Math.round((i%3)*meta.width/3)+3,top=Math.round(Math.floor(i/3)*meta.height/3)+3;
      const right=Math.round((i%3+1)*meta.width/3)-3,bottom=Math.round((Math.floor(i/3)+1)*meta.height/3)-3;
      const {data,info}=await sharp(input).extract({left,top,width:right-left,height:bottom-top}).resize(512,512).removeAlpha().raw().toBuffer({resolveWithObject:true});
      const output=Buffer.alloc(512*512*3),counts=[0,0,0,0];
      for(let p=0;p<data.length;p+=info.channels){
        let min=Infinity,k=3;
        for(let j=0;j<4;j++){
          const q=inks[j],d=(data[p]-q[0])**2+(data[p+1]-q[1])**2+(data[p+2]-q[2])**2;
          if(d<min){min=d;k=j;}
        }
        const n=p/info.channels*3;output[n]=inks[k][0];output[n+1]=inks[k][1];output[n+2]=inks[k][2];counts[k]++;
      }
      if(counts.some(c=>c<256))throw new Error('Missing ink or paper in '+files[offset+i]);
      await sharp(output,{raw:{width:512,height:512,channels:3}}).png({palette:true,colours:4,dither:0}).toFile(path.join(root,'art',files[offset+i]+'.png'));
      console.log(files[offset+i],counts);
    }
  }else if(process.argv[2]!=='--embed')throw new Error('Choose --import or --embed');
  if(files.every(n=>fs.existsSync(path.join(root,'art',n+'.png')))){
    const images=files.map(n=>'data:image/png;base64,'+fs.readFileSync(path.join(root,'art',n+'.png')).toString('base64'));
    const sound='data:audio/mpeg;base64,'+fs.readFileSync(path.join(root,'sounds/cat-soft.mp3')).toString('base64');
    let html=fs.readFileSync(htmlPath,'utf8');
    html=html.replace(/\/\* ART_DATA_START \*\/[\s\S]*?\/\* ART_DATA_END \*\//,()=> '/* ART_DATA_START */\nvar ART_DATA='+JSON.stringify(images)+';\n/* ART_DATA_END */');
    html=html.replace(/\/\* AUDIO_DATA_START \*\/[\s\S]*?\/\* AUDIO_DATA_END \*\//,()=> '/* AUDIO_DATA_START */\nvar CAT_AUDIO='+JSON.stringify(sound)+';\n/* AUDIO_DATA_END */');
    fs.writeFileSync(htmlPath,html);console.log('Embedded 18 artworks and one voice:',Buffer.byteLength(html),'bytes');
  }
}
main().catch(e=>{console.error(e);process.exitCode=1});
