import test from 'node:test';
import assert from 'node:assert/strict';
import {retryDelay,refreshDue} from '../runtime/subscription-retry.mjs';
test('failed cached subscription retries before normal refresh, with bounded backoff',()=>{
  const now=Date.now(),status={state:'stale',fetchedAt:new Date(now).toISOString(),nextRetryAt:now+30000};
  assert.equal(refreshDue(status,now+29999,60),false);
  assert.equal(refreshDue(status,now+30000,60),true);
  assert.equal(retryDelay(2),60000);
  assert.equal(retryDelay(20),300000);
  assert.equal(refreshDue({...status,state:'refreshing'},now+999999,60),false);
  assert.equal(refreshDue({...status,state:'ok'},now+30000,60),false);
});
