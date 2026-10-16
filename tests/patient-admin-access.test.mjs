import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {createApp} from '../server/app.mjs';
import {hashPassword} from '../server/security.mjs';
import {localDate} from '../server/patient-care.mjs';
const origin='https://admin-patients.example';
test('Pacientes da biblioteca são exclusivos de administradores, inclusive dados antigos e acesso direto',async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'admin-patients-'));await mkdir(resolve(dir,'public'));await writeFile(resolve(dir,'public/index.html'),'<!doctype html>');
 const app=await createApp({dataDir:resolve(dir,'data'),publicUrl:origin,staticDir:resolve(dir,'public')});
 try{
  const password='Senha longa apenas para teste',hash=await hashPassword(password),now=new Date().toISOString(),cookies={};
  for(const role of ['admin','professional','reader'])app.db.prepare('INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)').run(role,role+'@example.org',role,hash,role,now);
  // Old patients may still have a professional as owner. This must not grant access.
  app.db.prepare('INSERT INTO patients(id,email,name,owner_id,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('legacy','patient@example.org','Paciente antigo','professional',hash,now,now);
  async function call(path,method='GET',payload,cookie=''){const res=await app.handle(new Request(origin+path,{method,headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},...(payload===undefined?{}:{body:JSON.stringify(payload)})}));return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]}}
  for(const role of ['admin','professional','reader'])cookies[role]=(await call('/api/auth/login','POST',{email:role+'@example.org',password})).cookie;
  const routes=[['/api/care/patients','GET'],['/api/care/patients','POST'],['/api/care/patients/legacy','GET'],['/api/care/patients/legacy','PATCH'],['/api/care/patients/legacy/access','POST'],['/api/care/patients/legacy/plans','POST'],['/api/care/patients/legacy/daily-scales','POST'],['/api/care/patients/legacy/function-goals','POST'],['/api/care/patients/legacy/progress-notes','POST'],['/api/care/plans/plan','PUT'],['/api/care/plans/plan','PATCH'],['/api/care/tasks/task/coach','PATCH'],['/api/care/function-goals/goal','PATCH'],['/api/care/logs/log/feedback','POST']];
  for(const role of ['professional','reader']){
   assert.equal((await call('/api/materials','GET',undefined,cookies[role])).status,200);
   for(const [path,method] of routes){const response=await call(path,method,method==='GET'?undefined:{role:'admin',patient_id:'legacy'},cookies[role]);assert.equal(response.status,403,role+' '+method+' '+path);assert.deepEqual(Object.keys(response.data),['error']);}
  }
  assert.equal((await call('/api/care/patients')).status,401);
  const list=await call('/api/care/patients','GET',undefined,cookies.admin);assert.equal(list.status,200);assert.equal(list.data.patients[0].id,'legacy');
  assert.equal((await call('/api/care/patients/legacy','GET',undefined,cookies.admin)).status,200);
  assert.equal((await call('/api/care/patients/legacy/function-goals','POST',{title:'Subir escadas'},cookies.admin)).status,201);
  const pc=(await call('/api/patient/auth/login','POST',{email:'patient@example.org',password})).cookie;
  assert.equal((await call('/api/patient/dashboard','GET',undefined,pc)).status,200);
  assert.equal((await call('/api/patient/diary','POST',{performed_date:localDate(),perception:'Caminhei melhor.'},pc)).status,201);
  assert.equal((await call('/api/care/patients','GET',undefined,pc)).status,401);
  assert.equal((await call('/api/care/patients/legacy','GET',undefined,cookies.admin)).data.diaryEntries[0].perception,'Caminhei melhor.');
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM patients').get().n,1);
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM care_plans').get().n,0);
  // A request started by an administrator must be refused if their role changes while the body arrives.
  const payload=JSON.stringify({title:'Nova atividade'});let controller;
  const stream=new ReadableStream({start(c){controller=c;c.enqueue(new TextEncoder().encode(payload.slice(0,1)))}});
  const pending=app.handle(new Request(origin+'/api/care/patients/legacy/function-goals',{method:'POST',headers:{Cookie:cookies.admin,Origin:origin,'Content-Type':'application/json'},body:stream,duplex:'half'}));
  await nextTurn();app.db.prepare("UPDATE users SET role='professional' WHERE id='admin'").run();
  controller.enqueue(new TextEncoder().encode(payload.slice(1)));controller.close();assert.equal((await pending).status,403);
  assert.equal((await call('/api/care/patients','GET',undefined,cookies.admin)).status,403);
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM care_function_goals').get().n,1);
 }finally{app.close();await rm(dir,{recursive:true,force:true})}
});
