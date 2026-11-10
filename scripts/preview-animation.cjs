const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),sharp=require('sharp'),{execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..'),name=process.argv[2]||'tea',out=path.resolve(process.argv[3]||os.tmpdir());
if(!/^[a-z0-9-]+$/.test(name))throw Error('Invalid art name');
(async()=>{
 fs.mkdirSync(out,{recursive:true});const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'neko-frames-')),durations=[.26,.12,.14,.22,.16,.18],list=[];
 for(let i=0;i<6;i++){
  const fg=await sharp(path.join(root,'art/animation',name+'.webp')).extract({left:i%3*384,top:Math.floor(i/3)*384,width:384,height:384}).toBuffer(),file=path.join(tmp,i+'.png');
  await sharp(path.join(root,'art/finish',name+'.webp')).composite([{input:fg}]).png().toFile(file);list.push("file '"+file+"'",'duration '+durations[i]);
 }
 list.push("file '"+path.join(tmp,'5.png')+"'");fs.writeFileSync(path.join(tmp,'frames.txt'),list.join('\n'));
 const file=path.join(out,name+'.gif');execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',path.join(tmp,'frames.txt'),'-vf','split[a][b];[a]palettegen=stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a','-loop','0',file]);
 fs.rmSync(tmp,{recursive:true,force:true});console.log(file);
})().catch(e=>{console.error(e);process.exitCode=1});
