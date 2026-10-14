// A streaming response cannot be replaced by JSON after its headers/body start.
// Player seeking and engine changes routinely close the previous response.
export function writeRequestError(res, status, message, writeJson) {
  if (res.destroyed || res.writableEnded) return false;
  if (res.headersSent) {
    res.destroy();
    return false;
  }
  writeJson(res, status, {code: status, error: message, message});
  return true;
}
