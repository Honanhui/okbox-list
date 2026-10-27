import test from 'node:test';
import assert from 'node:assert/strict';
import {mediaClientResult} from '../runtime/media-client-result.mjs';

test('media credentials stay with upstream fetch while clients receive only the proxy contract',()=>{
 const credentials=Object.freeze({Cookie:'private-cookie-fixture',Authorization:'Bearer private-auth-fixture',Referer:'https://provider.test/'});
 const source=Object.freeze({parse:1,jx:1,url:'https://cdn.test/movie?private-signature-fixture',header:credentials,headers:credentials,quality:'HD',mediaTransform:'hls-ts'});
 const result=mediaClientResult(source,'http://server.test/api/media?token=opaque-proxy-capability');
 const serialized=JSON.stringify(result);for(const secret of ['private-cookie-fixture','private-auth-fixture','private-signature-fixture'])assert(!serialized.includes(secret));
 assert.equal(result.streamUrl,'http://server.test/api/media?token=opaque-proxy-capability');assert.equal(result.url,'');assert.equal(result.quality,'HD');assert.equal(result.parse,0);assert.equal(result.jx,0);
 assert.equal(source.header,credentials);assert.equal(source.header.Cookie,'private-cookie-fixture');assert.equal(source.mediaTransform,'hls-ts');
});

test('legacy top-level credential header fields cannot escape through player metadata',()=>{
 const result=mediaClientResult({Header:{Cookie:'secret'},HEADERS:{Cookie:'secret'},Cookie:'secret',Authorization:'secret','Proxy-Authorization':'secret',quality:'original'},'https://server.test/media');
 assert(!JSON.stringify(result).includes('secret'));assert.equal(result.quality,'original');assert.throws(()=>mediaClientResult(null,'https://server.test/media'));
});
