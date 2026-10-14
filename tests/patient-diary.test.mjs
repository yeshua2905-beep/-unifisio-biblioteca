import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createApp} from '../server/app.mjs';
import {hashPassword} from '../server/security.mjs';
import {localDate} from '../server/patient-care.mjs';
const origin='https://diary.example';
test('Diário independente de planos e metas: privacidade, edição concorrente, histórico e persistência',async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'diary-'));await mkdir(resolve(dir,'public'));await writeFile(resolve(dir,'public/index.html'),'<!doctype html>');const options={dataDir:resolve(dir,'data'),publicUrl:origin,staticDir:resolve(dir,'public')};let app=await createApp(options);
 try{
  const password='Senha longa apenas para teste',hash=await hashPassword(password),now=new Date().toISOString(),today=localDate();
  for(const role of ['admin','professional','reader'])app.db.prepare('INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)').run(role,role+'@example.org',role,hash,role,now);
  for(const [id,owner] of [['one','professional'],['two','admin']])app.db.prepare('INSERT INTO patients(id,email,name,owner_id,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,id+'@example.org',id,owner,hash,now,now);
  async function call(path,method='GET',payload,cookie='',requestOrigin=origin){const res=await app.handle(new Request(origin+path,{method,headers:{Cookie:cookie,Origin:requestOrigin,'Content-Type':'application/json'},...(payload===undefined?{}:{body:JSON.stringify(payload)})}));return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]}}
  const pro=(await call('/api/auth/login','POST',{email:'professional@example.org',password})).cookie,reader=(await call('/api/auth/login','POST',{email:'reader@example.org',password})).cookie;
  const pc=(await call('/api/patient/auth/login','POST',{email:'one@example.org',password})).cookie,pc2=(await call('/api/patient/auth/login','POST',{email:'two@example.org',password})).cookie;
  const payload={performed_date:today,perception:'Caminhei melhor hoje.\nSubi escadas.',complaints:'Incômodo ao levantar.',feedback:'Tenho dúvida sobre um exercício.'};
  assert.equal((await call('/api/patient/diary','POST',payload)).status,401);assert.equal((await call('/api/patient/diary','POST',payload,pro)).status,401);
  assert.equal((await call('/api/patient/diary','POST',payload,pc,'https://evil.example')).status,403);
  for(const bad of [{performed_date:'2026-02-30'},{performed_date:new Date(Date.parse(today)+86400000).toISOString().slice(0,10)},{performed_date:new Date(Date.parse(today)-30*86400000).toISOString().slice(0,10)},{feedback:'x'.repeat(2001)},{complaints:{}},{perception:'  ',complaints:'',feedback:''}])assert.equal((await call('/api/patient/diary','POST',{...payload,...bad},pc)).status,400);
  assert.equal((await call('/api/patient/diary','POST',payload,pc)).status,201);
  let row=(await call('/api/patient/dashboard','GET',undefined,pc)).data.diaryEntries[0];assert.equal(row.perception,payload.perception);assert.equal(row.revision,1);
  assert.equal((await call('/api/care/patients','GET',undefined,pro)).data.patients.find(p=>p.id==='one').last_record,today);
  assert.equal((await call('/api/patient/diary','POST',payload,pc)).status,409);
  // A supplied foreign ID cannot select another patient's record: ownership comes from the session.
  assert.equal((await call('/api/patient/diary','POST',{performed_date:today,perception:'Meu relato',id:row.id,patient_id:'one'},pc2)).status,201);
  assert.equal((await call('/api/patient/dashboard','GET',undefined,pc)).data.diaryEntries[0].perception,payload.perception);
  assert.equal((await call('/api/care/patients/one','GET',undefined,pro)).data.diaryEntries[0].feedback,payload.feedback);
  assert.equal((await call('/api/care/patients/one','GET',undefined,reader)).status,403);assert.equal((await call('/api/care/patients/two','GET',undefined,pro)).status,404);
  const created=row.created_at;assert.equal((await call('/api/patient/diary','POST',{...payload,perception:'Hoje tive mais facilidade.',revision:row.revision},pc)).status,201);
  assert.equal((await call('/api/patient/diary','POST',{...payload,revision:row.revision},pc)).status,409);
  row=(await call('/api/patient/dashboard','GET',undefined,pc)).data.diaryEntries[0];assert.equal(row.revision,2);assert.equal(row.created_at,created);
  assert.equal(app.db.prepare('SELECT perception FROM care_patient_diary_history WHERE entry_id=?').get(row.id).perception,payload.perception);
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM care_plans').get().n,0);assert.equal(app.db.prepare('SELECT count(*) AS n FROM care_function_logs').get().n,0);
  app.close();app=await createApp(options);assert.equal((await call('/api/patient/dashboard','GET',undefined,pc)).data.diaryEntries[0].perception,'Hoje tive mais facilidade.');
  app.db.prepare('UPDATE patients SET active=0 WHERE id=?').run('one');assert.equal((await call('/api/patient/diary','POST',{...payload,revision:2},pc)).status,401);
 }finally{app.close();await rm(dir,{recursive:true,force:true})}
});
