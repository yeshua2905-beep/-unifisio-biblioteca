import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openDatabase,transaction} from '../server/database.mjs';
import {validEmail} from '../server/security.mjs';
export function initializeAdminInvite(db,env,now=Date.now()){
 const email=env.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase(),hash=env.BOOTSTRAP_ADMIN_TOKEN_HASH,name=env.BOOTSTRAP_ADMIN_NAME,expires=Number(env.BOOTSTRAP_ADMIN_EXPIRES);
 if(!email&&!hash)return false;
 if(!validEmail(email)||!name||name.length>100||!/^[a-f0-9]{64}$/.test(hash||'')||!Number.isSafeInteger(expires))throw new Error('Configuração de primeiro acesso inválida.');
 if(expires<=now)return false;
 return transaction(db,()=>{
  if(db.prepare('SELECT COUNT(*) AS n FROM users').get().n>0)return false;
  if(db.prepare("SELECT id FROM invites WHERE role='admin' AND kind='invite' LIMIT 1").get())return false;
  db.prepare('INSERT INTO invites(id,token_hash,email,name,role,kind,expires_at,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(),hash,email,name,'admin','invite',expires,null,new Date(now).toISOString());
  return true;
 });
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
 const db=openDatabase(resolve(process.env.DATA_DIR||'data'));
 try{if(initializeAdminInvite(db,process.env))console.log('Convite inicial de administrador preparado.');}finally{db.close();}
}
