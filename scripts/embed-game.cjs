/* Embed the authored-frame edition. No external image requests are required. */
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),html=path.join(root,'index.html');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'art/catalog.json')));
const uri=(file,type)=>'data:'+type+';base64,'+fs.readFileSync(path.join(root,file)).toString('base64');
const art=[],finish=[],animation=[];
for(const w of catalog){
 art.push(uri('art/'+w.file+'.png','image/png'));
 finish.push(uri('art/finish/'+w.file+'.webp','image/webp'));
 animation.push(uri('art/animation/'+w.file+'.webp','image/webp'));
}
let source=fs.readFileSync(html,'utf8');
// Retain the shipped sounds inside index.html. The audio source files are not
// needed to rebuild the artwork, and are not distributed standalone.
for(const name of ['AUDIO_DATA','VOICE_VARIANTS']){
 const pattern=new RegExp('/\\* '+name+'_START \\*/[\\s\\S]*?/\\* '+name+'_END \\*/','g');
 if([...source.matchAll(pattern)].length!==1)throw Error('Missing or ambiguous embedded audio block '+name);
}
for(const [name,body]of Object.entries({WORKS:'var W='+JSON.stringify(catalog)+';',ART_DATA:'var ART_DATA='+JSON.stringify(art)+';',FINISH_DATA:'var FINISH_DATA='+JSON.stringify(finish)+',ANIMATION_DATA='+JSON.stringify(animation)+';'})){
 const pattern=new RegExp('/\\* '+name+'_START \\*/[\\s\\S]*?/\\* '+name+'_END \\*/');
 if(!pattern.test(source))throw Error('Missing embedded block '+name);
 source=source.replace(pattern,()=>`/* ${name}_START */\n${body}\n/* ${name}_END */`);
}
fs.writeFileSync(html,source);console.log('Embedded',catalog.length,'works:',Buffer.byteLength(source),'bytes');
