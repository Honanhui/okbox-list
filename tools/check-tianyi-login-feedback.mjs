import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const start=html.indexOf('async function loginTianyi('),end=html.indexOf('\n',start);
for(const state of ['valid','verify','invalid']){
 const calls=[],messages=[];let dialogs=0;
 const c={cloud:{accounts:[]},hide(){},show:(id,message)=>messages.push({id,message}),accountRows(){},openTianyiVerification(){dialogs++},async api(path,body){calls.push(body);return {state,message:'fixture',...(state==='verify'?{verificationType:'tianyi-sms'}:{})};}};
 vm.createContext(c);vm.runInContext(html.slice(start,end),c);const button={textContent:'登录 / 验证',disabled:false,isConnected:true};await c.loginTianyi('fixture',button);
 assert.equal(calls.length,1);assert.equal(calls[0].action,'login');assert.equal(button.disabled,false);
 assert.equal(dialogs,state==='verify'?1:0);
 if(state==='valid')assert.ok(messages.some(x=>x.id==='cloudNotice'&&x.message.includes('无需短信验证')));
 if(state==='invalid')assert.ok(messages.some(x=>x.id==='cloudError'));
}
console.log('PASS: valid login has feedback, only challenged login opens SMS dialog, button never sends SMS');
{
 const offset=html.indexOf('async function validateAccount('),calls=[];let dialogs=0;
 const c={cloud:{accounts:[]},show(){},accountRows(){},openTianyiVerification(){dialogs++},window:{open(){throw Error('check opened browser');}},async api(path,body){calls.push(body);return {verificationType:'tianyi-sms',accounts:[{id:'fixture',state:'verify'}]};}};
 vm.createContext(c);vm.runInContext(html.slice(offset,html.indexOf('\n',offset)),c);
 await c.validateAccount('fixture',{textContent:'检查',isConnected:true});
 assert.equal(calls.length,1);assert.equal(calls[0].action,'validate');assert.equal(dialogs,0);
 console.log('PASS: check never opens SMS dialog or requests login/send, even for a legacy challenge reply');
}
