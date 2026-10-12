import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createApp} from '../server/app.mjs';
import {hashPassword} from '../server/security.mjs';
import {localDate} from '../server/patient-care.mjs';
const origin='https://progress.example';
test('Evolução funcional mantém metas comparáveis, histórico, privacidade e notas visíveis ao próprio paciente',async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'patient-progress-'));await mkdir(resolve(dir,'public'));await writeFile(resolve(dir,'public/index.html'),'<!doctype html>');const options={dataDir:resolve(dir,'data'),publicUrl:origin,staticDir:resolve(dir,'public')};let app=await createApp(options);
 try{
  const password='Senha longa apenas para teste',hash=await hashPassword(password),now=new Date().toISOString(),today=localDate(),future=new Date(Date.parse(today)+86400000).toISOString().slice(0,10),past=new Date(Date.parse(today)-86400000).toISOString().slice(0,10);
  for(const role of ['admin','professional','reader'])app.db.prepare('INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)').run(role,role+'@example.org',role,hash,role,now);
  app.db.prepare('INSERT INTO patients(id,email,name,owner_id,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('one','one@example.org','Paciente um','professional',hash,now,now);
  app.db.prepare('INSERT INTO patients(id,email,name,owner_id,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('two','two@example.org','Paciente dois','admin',hash,now,now);
  async function call(path,method='GET',payload,cookie='',requestOrigin=origin){const res=await app.handle(new Request(origin+path,{method,headers:{Cookie:cookie,Origin:requestOrigin,'Content-Type':'application/json'},...(payload===undefined?{}:{body:JSON.stringify(payload)})}));return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]}}
  const pro=(await call('/api/auth/login','POST',{email:'professional@example.org',password})).cookie,admin=(await call('/api/auth/login','POST',{email:'admin@example.org',password})).cookie,reader=(await call('/api/auth/login','POST',{email:'reader@example.org',password})).cookie;
  const pc=(await call('/api/patient/auth/login','POST',{email:'one@example.org',password})).cookie,pc2=(await call('/api/patient/auth/login','POST',{email:'two@example.org',password})).cookie;
  const path='/api/care/patients/one/function-goals';
  assert.equal((await call(path,'POST',{title:'Subir escadas'},pc)).status,401);assert.equal((await call(path,'POST',{title:'Subir escadas'},reader)).status,403);assert.equal((await call('/api/care/patients/two/function-goals','POST',{title:'Subir escadas'},pro)).status,404);
  assert.equal((await call(path,'POST',{title:'Subir escadas'},pro,'https://evil.example')).status,403);assert.equal((await call(path,'POST',{title:'ab'},pro)).status,400);
  const goal=await call(path,'POST',{title:'Subir um lance de escadas'},pro);assert.equal(goal.status,201);const gid=goal.data.id;
  assert.equal((await call(path,'POST',{title:'SUBIR UM LANCE DE ESCADAS'},pro)).status,409);
  const blank=(await call('/api/patient/dashboard','GET',undefined,pc)).data;assert.equal(blank.functionalGoals[0].title,'Subir um lance de escadas');assert.equal(blank.functionalLogs.length,0);assert.equal(blank.progressNotes.length,0);
  const log={goal_id:gid,performed_date:today,score:0,comment:'Ainda não consigo.'};assert.equal((await call('/api/patient/function-logs','POST',log,pro)).status,401);assert.equal((await call('/api/patient/function-logs','POST',log,pc2)).status,404);
  for(const invalid of [{score:-1},{score:11},{score:2.5},{score:null},{performed_date:future},{performed_date:'2026-02-30'},{performed_date:past},{comment:'x'.repeat(1001)}])assert.equal((await call('/api/patient/function-logs','POST',{...log,...invalid},pc)).status,400);
  assert.equal((await call('/api/patient/function-logs','POST',log,pc,'https://evil.example')).status,403);
  assert.equal((await call('/api/patient/function-logs','POST',log,pc)).status,201);assert.equal((await call('/api/patient/function-logs','POST',log,pc)).status,409);
  let dash=(await call('/api/patient/dashboard','GET',undefined,pc)).data;const row=dash.functionalLogs[0];assert.equal(row.score,0);assert.equal((await call('/api/patient/function-logs','POST',{...log,score:4,revision:row.revision},pc)).status,201);assert.equal((await call('/api/patient/function-logs','POST',{...log,score:5,revision:row.revision},pc)).status,409);
  assert.equal((await call('/api/patient/dashboard','GET',undefined,pc2)).data.functionalLogs.length,0);assert.equal((await call('/api/care/patients/one','GET',undefined,pro)).data.functionalLogs[0].score,4);assert.equal((await call('/api/care/patients/one','GET',undefined,reader)).status,403);
  assert.equal((await call('/api/care/patients/one/progress-notes','POST',{text:'Revisamos sua caminhada. Vamos acompanhar a distância.'},pro)).status,201);assert.equal((await call('/api/care/patients/one/progress-notes','POST',{text:'Intruso'},pc)).status,401);assert.equal((await call('/api/care/patients/two/progress-notes','POST',{text:'Intruso'},pro)).status,404);
  assert.equal((await call('/api/patient/dashboard','GET',undefined,pc)).data.progressNotes[0].author_name,'professional');assert.equal((await call('/api/patient/dashboard','GET',undefined,pc2)).data.progressNotes.length,0);
  for(const title of ['Caminhar 15 minutos','Sentar e levantar'])assert.equal((await call(path,'POST',{title},pro)).status,201);assert.equal((await call(path,'POST',{title:'Correr cinco minutos'},pro)).status,409);
  assert.equal((await call('/api/care/function-goals/'+gid,'PATCH',{active:false,revision:1},pc)).status,401);assert.equal((await call('/api/care/function-goals/'+gid,'PATCH',{active:false,revision:999},pro)).status,409);assert.equal((await call('/api/care/function-goals/'+gid,'PATCH',{active:false,revision:1},pro)).status,200);
  assert.equal((await call('/api/patient/function-logs','POST',{...log,revision:2},pc)).status,404);assert.equal((await call(path,'POST',{title:'Subir dois lances de escadas'},pro)).status,201);
  dash=(await call('/api/patient/dashboard','GET',undefined,pc)).data;assert.equal(dash.functionalGoals.find(g=>g.id===gid).active,false);assert.equal(dash.functionalLogs[0].goal_title,'Subir um lance de escadas');assert.equal(dash.functionalLogs[0].score,4);
  app.close();app=await createApp(options);dash=(await call('/api/patient/dashboard','GET',undefined,pc)).data;assert.equal(dash.functionalLogs[0].score,4);assert.match(dash.progressNotes[0].text,/caminhada/);assert.equal(dash.functionalGoals.length,4);
  assert.equal((await call('/api/materials','GET',undefined,pc)).status,401);
 }finally{app.close();await rm(dir,{recursive:true,force:true})}
});
