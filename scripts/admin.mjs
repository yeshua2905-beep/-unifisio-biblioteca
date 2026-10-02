import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openDatabase,transaction} from '../server/database.mjs';
import {token,digest,validEmail} from '../server/security.mjs';
const [action,emailInput,...nameParts]=process.argv.slice(2),email=(emailInput||'').toLowerCase(),name=nameParts.join(' ').trim();
if(!['primeiro-acesso','recuperar'].includes(action)||!validEmail(email)||(!name&&action==='primeiro-acesso'))throw new Error('Uso: node scripts/admin.mjs primeiro-acesso EMAIL NOME ou recuperar EMAIL');
const base=process.env.PUBLIC_URL;if(!base||base.includes('SEU-ENDERECO'))throw new Error('Defina PUBLIC_URL com o endereço real.');
const db=openDatabase(resolve(process.env.DATA_DIR||'data'));
try{const total=db.prepare('SELECT COUNT(*) AS n FROM users').get().n;const u=db.prepare('SELECT * FROM users WHERE email=? AND role=? AND active=1').get(email,'admin');
if(action==='primeiro-acesso'&&total>0)throw new Error('O primeiro administrador já foi cadastrado. Use a gestão de profissionais.');
if(action==='recuperar'&&!u)throw new Error('Administrador ativo não encontrado.');
const t=token(),id=randomUUID();transaction(db,()=>{db.prepare('UPDATE invites SET used_at=? WHERE email=? AND used_at IS NULL').run(Date.now(),email);db.prepare('INSERT INTO invites(id,token_hash,email,name,role,kind,expires_at,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,digest(t),email,u?.name||name,'admin',action==='recuperar'?'reset':'invite',Date.now()+3600000,u?.id||null,new Date().toISOString())});
console.log('Link privado do administrador (válido por uma hora):');console.log(new URL(base).origin+'/#convite='+t);
}finally{db.close()}
