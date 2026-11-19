// Canonical frame-by-frame repairs that cannot be rebuilt from the old atlases.
const fs=require('node:fs'),path=require('node:path');

function readAuthoredAnimations(dir, scenes){
 const sources=path.join(dir,'sources');
 const entries=JSON.parse(fs.readFileSync(path.join(sources,'authored.json')));
 const authored=new Map();
 for(const entry of entries){
  const {file}=entry;
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(file)||!scenes.has(file)||authored.has(file)){
   throw Error('Invalid or duplicate authored animation: '+file);
  }
  const pair=path.join(sources,file),sprite=path.join(pair,'poses.webp'),mask=path.join(pair,'cat-mask.png');
  for(const member of [sprite,mask])if(!fs.statSync(member,{throwIfNoEntry:false})?.isFile()){
   throw Error('Missing authored animation source: '+path.relative(dir,member));
  }
  authored.set(file,{entry,sprite,mask});
 }
 return authored;
}

function restoreAuthoredAnimation(dir,{entry,sprite,mask}){
 const masks=path.join(dir,'masks');
 fs.mkdirSync(masks,{recursive:true});
 fs.copyFileSync(sprite,path.join(dir,entry.file+'.webp'));
 fs.copyFileSync(mask,path.join(masks,entry.file+'.png'));
 // The mask may include moving paint outside the original cat pixel count.
 // Preserve the reviewed catalog entry rather than deriving new metadata.
 return entry;
}

module.exports={readAuthoredAnimations,restoreAuthoredAnimation};
