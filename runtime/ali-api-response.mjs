export async function readAliApiResponse(response) {
  if (!response.ok) {
    const error = new Error(response.status === 429
      ? '阿里接口请求过于频繁（HTTP 429），请稍后重试'
      : '阿里接口 HTTP ' + response.status);
    if (response.status === 429) error.statusCode = 429;
    await response.body?.cancel();
    throw error;
  }
  return {content: await response.text(), headers: response.headers};
}
