# UC TV 登录

后台添加账号可选“UC TV 网盘”，普通“UC 网盘”保留。两者独立加密存储，每种仅一个主账号。

扫码链路：UC TV官方/oauth/authorize -> UC App确认 -> 官方/oauth/code -> HTTPS api.extscreen.com/ucdrive/token兑换Token -> 保存TV授权。检查按钮请求UC TV官方接口校验授权，不使用播放成功作为登录成功依据。

已实测二维码接口status=0且返回二维码与query_token；兑换服务POST参数校验可访问。用户扫码后的真实Token兑换、目录校验及影片播放尚未实测，不应声称已全部通过。

UC TV Token与refresh_token同步至已识别的Cat UC token/refreshtoken接口，普通UC Cookie继续保留。未提供TV驱动的订阅不会因此获得TV播放能力。扫码Token通常有时效，失效需重新扫码；本版不承诺所有第三方订阅自动刷新TV授权。
