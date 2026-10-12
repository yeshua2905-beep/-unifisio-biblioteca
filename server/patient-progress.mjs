import {randomUUID} from 'node:crypto';
import {transaction} from './database.mjs';
import {safeString} from './security.mjs';
const saoDate=value=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-')};
export function createPatientProgress({db,patientRequired,clinician,owned,body,reject,json,audit,localDate,validDate,daysBefore}){
 function data(patientId){return {
  functionalGoals:db.prepare('SELECT g.id,g.title,g.active,g.revision,g.created_at,u.name AS author_name FROM care_function_goals g JOIN users u ON u.id=g.author_id WHERE g.patient_id=? ORDER BY g.active DESC,g.created_at,g.rowid').all(patientId).map(g=>({...g,active:!!g.active})),
  functionalLogs:db.prepare('SELECT l.*,g.title AS goal_title FROM care_function_logs l JOIN care_function_goals g ON g.id=l.goal_id WHERE l.patient_id=? ORDER BY l.performed_date DESC,l.updated_at DESC LIMIT 1500').all(patientId),
  progressNotes:db.prepare('SELECT n.id,n.text,n.created_at,u.name AS author_name FROM care_progress_notes n JOIN users u ON u.id=n.author_id WHERE n.patient_id=? ORDER BY n.created_at DESC,n.rowid DESC LIMIT 100').all(patientId)
 }}
 function revision(input,row){if(!Number.isSafeInteger(input.revision)||input.revision!==row.revision)reject(409,'O registro foi atualizado. Recarregue antes de salvar.');}
 async function handle(req,path,method){
  if(path==='/api/patient/function-logs'&&method==='POST'){
   const patient=patientRequired(req),input=await body(req),today=localDate();
   if(typeof input.goal_id!=='string'||input.goal_id.length>100)reject(400,'Atividade funcional inválida.');
   if(!Number.isInteger(input.score)||input.score<0||input.score>10)reject(400,'Escolha sua capacidade de 0 a 10.');
   if(!validDate(input.performed_date)||input.performed_date>today||input.performed_date<daysBefore(today,29))reject(400,'Escolha uma data dentro dos últimos 30 dias.');
   const comment=safeString(input.comment??'',1000);if(comment===null)reject(400,'Use até 1.000 caracteres na observação.');
   let id;transaction(db,()=>{
    if(!db.prepare('SELECT id FROM patients WHERE id=? AND active=1').get(patient.id))reject(401,'Entre novamente na área do paciente.');
    const goal=db.prepare('SELECT * FROM care_function_goals WHERE id=? AND patient_id=? AND active=1').get(input.goal_id,patient.id);if(!goal)reject(404,'Atividade funcional não disponível.');
    if(input.performed_date<saoDate(goal.created_at))reject(400,'A data deve ser igual ou posterior à inclusão da atividade.');
    const old=db.prepare('SELECT * FROM care_function_logs WHERE patient_id=? AND goal_id=? AND performed_date=?').get(patient.id,goal.id,input.performed_date);if(old)revision(input,old);else if(input.revision!==undefined)reject(409,'Recarregue os registros antes de salvar.');
    id=old?.id||randomUUID();const now=new Date().toISOString();db.prepare('INSERT INTO care_function_logs(id,patient_id,goal_id,performed_date,score,comment,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(patient_id,goal_id,performed_date) DO UPDATE SET score=excluded.score,comment=excluded.comment,updated_at=excluded.updated_at,revision=care_function_logs.revision+1').run(id,patient.id,goal.id,input.performed_date,input.score,comment,now,now);audit(null,'patient_function_recorded',id);
   });return json({id},201);
  }
  const match=path.match(/^\/api\/care\/patients\/([^/]+)\/(function-goals|progress-notes)$/);
  if(match&&method==='POST'){
   const user=clinician(req),patient=owned(match[1],user),input=await body(req);if(!patient.active)reject(409,'O paciente está com o acesso suspenso.');
   if(match[2]==='function-goals'){
    const title=safeString(input.title,140);if(!title||title.length<3)reject(400,'Descreva uma atividade funcional em até 140 caracteres.');
    const id=randomUUID();transaction(db,()=>{if(!db.prepare('SELECT id FROM patients WHERE id=? AND active=1').get(patient.id))reject(409,'O paciente está com o acesso suspenso.');const active=db.prepare('SELECT title FROM care_function_goals WHERE patient_id=? AND active=1').all(patient.id);if(active.length>=3)reject(409,'Mantenha até três atividades funcionais ativas. Encerre uma para incluir outra.');if(active.some(g=>g.title.toLocaleLowerCase('pt-BR')===title.toLocaleLowerCase('pt-BR')))reject(409,'Essa atividade já está em acompanhamento.');db.prepare('INSERT INTO care_function_goals(id,patient_id,author_id,title,created_at) VALUES(?,?,?,?,?)').run(id,patient.id,user.id,title,new Date().toISOString());audit(user.id,'care_function_goal_added',id)});return json({id},201);
   }
   const text=safeString(input.text,2000);if(!text)reject(400,'Escreva uma orientação de até 2.000 caracteres.');const id=randomUUID();transaction(db,()=>{if(!db.prepare('SELECT id FROM patients WHERE id=? AND active=1').get(patient.id))reject(409,'O paciente está com o acesso suspenso.');db.prepare('INSERT INTO care_progress_notes(id,patient_id,author_id,text,created_at) VALUES(?,?,?,?,?)').run(id,patient.id,user.id,text,new Date().toISOString());audit(user.id,'care_progress_note_added',id)});return json({id},201);
  }
  const goalMatch=path.match(/^\/api\/care\/function-goals\/([^/]+)$/);
  if(goalMatch&&method==='PATCH'){
   const user=clinician(req),input=await body(req);if(input.active!==false)reject(400,'Use esta opção para encerrar a atividade funcional.');transaction(db,()=>{const goal=db.prepare('SELECT * FROM care_function_goals WHERE id=?').get(goalMatch[1]);if(!goal)reject(404,'Atividade não encontrada.');owned(goal.patient_id,user);revision(input,goal);if(!goal.active)reject(409,'Esta atividade já está encerrada.');db.prepare('UPDATE care_function_goals SET active=0,revision=revision+1 WHERE id=?').run(goal.id);audit(user.id,'care_function_goal_closed',goal.id)});return json({ok:true});
  }
  reject(404,'Página não encontrada.');
 }
 return {data,handle};
}
