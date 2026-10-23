import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createApp} from '../server/app.mjs';
import {hashPassword} from '../server/security.mjs';
import {suggestAssessment} from '../server/clinical-assessment.mjs';
const draft={complaint:'Dor no joelho',goals:'Subir escadas',context:'general',triage:'clear',factors:[{name:'Peso corporal',relevance:'possible',rationale:'Sobrepeso relatado; avaliar contexto e função.'}]};
test('Sugestão respeita triagem e não transforma sobrepeso em causa ou diagnóstico',()=>{
 const general=suggestAssessment(draft);assert.match(general.conduct,/hipótese a investigar/);assert.doesNotMatch(general.conduct,/Osteoartrite de joelho confirmada/);assert.deepEqual(general.sources,[]);
 const oa=suggestAssessment({...draft,context:'knee_oa'});assert.match(oa.conduct,/se sobrepeso\/obesidade estiver confirmado/);assert.equal(oa.sources.length,1);
 for(const triage of ['unassessed','refer']){const blocked=suggestAssessment({...draft,triage,context:'knee_oa'});assert.doesNotMatch(blocked.conduct,/fortalecimento local/);assert.deepEqual(blocked.sources,[])}
});
test('Anamnese persiste com histórico, controle de edição e acesso exclusivo de administrador',async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'assessment-'));await mkdir(resolve(dir,'public'));await writeFile(resolve(dir,'public/index.html'),'<!doctype html>');const options={dataDir:resolve(dir,'data'),publicUrl:'https://assessment.example',staticDir:resolve(dir,'public')};let app=await createApp(options);
 try{
 const password='Uma senha longa para teste',hash=await hashPassword(password),cookies={};
 for(const role of ['admin','professional','reader'])app.db.prepare('INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)').run(role,role+'@example.org',role,hash,role,new Date().toISOString());
 async function call(path,method='GET',payload,cookie=cookies.admin,origin=options.publicUrl){const r=await app.handle(new Request(options.publicUrl+path,{method,headers:{Cookie:cookie||'',Origin:origin,'Content-Type':'application/json'},...(payload===undefined?{}:{body:JSON.stringify(payload)})}));return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}}
 for(const role of ['admin','professional','reader'])cookies[role]=(await call('/api/auth/login','POST',{email:role+'@example.org',password},'')).cookie;
 const patient=await call('/api/care/patients','POST',{name:'Paciente teste',email:'paciente@example.org'});const path='/api/care/patients/'+patient.data.id+'/assessment';
 assert.equal((await call(path)).data.assessment,null);
 for(const cookie of ['',cookies.reader,cookies.professional])assert.ok([401,403].includes((await call(path,'GET',undefined,cookie)).status));
 assert.equal((await call(path,'PUT',draft,cookies.admin,'https://evil.example')).status,403);
 assert.equal((await call(path,'PUT',{...draft,factors:[{name:'Peso corporal',relevance:'relevant',rationale:''}]})).status,400);
 assert.equal((await call(path,'PUT',{...draft,complaint:'x'.repeat(4001)})).status,400);
 assert.equal((await call('/api/care/patients/missing/assessment')).status,404);
 const first=await call(path,'PUT',draft);assert.equal(first.status,200);assert.equal(first.data.assessment.revision,1);
 assert.equal((await call(path,'PUT',draft)).status,409);
 const next=await call(path,'PUT',{...draft,revision:1,conduct:'Conduta revisada pelo profissional'});assert.equal(next.status,200);assert.equal(next.data.assessment.revision,2);
 assert.equal(app.db.prepare('SELECT count(*) AS n FROM care_assessment_history').get().n,1);
 const suggestion=await call(path+'/suggest','POST',draft);assert.equal(suggestion.status,200);assert.match(suggestion.data.suggestion.conduct,/Subir escadas/);
 const activation=decodeURIComponent(new URL(patient.data.link).hash.slice('#convite-paciente='.length));const accepted=await call('/api/patient/auth/accept','POST',{token:activation,password},'');
 assert.equal((await call(path,'GET',undefined,accepted.cookie)).status,401);
 const dashboard=await call('/api/patient/dashboard','GET',undefined,accepted.cookie);assert.equal(dashboard.status,200);assert.equal(JSON.stringify(dashboard.data).includes('Conduta revisada pelo profissional'),false);
 app.db.close();app=await createApp(options);assert.equal((await call(path)).data.assessment.conduct,'Conduta revisada pelo profissional');
 }finally{app.db.close();await rm(dir,{recursive:true,force:true})}
});

test('Rascunho incorpora informações preenchidas e mostra lacunas sem inferir diagnóstico',()=>{
 const v={context:'general',triage:'clear',factors:[],complaint:'Dor no joelho',symptoms:'Dor nas escadas',history:'Três semanas',goals:'Voltar ao esporte',limitations:'Escadas',exam:'Força registrada',hypothesis:'Hipótese em avaliação',restrictions:'Sem restrições identificadas',routine:'Treino duas vezes',health:'Exames informados',sleep:'Sono interrompido',beliefs:'Receio de agachar',triageNotes:'Triagem realizada'};
 const result=suggestAssessment(v);
 for(const key of ['complaint','symptoms','history','goals','limitations','exam','hypothesis','restrictions','routine','health','sleep','beliefs','triageNotes'])assert.ok(result.conduct.includes(v[key]),key);
 assert.deepEqual(result.missingFields,[]);
 assert.deepEqual(suggestAssessment({...v,exam:'',restrictions:' '}).missingFields,['Exame físico e medidas funcionais','Restrições e precauções']);
 const long={...v};for(const key of ['complaint','symptoms','history','goals','limitations','exam','hypothesis','restrictions','routine','health','sleep','beliefs','triageNotes'])long[key]='x'.repeat(4000);
 long.factors=['Carga e rotina','Força e capacidade funcional','Sono e recuperação','Peso corporal','Medos e expectativas','Outros'].map(name=>({name,relevance:'possible',rationale:'y'.repeat(1000)}));
 const bounded=suggestAssessment(long);assert.ok(bounded.conduct.length<=4000);assert.ok(bounded.patientExplanation.length<=4000);assert.ok(bounded.conduct.includes('…'));
});
