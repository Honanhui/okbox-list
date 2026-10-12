import assert from 'node:assert/strict';
import {CloudHost} from '../runtime/cloud-host.mjs';
const host=new CloudHost('/tmp/credential-roundtrip');
try{
 await host.call({action:'save',provider:'mobile139',values:{token:'synthetic-basic',account:'synthetic-account',auth_token:'synthetic-auth',userDomainId:'synthetic-domain',loginData:{account:'synthetic-account',token:'synthetic-auth',userDomainId:'synthetic-domain'}}});
 const mobile=await host.call({action:'credentials',provider:'mobile139'});assert.equal(mobile.account,'synthetic-account');assert.equal(mobile.auth_token,'synthetic-auth');assert.equal(mobile.userDomainId,'synthetic-domain');assert.equal(mobile.loginData.token,'synthetic-auth');
 await host.call({action:'save',provider:'thunder',values:{access_token:'synthetic-access',refresh_token:'synthetic-refresh',device_id:'synthetic-device',oauth_client_id:'synthetic-client',expires_in:7200,user_id:'synthetic-user',token_type:'Bearer'}});
 const thunder=await host.call({action:'credentials',provider:'thunder'});assert.equal(thunder.expires_in,7200);assert.equal(thunder.token_type,'Bearer');assert.equal(thunder.user_id,'synthetic-user');

 console.log('PASS: encrypted Mobile session and Thunder OAuth metadata survive account storage');
}finally{host.close();}
