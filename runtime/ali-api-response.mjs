import {publicServiceErrorCode,aliServiceError} from './ali-source/util/service-error-code.js';
export async function readAliApiResponse(response) {
  if (!response.ok) {
    const error = new Error(response.status === 429
      ? '阿里接口请求过于频繁（HTTP 429），请稍后重试'
      : '阿里接口 HTTP ' + response.status);
    error.statusCode=response.status;
    if (response.status === 429) {
      const retry=response.headers?.get('retry-after');
      const seconds=Number(retry)||Math.ceil((Date.parse(retry)-Date.now())/1000);
      if(Number.isFinite(seconds)&&seconds>0)error.retryAfterSeconds=seconds;
    }
    if([400,401,403,404].includes(response.status)&&response.body?.getReader){
      const reader=response.body.getReader(),chunks=[];let size=0,oversized=false;
      try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192){oversized=true;break;}chunks.push(Buffer.from(value));}}
      finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
      if(!oversized){const code=publicServiceErrorCode(Buffer.concat(chunks));if(code)error.serviceCode=code;}
    }
    await response.body?.cancel();
    throw aliServiceError(error);
  }
  return {content: await response.text(), headers: response.headers};
}
