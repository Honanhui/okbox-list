import assert from 'node:assert/strict';
import {isCatSetupSite} from '../runtime/cat-source-policy.mjs';
for(const key of ['nodejs_baseset','nodejs_mypan']){assert.equal(isCatSetupSite({key,runtime:'cat-node'}),true);assert.equal(isCatSetupSite({key:'warehouse:'+key,rawKey:key,runtime:'cat-node'}),true);}
for(const key of ['nodejs_douban','nodejs_wogg','nodejs_baseset_movie'])assert.equal(isCatSetupSite({key,runtime:'cat-node'}),false);
console.log('PASS: setup pages hidden, media sites retained, cached warehouse keys supported');
