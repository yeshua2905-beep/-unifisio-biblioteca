import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
export function openDatabase(dir){mkdirSync(dir,{recursive:true,mode:0o700});const db=new DatabaseSync(resolve(dir,'library.sqlite'));db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');const schema=readFileSync(new URL('./schema.sql',import.meta.url),'utf8');db.exec(schema);migrateMeasurementScale(db,schema);const columns=db.prepare('PRAGMA table_info(materials)').all().map(c=>c.name);if(!columns.includes('evidence'))db.exec("ALTER TABLE materials ADD COLUMN evidence TEXT NOT NULL DEFAULT '{}'");const taskColumns=db.prepare('PRAGMA table_info(care_tasks)').all().map(c=>c.name);if(!taskColumns.includes('coach_config'))db.exec("ALTER TABLE care_tasks ADD COLUMN coach_config TEXT NOT NULL DEFAULT '{}'");return db;}
export function transaction(db,work){db.exec('BEGIN IMMEDIATE');try{const value=work();db.exec('COMMIT');return value}catch(e){db.exec('ROLLBACK');throw e}}

// Keep historical RPE scores on their original scale; migrate atomically once.
function migrateMeasurementScale(db,schema){
 if(db.prepare('PRAGMA table_info(care_measurements)').all().some(c=>c.name==='borg_scale'))return;
 const create=schema.match(/CREATE TABLE IF NOT EXISTS care_measurements\([\s\S]*?\n\);/)[0].replace('IF NOT EXISTS care_measurements','care_measurements_next');
 transaction(db,()=>{
  db.exec(create);
  db.exec(`INSERT INTO care_measurements_next(id,patient_id,plan_id,performed_date,eva_before,borg_before,before_at,eva_after,borg_after,after_at,revision,borg_scale)
   SELECT id,patient_id,plan_id,performed_date,eva_before,borg_before,before_at,eva_after,borg_after,after_at,revision,'rpe6_20' FROM care_measurements;
   DROP TABLE care_measurements;
   ALTER TABLE care_measurements_next RENAME TO care_measurements;
   CREATE INDEX idx_care_measurements_patient ON care_measurements(patient_id,performed_date);`);
 });
}
