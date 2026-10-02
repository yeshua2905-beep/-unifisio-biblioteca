import {randomBytes,createHash,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback);
export const token=()=>randomBytes(32).toString('base64url');
export const digest=value=>createHash('sha256').update(value).digest('hex');
export async function hashPassword(password){const salt=randomBytes(16).toString('hex');const key=await scrypt(password,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024});return `scrypt:${salt}:${key.toString('hex')}`;}
export async function verifyPassword(password,encoded){try{const [alg,salt,stored]=encoded.split(':');if(alg!=='scrypt')return false;const key=await scrypt(password,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024});const expected=Buffer.from(stored,'hex');return key.length===expected.length&&timingSafeEqual(key,expected)}catch{return false}}
export function passwordValid(value){return typeof value==='string'&&value.length>=12&&value.length<=128;}
export function validEmail(value){return typeof value==='string'&&value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)}
export function safeString(value,max=2000){return typeof value==='string'&&value.trim().length<=max?value.trim():null;}
export function consumeLimit(db,key,max,windowMs){const now=Date.now();const row=db.prepare('SELECT count,reset_at FROM auth_limits WHERE key=?').get(key);if(!row||row.reset_at<=now){db.prepare('INSERT INTO auth_limits(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=1,reset_at=excluded.reset_at').run(key,now+windowMs);return true}if(row.count>=max)return false;db.prepare('UPDATE auth_limits SET count=count+1 WHERE key=?').run(key);return true;}
