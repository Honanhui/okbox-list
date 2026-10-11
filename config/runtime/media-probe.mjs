import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
const cache=new Map();
export async function probeMedia(entry,kind){
 const key=JSON.stringify([entry.url,entry.headers]);
 const cached=cache.get(key);if(cached&&cached.until>Date.now())return cached.value;
 const args=['-v','error','-rw_timeout','5000000','-probesize','1048576','-analyzeduration','2000000'];
 if(kind==='hls')args.push('-allowed_extensions','ALL','-extension_picky','0');
 const headers=Object.entries(entry.headers||{}).filter(([k,v])=>!/[\r\n]/.test(k+v)).map(([k,v])=>`${k}: ${v}\r\n`).join('');
 if(headers)args.push('-headers',headers);
 args.push('-show_streams','-show_format','-of','json',entry.url);
 let value={kind,confidence:'low'};
 try{
  const {stdout}=await run('ffprobe',args,{timeout:8000,maxBuffer:1024*1024,windowsHide:true});
  const data=JSON.parse(stdout),video=data.streams?.find(s=>s.codec_type==='video'),audio=data.streams?.find(s=>s.codec_type==='audio');
  if(video){value.videoCodec=video.codec_name;for(const field of ['width','height'])if(video[field]>0)value[field]=Number(video[field]);if(Number(video.bit_rate)>0)value.videoBitrate=Number(video.bit_rate);const [n,d]=String(video.avg_frame_rate||'0/1').split('/').map(Number);if(d&&n)value.frameRate=n/d;}
  if(audio){value.audioCodec=audio.codec_name;if(audio.channels>0)value.audioChannels=Number(audio.channels);if(Number(audio.sample_rate)>0)value.audioSampleRate=Number(audio.sample_rate);}
  if(video||audio)value.confidence='high';
 }catch{/* Do not log URLs, HTTP headers or provider credentials. */}
 if(cache.size>=128)cache.delete(cache.keys().next().value);
 cache.set(key,{until:Date.now()+(value.confidence==='high'?300000:10000),value});return value;
}
