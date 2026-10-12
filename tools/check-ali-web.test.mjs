import test from 'node:test';
import assert from 'node:assert/strict';
import {AliCloud} from '../runtime/ali-driver-bundle.mjs';
test('Ali web-only login uses web media endpoints without requiring Open credentials',async()=>{
 const calls=[];
 const c=new AliCloud({accessToken:'web-fixture',driveId:'drive-fixture'},{request:async(url,options)=>{
  calls.push(url);assert.equal(options.headers.Authorization,'Bearer web-fixture');assert.ok(!url.includes('openapi'));
  return {content:JSON.stringify(url.includes('get_download_url')?{url:'https://media.example.test/movie.mp4'}:{video_preview_play_info:{live_transcoding_task_list:[{status:'finished',template_id:'HD',url:'https://media.example.test/movie.m3u8'}]}})};
 }});
 c.transfer=async()=> 'saved-fixture';
 c.deviceHeaders=async()=>({'X-Signature':'device-fixture'});
 const original=await c.play({},{});assert.match(original.url,/mp4$/);
 const preview=await c.play({}, {},'auto');assert.equal(preview.quality,'HD');assert.equal(calls.length,2);
});
