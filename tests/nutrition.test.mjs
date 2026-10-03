import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {openDatabase} from '../server/database.mjs';
import {seedEvidence,validateCollection} from '../scripts/seed-evidence.mjs';
test('Doze materiais de nutrição são acrescentados sem alterar a curadoria anterior',async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'unifisio-nutrition-'));
 const db=openDatabase(dir);
 try{
  const original=JSON.parse(readFileSync(new URL('../scripts/evidence.json',import.meta.url),'utf8'));
  const knee=JSON.parse(readFileSync(new URL('../scripts/nutrition-protocols.json',import.meta.url),'utf8'));
  validateCollection(knee);
  assert.equal(knee.items.length,12);
  assert.ok(knee.items.every(x=>x.category==='Nutrição e alimentação'));
  db.prepare('INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)').run('a','admin@example.org','Curador','fixture','admin',new Date().toISOString());
  assert.equal(seedEvidence(db,original,'admin@example.org').inserted,44);
  const shoulder=JSON.parse(readFileSync(new URL('../scripts/shoulder-protocols.json',import.meta.url),'utf8'));
  assert.equal(seedEvidence(db,shoulder,'admin@example.org').inserted,6);
  const previous=db.prepare('SELECT * FROM materials ORDER BY id').all();
  assert.equal(seedEvidence(db,knee,'admin@example.org').inserted,12);
  assert.deepEqual(db.prepare("SELECT * FROM materials WHERE id NOT LIKE 'evidence-nutrition-%' ORDER BY id").all(),previous);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM materials WHERE status='published'").get().n,62);
  const id=knee.items[0].id;
  db.prepare("UPDATE materials SET status='archived',summary='Revisão clínica posterior' WHERE id=?").run(id);
  assert.equal(seedEvidence(db,knee,'admin@example.org').inserted,0);
  assert.equal(db.prepare('SELECT summary FROM materials WHERE id=?').get(id).summary,'Revisão clínica posterior');
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});

test('Cardápios conferem o alvo aproximado e o cálculo de porções',()=>{
 const menus=JSON.parse(readFileSync(new URL('../frontend/nutrition-menus.json',import.meta.url),'utf8'));
 assert.equal(menus.length,3);
 for(const menu of menus){
  const foods=menu.meals.flatMap(m=>m.foods);
  assert.ok(foods.every(f=>f.grams>0&&f.tacoRow>0));
  const kcal=foods.reduce((sum,f)=>sum+f.grams*f.kcal100/100,0);
  const protein=foods.reduce((sum,f)=>sum+f.grams*f.protein100/100,0);
  assert.ok(Math.abs(kcal-1500)<1);
  assert.ok(Math.abs(kcal-menu.totalKcal)<.01);
  assert.ok(Math.abs(protein-menu.proteinGrams)<.01);
 }
});
