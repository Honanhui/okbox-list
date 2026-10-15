export async function readAliApiResponse(response) {
  if (!response.ok) {
    const error = new Error(response.status === 429
      ? '阿里接口请求过于频繁（HTTP 429），请稍后重试'
      : '阿里接口 HTTP ' + response.status);
    if (response.status === 429) {
      error.statusCode = 429;
      const retry=response.headers?.get('retry-after');
      const seconds=Number(retry)||Math.ceil((Date.parse(retry)-Date.now())/1000);
      if(Number.isFinite(seconds)&&seconds>0)error.retryAfterSeconds=seconds;
    }
    await response.body?.cancel();
    throw error;
  }
  return {content: await response.text(), headers: response.headers};
}
