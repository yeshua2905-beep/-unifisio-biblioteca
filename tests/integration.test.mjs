import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createApp} from '../server/app.mjs';
import {hashPassword,digest,token} from '../server/security.mjs';
const origin='https://biblioteca.example';
async function fixture(){const dir=await mkdtemp(resolve(tmpdir(),'unifisio-'));const staticDir=resolve(dir,'public');await mkdir(staticDir);await writeFile(resolve(staticDir,'index.html'),'<!doctype html><title>Login</title>');const options={dataDir:resolve(dir,'data'),publicUrl:origin,staticDir,secure:true};const app=await createApp(options);const password='Senha longa de teste 2026';const hash=await hashPassword(password);app.db.prepare('INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)').run('admin','carlos@example.org','Carlos',hash,'admin',new Date().toISOString());let cookie='';async function call(path,method='GET',body,asCookie=cookie,extra={}){const headers={'Origin':origin,...extra};if(asCookie)headers.Cookie=asCookie;let payload;if(body instanceof FormData)payload=body;else if(body!==undefined){headers['Content-Type']='application/json';payload=JSON.stringify(body)}const req=new Request(origin+path,{method,headers,...(payload!==undefined?{body:payload}:{})});const res=await app.handle(req,'fixture');return {status:res.status,body:res.headers.get('content-type')?.includes('application/json')?await res.json():await res.text(),cookie:res.headers.get('set-cookie')}}
const login=await call('/api/auth/login','POST',{email:'carlos@example.org',password});assert.equal(login.status,200);cookie=login.cookie.split(';')[0];return {dir,app,options,password,cookie,call,cleanup:async()=>{app.close();await rm(dir,{recursive:true,force:true})}}}
function material(title='Teste clínico'){const f=new FormData();f.set('title',title);f.set('category','Joelho');f.set('kind','Protocolo clínico');f.set('summary','Resumo clínico com critérios.');return f;}
test('Login independente, convite, revisão e arquivos respeitam permissões',async()=>{const f=await fixture();try{const{call,app}=f;
assert.equal((await call('/api/materials','GET',undefined,'',{'oai-authenticated-user-email':'carlos@example.org','oai-authenticated-user-id':'admin'})).status,401);
assert.equal((await call('/api/invites','POST',{email:'teste@example.org',name:'Nome'},f.cookie,{Origin:'https://evil.example'})).status,403);
assert.equal((await call('/api/auth/login','POST',{email:'carlos@example.org',password:'incorreta'})).status,401);
const invite=await call('/api/invites','POST',{email:'fisio@example.org',name:'Fisioterapeuta',role:'professional'});assert.equal(invite.status,201);const t=new URL(invite.body.link).hash.slice('#convite='.length);assert.equal(app.db.prepare('SELECT token_hash FROM invites WHERE id=?').get(invite.body.id).token_hash,digest(t));
const accept=await call('/api/auth/accept','POST',{token:t,name:'Fisioterapeuta',password:'Uma frase longa para senha'});assert.equal(accept.status,201);const professional=accept.cookie.split(';')[0];assert.match(accept.cookie,/HttpOnly/);assert.match(accept.cookie,/Secure/);
assert.equal((await call('/api/auth/accept','POST',{token:t,name:'Outro',password:'Uma frase longa para senha'})).status,400);
assert.equal((await call('/api/users','GET',undefined,professional)).status,403);
assert.equal((await call('/api/invites','POST',{email:'intruso@example.org',name:'Intruso',role:'admin'},professional)).status,403);
const draft=material();draft.set('file',new File(['%PDF-1.4\nPDF de teste'],'teste.pdf',{type:'application/pdf'}));const submit=await call('/api/materials','POST',draft,professional);assert.equal(submit.status,201);assert.equal(submit.body.status,'pending');const id=submit.body.id;
assert.equal((await call('/api/materials','PATCH',{id,status:'published'},professional)).status,403);
const readerInvite=await call('/api/invites','POST',{email:'leitor@example.org',name:'Leitor',role:'reader'});const readerToken=new URL(readerInvite.body.link).hash.slice(9);const readerReg=await call('/api/auth/accept','POST',{token:readerToken,name:'Leitor',password:'Uma outra frase bem longa'});assert.equal(readerReg.status,201);const reader=readerReg.cookie.split(';')[0];
assert.equal((await call('/api/materials','GET',undefined,reader)).body.materials.length,0);
assert.equal((await call('/api/files/'+id,'GET',undefined,reader)).status,404);
assert.equal((await call('/api/materials','POST',material(),reader)).status,403);
assert.equal((await call('/api/materials','PATCH',{id,status:'rejected',note:'Adicionar critérios.'})).status,200);
const edit=material('Protocolo revisado');edit.set('id',id);assert.equal((await call('/api/materials','PUT',edit,professional)).status,200);
assert.equal((await call('/api/materials','PATCH',{id,status:'published'})).status,200);
assert.equal((await call('/api/materials','GET',undefined,reader)).body.materials[0].title,'Protocolo revisado');assert.equal((await call('/api/files/'+id,'GET',undefined,reader)).status,200);
const badPdf=material();badPdf.set('file',new File(['arquivo errado'],'teste.pdf',{type:'application/pdf'}));assert.equal((await call('/api/materials','POST',badPdf,professional)).status,400);
const badUrl=material();badUrl.set('url','javascript:alert(1)');assert.equal((await call('/api/materials','POST',badUrl,professional)).status,400);
const uid=accept.body.user.id;assert.equal((await call('/api/users','PATCH',{id:uid,role:'professional',active:false})).status,200);assert.equal((await call('/api/materials','GET',undefined,professional)).status,401);
assert.equal((await call('/api/users','PATCH',{id:'admin',role:'reader',active:true})).status,400);
assert.equal((await call('/api/auth/logout','POST',{})).status,200);assert.equal((await call('/api/materials','GET')).status,401);
}finally{await f.cleanup()}});
test('Recuperação revoga sessões, expiração e suspensão são aplicadas no servidor',async()=>{const f=await fixture();try{const{call,app}=f;const first=await call('/api/invites','POST',{email:'carlos@example.org',name:'Carlos',role:'admin',kind:'reset'});const t=new URL(first.body.link).hash.slice(9);const reset=await call('/api/auth/accept','POST',{token:t,name:'Carlos',password:'Nova senha longa e segura'});assert.equal(reset.status,201);assert.equal((await call('/api/auth/me')).body.user,null);assert.equal((await call('/api/auth/login','POST',{email:'carlos@example.org',password:f.password})).status,401);
const newCookie=reset.cookie.split(';')[0];assert.equal((await call('/api/auth/me','GET',undefined,newCookie)).body.user.isAdmin,true);app.db.prepare('UPDATE sessions SET expires_at=?').run(Date.now()-1);assert.equal((await call('/api/auth/me','GET',undefined,newCookie)).body.user,null);
const t2=token();app.db.prepare('INSERT INTO invites(id,token_hash,email,name,role,kind,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)').run('expired',digest(t2),'exp@example.org','Expirado','professional','invite',Date.now()-1,new Date().toISOString());assert.equal((await call('/api/auth/invitation','POST',{token:t2})).status,404);
}finally{await f.cleanup()}});
test('Dados e hashes persistem ao reabrir o banco; senhas não são armazenadas em texto',async()=>{const f=await fixture();try{const row=f.app.db.prepare('SELECT password_hash FROM users WHERE id=?').get('admin');assert.notEqual(row.password_hash,f.password);assert.match(row.password_hash,/^scrypt:/);await f.call('/api/materials','POST',material());f.app.close();const restored=await createApp(f.options);assert.equal(restored.db.prepare('SELECT COUNT(*) AS n FROM materials').get().n,1);restored.close();await rm(f.dir,{recursive:true,force:true});}catch(e){await rm(f.dir,{recursive:true,force:true});throw e}});
test('Tentativas de login em excesso são limitadas',async()=>{const f=await fixture();try{let res;for(let i=0;i<13;i++)res=await f.call('/api/auth/login','POST',{email:'desconhecido@example.org',password:'incorreta'},'');assert.equal(res.status,429)}finally{await f.cleanup()}});

test('Sessão permanece durante navegação e logout revoga acesso',async()=>{const f=await fixture();try{const page=await f.call('/');assert.equal(page.status,200);assert.equal(page.cookie,null);assert.equal((await f.call('/api/materials')).status,200);await f.call('/index.html');assert.equal((await f.call('/api/auth/me')).body.user.id,'admin');await f.call('/api/auth/logout','POST',{});assert.equal((await f.call('/api/materials')).status,401);}finally{await f.cleanup()}});
