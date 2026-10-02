import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createApp} from '../server/app.mjs';
import {seedEvidence,validateCollection} from '../scripts/seed-evidence.mjs';
import {hashPassword} from '../server/security.mjs';
const collection=JSON.parse(readFileSync(new URL('../scripts/evidence.json',import.meta.url),'utf8'));

test('Curadoria fica acessível com autenticação, persiste e preserva decisões editoriais em novas execuções',async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'unifisio-evidence-'));
 const options={dataDir:dir,publicUrl:'https://biblioteca.example',staticDir:resolve(dir,'static'),secure:true};
 let app=await createApp(options);
 try{
  assert.equal(validateCollection(collection).items.length,44);
  assert.equal(seedEvidence(app.db,collection,'admin@example.org').status,'waiting-for-admin');
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM users').get().n,0);
  const password='Senha de teste longa 2026';
  app.db.prepare('INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)')
   .run('curator','admin@example.org','Curador',await hashPassword(password),'admin',new Date().toISOString());
  assert.equal(seedEvidence(app.db,collection,'ADMIN@example.org').inserted,44);
  const unauth=await app.handle(new Request(options.publicUrl+'/api/materials'),'evidence-test');
  assert.equal(unauth.status,401);
  const login=await app.handle(new Request(options.publicUrl+'/api/auth/login',{method:'POST',headers:{Origin:options.publicUrl,'Content-Type':'application/json'},body:JSON.stringify({email:'admin@example.org',password})}),'evidence-test');
  assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const response=await app.handle(new Request(options.publicUrl+'/api/materials',{headers:{Cookie:cookie}}),'evidence-test');
  assert.equal(response.status,200);
  const listing=await response.json();
  assert.equal(listing.materials.length,44);
  assert.ok(listing.materials.every(m=>m.status==='published'&&m.summary&&m.reference));
  const first=collection.items[0].id,second=collection.items[1].id,third=collection.items[2].id;
  app.db.prepare('UPDATE materials SET summary=? WHERE id=?').run('Edição posterior do curador',first);
  app.db.prepare("UPDATE materials SET status='archived' WHERE id=?").run(second);
  app.db.prepare('DELETE FROM materials WHERE id=?').run(third);
  assert.equal(seedEvidence(app.db,collection,'admin@example.org').status,'already-imported');
  app.close();
  app=await createApp(options);
  assert.equal(seedEvidence(app.db,collection,'admin@example.org').inserted,0);
  assert.equal(app.db.prepare('SELECT summary FROM materials WHERE id=?').get(first).summary,'Edição posterior do curador');
  assert.equal(app.db.prepare('SELECT status FROM materials WHERE id=?').get(second).status,'archived');
  assert.equal(app.db.prepare('SELECT id FROM materials WHERE id=?').get(third),undefined);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM audit WHERE action=?').get('evidence_import').n,44);
 }finally{app.close();await rm(dir,{recursive:true,force:true});}
});
test('Coleção inválida é recusada antes de qualquer publicação',()=>{
 const invalid=structuredClone(collection);invalid.items[0].url='javascript:alert(1)';
 assert.throws(()=>validateCollection(invalid),/HTTPS/);
 const duplicate=structuredClone(collection);duplicate.items.push(duplicate.items[0]);
 assert.throws(()=>validateCollection(duplicate),/duplicado/);
});
