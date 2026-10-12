import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openDatabase} from '../server/database.mjs';
test('Migração preserva Borg histórica e aceita 0 e 0,5 apenas na escala modificada',async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'scale-migration-'));let db;
 try{
  const schema=await readFile(new URL('../server/schema.sql',import.meta.url),'utf8');
  const oldTable=`CREATE TABLE IF NOT EXISTS care_measurements(
   id TEXT PRIMARY KEY,patient_id TEXT NOT NULL REFERENCES patients(id),plan_id TEXT NOT NULL REFERENCES care_plans(id),performed_date TEXT NOT NULL,
   eva_before INTEGER NOT NULL CHECK(eva_before BETWEEN 0 AND 100),borg_before INTEGER NOT NULL CHECK(borg_before BETWEEN 6 AND 20),before_at TEXT NOT NULL,
   eva_after INTEGER CHECK(eva_after BETWEEN 0 AND 100),borg_after INTEGER CHECK(borg_after BETWEEN 6 AND 20),after_at TEXT,
   revision INTEGER NOT NULL DEFAULT 1,UNIQUE(patient_id,plan_id,performed_date),
   CHECK((eva_after IS NULL AND borg_after IS NULL AND after_at IS NULL) OR (eva_after IS NOT NULL AND borg_after IS NOT NULL AND after_at IS NOT NULL))
  );`;
  db=new DatabaseSync(resolve(dir,'library.sqlite'));db.exec(schema.replace(/CREATE TABLE IF NOT EXISTS care_measurements\([\s\S]*?\n\);/,oldTable));
  db.exec(`INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES('u','u@example.org','Profissional','test','admin','2026-10-12');
   INSERT INTO patients(id,email,name,owner_id,created_at,updated_at) VALUES('p','p@example.org','Paciente','u','2026-10-12','2026-10-12');
   INSERT INTO care_plans(id,patient_id,author_id,title,start_date,end_date,status,created_at,updated_at) VALUES('plan','p','u','Plano','2026-10-01','2026-11-01','active','2026-10-12','2026-10-12');
   INSERT INTO care_measurements(id,patient_id,plan_id,performed_date,eva_before,borg_before,before_at,eva_after,borg_after,after_at,revision) VALUES('old','p','plan','2026-10-11',25,6,'2026-10-11T10:00Z',10,20,'2026-10-11T11:00Z',2);`);
  const original={...db.prepare('SELECT * FROM care_measurements').get()};db.close();db=openDatabase(dir);
  const migrated={...db.prepare('SELECT * FROM care_measurements WHERE id=?').get('old')};assert.deepEqual(migrated,{...original,borg_scale:'rpe6_20'});
  const insert=db.prepare('INSERT INTO care_measurements(id,patient_id,plan_id,performed_date,eva_before,borg_before,before_at,borg_scale) VALUES(?,?,?,?,?,?,?,?)');
  assert.throws(()=>insert.run('bad','p','plan','2026-10-12',0,0.5,'2026-10-12T10:00Z','rpe6_20'));
  insert.run('new','p','plan','2026-10-12',0,0.5,'2026-10-12T10:00Z','modified0_10');
  db.prepare('UPDATE care_measurements SET eva_after=0,borg_after=0,after_at=? WHERE id=?').run('2026-10-12T11:00Z','new');
  db.close();db=openDatabase(dir);assert.equal(db.prepare('SELECT borg_before FROM care_measurements WHERE id=?').get('new').borg_before,0.5);assert.equal(db.prepare('SELECT borg_after FROM care_measurements WHERE id=?').get('new').borg_after,0);assert.equal(db.prepare('SELECT borg_scale FROM care_measurements WHERE id=?').get('old').borg_scale,'rpe6_20');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db?.close();await rm(dir,{recursive:true,force:true})}
});
