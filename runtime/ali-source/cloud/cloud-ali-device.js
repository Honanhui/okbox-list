import crypto from 'node:crypto';
import {secp256k1} from '@noble/curves/secp256k1';

export function createAliDevice(userId){
 if(!userId)throw Error('阿里账号缺少用户标识');
 const privateKey=secp256k1.utils.randomPrivateKey(),deviceId=crypto.randomUUID();
 const digest=crypto.createHash('sha256').update(`5dde4e1bdf9e4966b387ba58f4b3fdc3:${deviceId}:${userId}:0`).digest();
 const signature=secp256k1.sign(digest,privateKey,{lowS:true});
 return {deviceId,publicKey:Buffer.from(secp256k1.getPublicKey(privateKey,false)).toString('hex'),signature:signature.toCompactHex()+signature.recovery.toString(16).padStart(2,'0')};
}
