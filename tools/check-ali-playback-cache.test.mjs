import test from 'node:test';import assert from 'node:assert/strict';
import {createAliPlayback} from '../runtime/ali-playback.mjs';
test('media redirect authorization uses the current unified account without returning it as playback metadata',async()=>{
 let secret={access_token:'fixture-first'},requests=0;
 const playback=createAliPlayback({credentials:async()=>secret,persist:async()=>{},request:async()=>{requests++;throw Error('unexpected network');}});
 assert.equal(await playback.mediaAuthorization(),'Bearer fixture-first');
 secret={access_token:'fixture-updated'};
 assert.equal(await playback.mediaAuthorization(),'Bearer fixture-updated');
 assert.equal(requests,0);
});
test('阿里驱动保存自己补全的driveId后保留目录与转存缓存，外部授权变化仍失效',async()=>{
 let secret={refresh_token:'fixture-refresh',access_token:'fixture-access'},saved=0;const calls=new Map();
 const playback=createAliPlayback({credentials:async()=>({...secret}),persist:async value=>{saved++;secret={refresh_token:value.refreshToken,access_token:value.accessToken,driveId:value.driveId};},request:async url=>{const path=new URL(url).pathname;calls.set(path,(calls.get(path)||0)+1);let data;
 if(path.endsWith('get_share_token'))data={share_token:'fixture-share'};
 else if(path.endsWith('list_by_share'))data={items:[{file_id:'video',name:'clip.mp4',category:'video'}]};
 else if(path.endsWith('/user/get'))data={resource_drive_id:'drive'};
 else if(path.endsWith('/file/list'))data={items:[{type:'folder',name:'OKbox-CAT',file_id:'folder'}]};
 else if(path.endsWith('/batch'))data={responses:[{status:200,body:{file_id:'copied'}}]};
 else if(path.endsWith('get_video_preview_play_info'))data={video_preview_play_info:{live_transcoding_task_list:[{status:'finished',template_id:'HD',url:'https://media.example/clip.m3u8'}]}};
 else throw Error('unexpected fixture endpoint '+path);return {content:JSON.stringify(data)};}});
 const d=await playback.detail('https://www.alipan.com/s/fixtureShare');const group=d.list[0].vod_play_url.split('$$$')[1],id=group.slice(group.indexOf('$')+1);
 const a=await playback.play(id),b=await playback.play(id);assert.equal(a.url,b.url);assert.equal(saved,1);assert.equal(calls.get('/adrive/v2/file/list_by_share'),1);assert.equal(calls.get('/adrive/v2/batch'),1);assert.equal(calls.get('/v2/file/get_video_preview_play_info'),1);
 secret.access_token='external-replacement';await playback.detail('https://www.alipan.com/s/fixtureShare');assert.equal(calls.get('/adrive/v2/file/list_by_share'),2);
});
