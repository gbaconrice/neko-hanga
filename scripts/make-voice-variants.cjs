/* Rebuild successful-print recordings. Requires ffmpeg only at authoring time. */
'use strict';
const {spawnSync}=require('node:child_process'),fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
if(process.argv.length!==3)throw Error('Download the published originals following sounds/README.md and pass their local directory.');
const root=path.join(__dirname,'..','sounds'), sourceDir=path.resolve(process.argv[2]);
const takes=[
 {source:'cat-cry1.mp3',name:'cat-clear.mp3',sha:'dc3655e0c1e9c7d68800d3330ec21443b14a95346f308cc86c3323db4e737a2a',
  filter:'atrim=end=0.84,asetpts=PTS-STARTPTS,afade=t=in:d=0.015,afade=t=out:st=0.75:d=0.09,volume=0.78'},
 {source:'cat-cry3.mp3',name:'cat-murmur.mp3',sha:'41cdeae069d75a85cac9b5950e0f8e3ada0278507f60116456ce3eefb06d0630',
  filter:'atrim=end=1.94,asetpts=PTS-STARTPTS,atempo=1.55,afade=t=in:d=0.018,afade=t=out:st=1.02:d=0.25,volume=0.61'}
];
for(const take of takes){
 const source=path.join(sourceDir,take.source);
 const actual=crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
 if(actual!==take.sha)throw Error('Unexpected source bytes: '+take.source);
}
for(const take of takes){
 const source=path.join(sourceDir,take.source),out=path.join(root,take.name);
 const r=spawnSync('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-y','-i',source,'-af',take.filter,'-map_metadata','-1','-ac','1','-ar','44100','-b:a','56k',out],{stdio:'inherit'});
 if(r.error)throw r.error;
 if(r.status!==0)throw Error('Could not generate '+out);
}
