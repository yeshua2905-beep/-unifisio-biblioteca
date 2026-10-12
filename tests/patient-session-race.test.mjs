import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {createApp} from '../server/app.mjs';
import {digest,hashPassword} from '../server/security.mjs';
import {localDate} from '../server/patient-care.mjs';
const origin='https://race.example';
test('Revogar a sessão durante o envio bloqueia escalas e evolução sem persistir respostas',async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'patient-session-race-'));await mkdir(resolve(dir,'public'));await writeFile(resolve(dir,'public/index.html'),'<!doctype html>');
 const app=await createApp({dataDir:resolve(dir,'data'),publicUrl:origin,staticDir:resolve(dir,'public')});
 try{
  const now=new Date().toISOString(),hash=await hashPassword('Senha longa somente para teste');
  app.db.prepare('INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)').run('pro','pro@example.org','Profissional',hash,'professional',now);
  app.db.prepare('INSERT INTO patients(id,email,name,password_hash,owner_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('patient','patient@example.org','Paciente',hash,'pro',now,now);
  app.db.prepare('INSERT INTO care_function_goals(id,patient_id,author_id,title,created_at) VALUES(?,?,?,?,?)').run('goal','patient','pro','Subir escadas',now);
  const cases=[['/api/patient/daily-scales',{performed_date:localDate(),moment:'now',eva:50,borg:3},'care_daily_scales'],['/api/patient/function-logs',{goal_id:'goal',performed_date:localDate(),score:6},'care_function_logs']];
  for(const [path,payload,table] of cases){
   app.db.prepare('INSERT INTO patient_sessions(token_hash,patient_id,expires_at) VALUES(?,?,?)').run(digest('test-session'),'patient',Date.now()+60000);
   let controller;const stream=new ReadableStream({start(c){controller=c;c.enqueue(new TextEncoder().encode(JSON.stringify(payload).slice(0,1)))}});
   const pending=app.handle(new Request(origin+path,{method:'POST',headers:{Origin:origin,Cookie:'__Host-unifisio-patient=test-session','Content-Type':'application/json'},body:stream,duplex:'half'}));
   await nextTurn();app.db.prepare('DELETE FROM patient_sessions WHERE patient_id=?').run('patient');
   controller.enqueue(new TextEncoder().encode(JSON.stringify(payload).slice(1)));controller.close();
   assert.equal((await pending).status,401,path);
   assert.equal(app.db.prepare('SELECT COUNT(*) AS count FROM '+table).get().count,0,table);
  }
 }finally{app.close();await rm(dir,{recursive:true,force:true})}
});
