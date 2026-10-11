import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {createApp} from '../server/app.mjs';
import {hashPassword} from '../server/security.mjs';
import {matchesQuery} from '../frontend/lib/search.mjs';
test('Busca reconhece siglas, acentos e variações sem exigir coincidência literal',()=>{
 const m={title:'Reabilitação do ligamento cruzado anterior',summary:'Fortalecimento e retorno à corrida',category:'Joelho',kind:'Protocolo clínico',reference:''};
 for(const q of ['LCA força','fortalecer','voltar correr','reabilitacao'])assert.equal(matchesQuery(m,q),true,q);
 assert.equal(matchesQuery(m,'ombro'),false);
});
test('Metadados, favoritos, histórico e backup preservam dados e permissões',async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'unifisio-upgrade-')),origin='https://library.example';await mkdir(resolve(dir,'public'));await writeFile(resolve(dir,'public/index.html'),'<!doctype html>');
 const app=await createApp({dataDir:resolve(dir,'data'),staticDir:resolve(dir,'public'),publicUrl:origin});
 try{
 const password='Senha de teste bastante longa',hash=await hashPassword(password);for(const [id,role] of [['admin','admin'],['reader','reader']])app.db.prepare('INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)').run(id,id+'@example.org',id,hash,role,new Date().toISOString());
 let cookie='';async function call(path,method='GET',payload){const headers={Origin:origin,Cookie:cookie};let body;if(payload instanceof FormData)body=payload;else if(payload!==undefined){headers['Content-Type']='application/json';body=JSON.stringify(payload)}return app.handle(new Request(origin+path,{method,headers,...(body?{body}:{})}));}
 cookie=(await call('/api/auth/login','POST',{email:'admin@example.org',password})).headers.get('set-cookie').split(';')[0];const adminCookie=cookie;
 const form=()=>{const f=new FormData();for(const [key,v] of Object.entries({title:'Protocolo',summary:'Texto original',category:'Joelho',kind:'Protocolo clínico',evidence:JSON.stringify({doi:'10.1234/teste',year:'2026',objectives:['Força e controle']})}))f.set(key,v);return f};
 const first=await call('/api/materials','POST',form());assert.equal(first.status,201);const {id}=await first.json();
 const bad=form();bad.set('evidence','{"doi":"sem DOI"}');assert.equal((await call('/api/materials','POST',bad)).status,400);
 const edit=form();edit.set('id',id);edit.set('summary','Texto atualizado');assert.equal((await call('/api/materials','PUT',edit)).status,200);
 let versions=await (await call('/api/materials/'+id+'/versions')).json();assert.equal(versions.versions.length,1);assert.equal(versions.versions[0].summary,'Texto original');
 assert.equal((await call('/api/materials/'+id+'/versions','POST',{versionId:versions.versions[0].id})).status,200);assert.equal(app.db.prepare('SELECT summary FROM materials WHERE id=?').get(id).summary,'Texto original');
 assert.equal((await call('/api/activity','POST',{id,favorite:true,opened:true})).status,200);assert.equal((await (await call('/api/activity')).json()).activity[0].favorite,1);
 cookie=(await call('/api/auth/login','POST',{email:'reader@example.org',password})).headers.get('set-cookie').split(';')[0];assert.deepEqual((await (await call('/api/activity')).json()).activity,[]);assert.equal((await call('/api/backup','POST',{})).status,403);assert.equal((await call('/api/storage')).status,403);assert.equal((await call('/api/materials/'+id+'/versions')).status,404);assert.equal((await call('/api/materials/'+id+'/versions','POST',{versionId:versions.versions[0].id})).status,403);assert.equal((await call('/api/catalog')).status,200);
 cookie=adminCookie;await writeFile(resolve(dir,'data/uploads/exemplo.pdf'),'%PDF-1.4\narquivo de teste');
 const response=await call('/api/backup','POST',{});assert.equal(response.status,200);const archive=resolve(dir,'backup.tar.gz');await writeFile(archive,Buffer.from(await response.arrayBuffer()));await mkdir(resolve(dir,'restored'));execFileSync('tar',['-xzf',archive,'-C',resolve(dir,'restored')]);
 const restored=new DatabaseSync(resolve(dir,'restored/library.sqlite'));assert.equal(restored.prepare('SELECT summary FROM materials WHERE id=?').get(id).summary,'Texto original');assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check,'ok');restored.close();assert.equal(await readFile(resolve(dir,'restored/uploads/exemplo.pdf'),'utf8'),'%PDF-1.4\narquivo de teste');
 }finally{app.close();await rm(dir,{recursive:true,force:true})}
});
