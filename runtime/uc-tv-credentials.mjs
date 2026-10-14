export async function ucCatCredentials(read){
 const [web,tv]=await Promise.all([read('uc'),read('uctv')]);
 return {...web,...(tv?.token?{token:tv.token,refreshtoken:tv.refresh_token||'',refresh_token:tv.refresh_token||''}:{})};
}
