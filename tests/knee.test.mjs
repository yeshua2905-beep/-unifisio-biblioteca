import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {openDatabase} from '../server/database.mjs';
import {seedEvidence,validateCollection} from '../scripts/seed-evidence.mjs';
test('Dez protocolos de joelho são acrescentados sem alterar a curadoria anterior',async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'unifisio-knee-'));
 const db=openDatabase(dir);
 try{
  const original=JSON.parse(readFileSync(new URL('../scripts/evidence.json',import.meta.url),'utf8'));
  const knee=JSON.parse(readFileSync(new URL('../scripts/knee-protocols.json',import.meta.url),'utf8'));
  validateCollection(knee);
  assert.equal(knee.items.length,10);
  assert.ok(knee.items.every(x=>x.category==='Joelho'&&['Protocolo clínico','Teste e avaliação'].includes(x.kind)));
  db.prepare('INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)').run('a','admin@example.org','Curador','fixture','admin',new Date().toISOString());
  assert.equal(seedEvidence(db,original,'admin@example.org').inserted,44);
  const shoulder=JSON.parse(readFileSync(new URL('../scripts/shoulder-protocols.json',import.meta.url),'utf8'));
  assert.equal(seedEvidence(db,shoulder,'admin@example.org').inserted,6);
  const previous=db.prepare('SELECT * FROM materials ORDER BY id').all();
  assert.equal(seedEvidence(db,knee,'admin@example.org').inserted,10);
  assert.deepEqual(db.prepare("SELECT * FROM materials WHERE id NOT LIKE 'evidence-knee-%' ORDER BY id").all(),previous);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM materials WHERE status='published'").get().n,60);
  const id=knee.items[0].id;
  db.prepare("UPDATE materials SET status='archived',summary='Revisão clínica posterior' WHERE id=?").run(id);
  assert.equal(seedEvidence(db,knee,'admin@example.org').inserted,0);
  assert.equal(db.prepare('SELECT summary FROM materials WHERE id=?').get(id).summary,'Revisão clínica posterior');
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});
