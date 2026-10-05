import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {openDatabase} from '../server/database.mjs';
import {seedEvidence,validateCollection} from '../scripts/seed-evidence.mjs';
import {categories} from '../server/catalog.mjs';
test('Neurofuncional importa sem sobrescrever acervo ou revisões e suporta nova área',async()=>{
 const collection=JSON.parse(readFileSync(new URL('../scripts/neuro-evidence.json',import.meta.url),'utf8'));
 validateCollection(collection);assert.equal(collection.items.length,24);assert.ok(categories.includes('Neurofuncional'));
 const dir=await mkdtemp(resolve(tmpdir(),'unifisio-neuro-'));const db=openDatabase(dir);
 try{
  assert.equal(seedEvidence(db,collection,'admin@example.org').status,'waiting-for-admin');
  db.prepare('INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)').run('a','admin@example.org','Curador','fixture','admin',new Date().toISOString());
  const old=JSON.parse(readFileSync(new URL('../scripts/evidence.json',import.meta.url),'utf8'));seedEvidence(db,old,'admin@example.org');
  const previous=db.prepare('SELECT * FROM materials ORDER BY id').all();
  assert.equal(seedEvidence(db,collection,'admin@example.org').inserted,24);
  assert.deepEqual(db.prepare("SELECT * FROM materials WHERE category!='Neurofuncional' ORDER BY id").all(),previous);
  const id=collection.items[0].id;db.prepare("UPDATE materials SET summary='Revisão clínica',status='archived' WHERE id=?").run(id);
  assert.equal(seedEvidence(db,collection,'admin@example.org').inserted,0);assert.equal(db.prepare('SELECT summary FROM materials WHERE id=?').get(id).summary,'Revisão clínica');
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});
