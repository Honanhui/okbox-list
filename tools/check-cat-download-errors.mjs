import assert from 'node:assert/strict';
import {catDownloadError} from '../runtime/cat-download-errors.mjs';
assert.match(catDownloadError({message:'fetch failed',cause:{code:'ENOTFOUND'}}),/DNS/);
assert.match(catDownloadError({message:'fetch failed',cause:{errors:[{code:'UND_ERR_CONNECT_TIMEOUT'}]}}),/20 秒/);
assert.match(catDownloadError({message:'fetch failed',cause:{code:'UNABLE_TO_VERIFY_LEAF_SIGNATURE'}}),/证书/);
assert.match(catDownloadError({message:'订阅下载 HTTP 404'}),/HTTP 404/);
assert.equal(catDownloadError({message:'Invalid URL https://user:secret@example.com/index.js'}).includes('secret'),false);
assert.equal(catDownloadError({message:'Failed https://user:secret@example.com/index.js'}).includes('secret'),false);
console.log('PASS: DNS, timeout, TLS and HTTP errors remain distinct; credential URLs are not exposed');
