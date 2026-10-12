import {imageFormat} from './image-format.mjs';
import {createPatientProgress} from './patient-progress.mjs';
import {randomUUID} from 'node:crypto';
import {safeString,validEmail,passwordValid,hashPassword,verifyPassword,token,digest} from './security.mjs';
import {transaction} from './database.mjs';
const WEEK=7*86400000;
export function localDate(now=new Date()){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');}
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const daysBefore=(date,n)=>new Date(Date.parse(date)-n*86400000).toISOString().slice(0,10);
export function createPatientCareHandler({db,required,body,reject,json,audit,rate,origin,secure,dummyHash,revokeProfessionalSession}){
 const cookieName=secure?'__Host-unifisio-patient':'unifisio_patient';
 const publicPatient=p=>({id:p.id,name:p.name,email:p.email});
 const cookie=(value,clear=false)=>`${cookieName}=${clear?'':value}; Path=/; HttpOnly; SameSite=Lax${clear?'; Max-Age=0':''}${secure?'; Secure':''}`;
 const rawCookie=req=>(req.headers.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1);
 function patientUser(req){const raw=rawCookie(req);return raw?db.prepare('SELECT p.* FROM patients p JOIN patient_sessions s ON s.patient_id=p.id WHERE s.token_hash=? AND s.expires_at>? AND p.active=1').get(digest(raw),Date.now())||null:null;}
 function patientRequired(req){const p=patientUser(req);if(!p)reject(401,'Entre na área do paciente para acessar.');return p;}
 function session(p){const t=token();db.prepare('INSERT INTO patient_sessions(token_hash,patient_id,expires_at) VALUES(?,?,?)').run(digest(t),p.id,Date.now()+WEEK);return t;}
 function clinician(req){const u=required(req);if(u.role==='reader')reject(403,'Seu acesso é de consulta.');return u;}
 function owned(id,u){if(typeof id!=='string'||id.length>100)reject(400,'Paciente inválido.');const p=db.prepare('SELECT * FROM patients WHERE id=?').get(id);if(!p||(u.role!=='admin'&&p.owner_id!==u.id))reject(404,'Paciente não encontrado.');return p;}
 function revision(p,row){const table=row.task_id?'care_logs':row.patient_id?'care_plans':'patients';const current=db.prepare('SELECT revision FROM '+table+' WHERE id=?').get(row.id);if(!Number.isSafeInteger(p.revision)||p.revision!==current?.revision)reject(409,'O registro foi atualizado. Recarregue antes de salvar.');}
 function invite(p,u){const t=token(),now=new Date().toISOString(),kind=p.password_hash?'reset':'activate',expires=Date.now()+(kind==='reset'?3600000:WEEK);db.prepare('UPDATE patient_invites SET used_at=? WHERE patient_id=? AND used_at IS NULL').run(Date.now(),p.id);db.prepare('INSERT INTO patient_invites(id,token_hash,patient_id,kind,expires_at,created_by,created_at) VALUES(?,?,?,?,?,?,?)').run(randomUUID(),digest(t),p.id,kind,expires,u.id,now);audit(u.id,'patient_access_link_created',p.id);return {link:origin+'/paciente#convite-paciente='+encodeURIComponent(t),expires_at:expires,kind};}
 function tasks(planId){return db.prepare('SELECT * FROM care_tasks WHERE plan_id=? ORDER BY position').all(planId).map(t=>{const {coach_config,...task}=t,coach=JSON.parse(coach_config||'{}');return {...task,days:JSON.parse(t.days),...(coach.mode?{coach}:{})}});}
 function plans(patientId,patientOnly=false){return db.prepare(`SELECT p.*,u.name AS author_name FROM care_plans p JOIN users u ON u.id=p.author_id WHERE patient_id=? ${patientOnly?"AND p.status IN ('active','completed')":""} ORDER BY p.created_at DESC,p.rowid DESC`).all(patientId).map(p=>({...p,tasks:tasks(p.id)}));}
 function measurements(patientId){return db.prepare('SELECT m.*,p.title AS plan_title FROM care_measurements m JOIN care_plans p ON p.id=m.plan_id WHERE m.patient_id=? ORDER BY m.performed_date DESC,m.before_at DESC LIMIT 500').all(patientId).map(m=>({...m,corrections:db.prepare('SELECT phase,previous_eva,previous_borg,new_eva,new_borg,reason,created_at FROM care_measurement_corrections WHERE measurement_id=? ORDER BY created_at DESC,rowid DESC LIMIT 5').all(m.id)}));}
 function dailyScales(patientId){return db.prepare('SELECT s.*,u.name AS author_name FROM care_daily_scales s LEFT JOIN users u ON u.id=s.author_id WHERE s.patient_id=? ORDER BY s.performed_date DESC,s.updated_at DESC LIMIT 500').all(patientId).map(s=>({...s,history:db.prepare('SELECT h.*,u.name AS author_name FROM care_daily_scale_history h LEFT JOIN users u ON u.id=h.author_id WHERE h.record_id=? ORDER BY h.revision DESC').all(s.id)}));}
 function logs(patientId){return db.prepare('SELECT l.*,t.title AS task_title,t.plan_id,p.title AS plan_title FROM care_logs l JOIN care_tasks t ON t.id=l.task_id JOIN care_plans p ON p.id=t.plan_id WHERE l.patient_id=? ORDER BY l.performed_date DESC,l.updated_at DESC LIMIT 500').all(patientId).map(l=>({...l,feedback:db.prepare('SELECT f.id,f.text,f.created_at,u.name AS author_name FROM care_feedback f JOIN users u ON u.id=f.author_id WHERE log_id=? ORDER BY f.created_at').all(l.id)}));}
 function coachValues(input,kind){
  if(input===undefined||input===null)return undefined;
  if(kind!=='exercise'||typeof input!=='object'||Array.isArray(input)||!['reps','time'].includes(input.mode))reject(400,'Confira os dados do guia de treino.');
  const valid=(key,min,max)=>Number.isInteger(input[key])&&input[key]>=min&&input[key]<=max;
  if(!valid('sets',1,20)||!valid('restSeconds',0,300)||(input.mode==='reps'&&(!valid('reps',1,100)||!valid('repSeconds',1,30)))||(input.mode==='time'&&!valid('seconds',1,600)))reject(400,'Confira séries, repetições ou tempo e descanso do guia.');
  const command=input.command===undefined?undefined:safeString(input.command,80);
  if(input.command!==undefined&&!command)reject(400,'Informe um comando curto para o movimento (até 80 caracteres).');
  if(input.releaseSeconds!==undefined&&(!Number.isInteger(input.releaseSeconds)||input.releaseSeconds<0||input.releaseSeconds>60))reject(400,'Use de 0 a 60 segundos para relaxar entre repetições.');
  const illustration=input.illustration;
  if(illustration!==undefined&&!['auto','squat','lunge','step','calf','seated','knee','hamstring','bridge','hip','side','hinge','quadruped','supine','plank','push','raise','row','elbow','rotation','wrist','hand','foot','neck','walk','balance','general','custom'].includes(illustration))reject(400,'Selecione uma ilustração válida.');
  let illustrationImage;
  if(illustration==='custom'){
   if(typeof input.illustrationImage!=='string'||input.illustrationImage.length>340000)reject(400,'Envie a imagem específica do exercício com até 250 KB.');
   const match=input.illustrationImage.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
   if(!match)reject(400,'Envie uma imagem JPG, PNG ou WebP válida.');
   try{const bytes=Buffer.from(match[2],'base64'),format=imageFormat(bytes);if(bytes.length>250000||format.mime!==match[1])throw Error('Formato');illustrationImage=input.illustrationImage}catch{reject(400,'A imagem do exercício é inválida.');}
  }
  return {mode:input.mode,sets:input.sets,restSeconds:input.restSeconds,...(input.mode==='reps'?{reps:input.reps,repSeconds:input.repSeconds}:{seconds:input.seconds}),...(command===undefined?{}:{command}),...(input.releaseSeconds===undefined?{}:{releaseSeconds:input.releaseSeconds}),...(illustration===undefined?{}:{illustration}),...(illustrationImage?{illustrationImage}:{})};
 }
 function planValues(p){const title=safeString(p.title,180),goal=safeString(p.goal??'',2000),instructions=safeString(p.instructions??'',4000);if(!title||goal===null||instructions===null||!validDate(p.start_date)||!validDate(p.end_date)||p.end_date<p.start_date||Date.parse(p.end_date)-Date.parse(p.start_date)>366*86400000)reject(400,'Confira título e período do plano (até um ano).');if(!Array.isArray(p.tasks)||p.tasks.length>30)reject(400,'Use até 30 tarefas por plano.');const entries=p.tasks.map(t=>{if(!t||typeof t!=='object')reject(400,'Tarefa inválida.');const values={};for(const [key,max] of Object.entries({title:180,steps:6000,dose:2000,equipment:180,restriction:3000,url:2000})){values[key]=safeString(t[key]??'',max);if(values[key]===null)reject(400,'Confira os textos das tarefas.');}if(!['exercise','conduct'].includes(t.kind)||!values.title||!values.steps||!values.dose||!Array.isArray(t.days)||!t.days.length||t.days.length>7||new Set(t.days).size!==t.days.length||t.days.some(d=>!Number.isInteger(d)||d<0||d>6))reject(400,'Informe tipo, título, execução, dose e dias de cada tarefa.');if(values.url){let url;try{url=new URL(values.url)}catch{reject(400,'Link inválido.');}if(!['http:','https:'].includes(url.protocol))reject(400,'Use links http ou https.');}return {...values,kind:t.kind,days:t.days,coach:coachValues(t.coach,t.kind)};});return {title,goal,instructions,start_date:p.start_date,end_date:p.end_date,tasks:entries};}
 function saveTasks(id,entries){const insert=db.prepare('INSERT INTO care_tasks(id,plan_id,kind,title,steps,dose,days,equipment,restriction,url,position,coach_config) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');entries.forEach((t,i)=>insert.run(randomUUID(),id,t.kind,t.title,t.steps,t.dose,JSON.stringify(t.days),t.equipment,t.restriction,t.url,i,JSON.stringify(t.coach||{})));}
 const progress=createPatientProgress({db,patientRequired,clinician,owned,body,reject,json,audit,localDate,validDate,daysBefore});
 const handle=async function(req,url,ip){const path=url.pathname,method=req.method;
  if(path==='/api/patient/function-logs'||/^\/api\/care\/patients\/[^/]+\/(function-goals|progress-notes)$/.test(path)||/^\/api\/care\/function-goals\/[^/]+$/.test(path))return progress.handle(req,path,method);
  const dailyMatch=path.match(/^\/api\/care\/patients\/([^/]+)\/daily-scales$/);
  if((path==='/api/patient/daily-scales'||dailyMatch)&&method==='POST'){
   const user=dailyMatch?clinician(req):null,p=dailyMatch?owned(dailyMatch[1],user):patientRequired(req),input=await body(req),today=localDate();
   if(!p.active)reject(409,'Reative o paciente para registrar as escalas.');
   if(!validDate(input.performed_date)||input.performed_date>today||input.performed_date<daysBefore(today,29)||(!dailyMatch&&input.performed_date!==today))reject(400,'Selecione uma data válida: hoje para o paciente ou os últimos 30 dias para o profissional.');
   if(!['now','before','after'].includes(input.moment)||!Number.isInteger(input.eva)||input.eva<0||input.eva>100||![0,0.5,1,2,3,4,5,6,7,8,9,10].includes(input.borg))reject(400,'Selecione o momento, a dor de 0 a 10 e o esforço de 0 a 10.');
   let id;
   transaction(db,()=>{
    const live=user?owned(p.id,user):patientRequired(req);if(!live.active)reject(409,'O paciente está com o acesso suspenso.');
    const old=db.prepare('SELECT * FROM care_daily_scales WHERE patient_id=? AND performed_date=? AND moment=?').get(p.id,input.performed_date,input.moment),now=new Date().toISOString();
    if(old){
     if(!Number.isSafeInteger(input.revision)||input.revision!==old.revision)reject(409,'Este registro mudou. Atualize a página antes de salvar.');
     db.prepare('INSERT INTO care_daily_scale_history(id,record_id,eva,borg,author_id,revision,created_at) VALUES(?,?,?,?,?,?,?)').run(randomUUID(),old.id,old.eva,old.borg,old.author_id,old.revision,old.updated_at);
     id=old.id;db.prepare('UPDATE care_daily_scales SET eva=?,borg=?,author_id=?,revision=revision+1,updated_at=? WHERE id=?').run(input.eva,input.borg,user?.id||null,now,id);
    }else{
     if(input.revision!==undefined)reject(409,'Atualize a página antes de salvar.');
     id=randomUUID();db.prepare('INSERT INTO care_daily_scales(id,patient_id,performed_date,moment,eva,borg,author_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,p.id,input.performed_date,input.moment,input.eva,input.borg,user?.id||null,now,now);
    }
    audit(user?.id||null,'daily_scales_saved',id);
   });return json({id},201);
  }
  if(path==='/api/patient/auth/me'&&method==='GET'){const p=patientUser(req);return json({patient:p?publicPatient(p):null})}
  if(path==='/api/patient/auth/login'&&method==='POST'){const input=await body(req),email=safeString(input.email,254)?.toLowerCase()||'';rate(ip,'patient:'+email);const password=typeof input.password==='string'&&input.password.length<=128?input.password:'';const p=db.prepare('SELECT * FROM patients WHERE email=?').get(email);const valid=await verifyPassword(password,p?.password_hash||dummyHash);const live=p?db.prepare('SELECT * FROM patients WHERE id=?').get(p.id):null;if(!valid||!live?.active||live.password_hash!==p.password_hash)reject(401,'E-mail ou senha inválidos.');revokeProfessionalSession(req);return json({patient:publicPatient(live)},200,{'Set-Cookie':cookie(session(live))})}
  if(path==='/api/patient/auth/logout'&&method==='POST'){const raw=rawCookie(req);if(raw)db.prepare('DELETE FROM patient_sessions WHERE token_hash=?').run(digest(raw));return json({ok:true},200,{'Set-Cookie':cookie('',true)})}
  if(['/api/patient/auth/invitation','/api/patient/auth/accept'].includes(path)&&method==='POST'){
   const input=await body(req);rate(ip,'patient-invitation');if(typeof input.token!=='string'||input.token.length>100)reject(400,'Convite inválido.');const i=db.prepare('SELECT i.*,p.name,p.email,p.active FROM patient_invites i JOIN patients p ON p.id=i.patient_id WHERE i.token_hash=? AND i.used_at IS NULL AND i.expires_at>? AND p.active=1').get(digest(input.token),Date.now());if(!i)reject(404,'Link inválido ou expirado. Solicite um novo ao profissional.');if(path.endsWith('/invitation'))return json({invitation:{name:i.name,email:i.email,kind:i.kind}});
   if(!passwordValid(input.password))reject(400,'Use uma senha de 12 a 128 caracteres.');const hash=await hashPassword(input.password);transaction(db,()=>{const live=db.prepare('SELECT i.id FROM patient_invites i JOIN patients p ON p.id=i.patient_id WHERE i.id=? AND i.used_at IS NULL AND i.expires_at>? AND p.active=1').get(i.id,Date.now());if(!live)reject(400,'Este link não está mais disponível.');db.prepare('UPDATE patients SET password_hash=?,updated_at=? WHERE id=?').run(hash,new Date().toISOString(),i.patient_id);db.prepare('UPDATE patient_invites SET used_at=? WHERE patient_id=? AND used_at IS NULL').run(Date.now(),i.patient_id);db.prepare('DELETE FROM patient_sessions WHERE patient_id=?').run(i.patient_id);audit(null,'patient_access_activated',i.patient_id);revokeProfessionalSession(req)});const p=db.prepare('SELECT * FROM patients WHERE id=?').get(i.patient_id);return json({patient:publicPatient(p)},200,{'Set-Cookie':cookie(session(p))});
  }
  if(path==='/api/patient/auth/password'&&method==='POST'){const p=patientRequired(req),input=await body(req);rate(ip,'patient-password:'+p.id);if(!passwordValid(input.password))reject(400,'Use uma senha de 12 a 128 caracteres.');if(typeof input.currentPassword!=='string'||input.currentPassword.length>128||!await verifyPassword(input.currentPassword,p.password_hash))reject(400,'A senha atual não confere.');const hash=await hashPassword(input.password);transaction(db,()=>{const live=patientRequired(req);if(live.password_hash!==p.password_hash)reject(409,'A senha foi alterada. Entre novamente antes de tentar.');db.prepare('UPDATE patients SET password_hash=?,updated_at=? WHERE id=?').run(hash,new Date().toISOString(),p.id);db.prepare('DELETE FROM patient_sessions WHERE patient_id=?').run(p.id);audit(null,'patient_password_changed',p.id)});return json({ok:true},200,{'Set-Cookie':cookie(session(p))})}
  if(path==='/api/patient/dashboard'&&method==='GET'){const p=patientRequired(req);return json({patient:publicPatient(p),today:localDate(),plans:plans(p.id,true),logs:logs(p.id),measurements:measurements(p.id),dailyScales:dailyScales(p.id),...progress.data(p.id)})}
  if(path==='/api/patient/measurements'&&method==='POST'){
   const patient=patientRequired(req),input=await body(req);
   if(typeof input.plan_id!=='string'||input.plan_id.length>100||!validDate(input.performed_date)||!['before','after'].includes(input.phase))reject(400,'Registro de sessão inválido.');
   if(!Number.isInteger(input.eva)||input.eva<0||input.eva>100)reject(400,'Marque a posição da dor na EVA.');
   if(input.action!==undefined&&input.action!=='correct')reject(400,'Ação inválida.');
   if(input.borg_scale!==undefined&&!['rpe6_20','modified0_10'].includes(input.borg_scale))reject(400,'Escala de esforço inválida.');
   let id;
   transaction(db,()=>{
    patientRequired(req);
    const plan=db.prepare("SELECT * FROM care_plans WHERE id=? AND patient_id=? AND status IN ('active','completed')").get(input.plan_id,patient.id);
    if(!plan)reject(404,'Plano não disponível.');
    const old=db.prepare('SELECT * FROM care_measurements WHERE patient_id=? AND plan_id=? AND performed_date=?').get(patient.id,plan.id,input.performed_date);
    const borgScale=old?.borg_scale||input.borg_scale||'rpe6_20';
    if(old&&input.borg_scale!==undefined&&input.borg_scale!==old.borg_scale)reject(400,'Use a mesma escala de esforço nas duas etapas da sessão.');
    if(borgScale==='modified0_10'?![0,0.5,1,2,3,4,5,6,7,8,9,10].includes(input.borg):!Number.isInteger(input.borg)||input.borg<6||input.borg>20)reject(400,borgScale==='modified0_10'?'Selecione o esforço de 0 a 10, incluindo 0,5.':'Selecione o esforço na Borg RPE de 6 a 20.');
    if(old){if(!Number.isSafeInteger(input.revision)||input.revision!==old.revision)reject(409,'A sessão foi atualizada. Recarregue antes de salvar.');}
    else if(input.revision!==undefined)reject(409,'Recarregue a sessão antes de salvar.');
    const now=new Date().toISOString(),today=localDate();
    if(input.action==='correct'){
     if(!old)reject(409,'Não existe resposta salva para corrigir.');
     if(input.performed_date<daysBefore(today,29)||input.performed_date>today)reject(400,'Correções estão disponíveis para os últimos 30 dias.');
     if(input.phase==='after'&&!old.after_at)reject(409,'Preencha primeiro a resposta depois de terminar.');
     const reason=safeString(input.reason,1000);if(!reason||reason.length<3)reject(400,'Descreva brevemente o motivo da correção.');
     const previousEva=old[input.phase==='before'?'eva_before':'eva_after'],previousBorg=old[input.phase==='before'?'borg_before':'borg_after'];
     if(input.eva===previousEva&&input.borg===previousBorg)reject(400,'As respostas não foram alteradas.');
     id=old.id;db.prepare('INSERT INTO care_measurement_corrections(id,measurement_id,patient_id,phase,previous_eva,previous_borg,new_eva,new_borg,reason,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),id,patient.id,input.phase,previousEva,previousBorg,input.eva,input.borg,reason,now);
     const fields=input.phase==='before'?'eva_before=?,borg_before=?':'eva_after=?,borg_after=?';db.prepare('UPDATE care_measurements SET '+fields+',revision=revision+1 WHERE id=?').run(input.eva,input.borg,id);
     audit(null,'patient_scales_'+input.phase+'_corrected',id);return;
    }
    if(input.phase==='before'){
     if(old)reject(409,'O registro anterior ao exercício já foi salvo.');
     if(plan.status!=='active'||input.performed_date!==today||today<plan.start_date||today>plan.end_date||!tasks(plan.id).some(t=>t.kind==='exercise'&&t.days.includes(new Date(today+'T12:00:00Z').getUTCDay())))reject(400,'Registre antes de iniciar os exercícios programados para hoje.');
     id=randomUUID();db.prepare('INSERT INTO care_measurements(id,patient_id,plan_id,performed_date,eva_before,borg_before,before_at,borg_scale) VALUES(?,?,?,?,?,?,?,?)').run(id,patient.id,plan.id,today,input.eva,input.borg,now,borgScale);
    }else{
     if(!old)reject(409,'Preencha primeiro o registro antes de iniciar.');
     if(old.after_at)reject(409,'Esta sessão já tem o registro depois de terminar.');
     if(Date.now()-Date.parse(old.before_at)>36*3600000)reject(400,'O prazo de 36 horas desta sessão terminou. O registro anterior foi preservado.');
     id=old.id;db.prepare('UPDATE care_measurements SET eva_after=?,borg_after=?,after_at=?,revision=revision+1 WHERE id=?').run(input.eva,input.borg,now,id);
    }
    audit(null,'patient_scales_'+input.phase,id);
   });return json({id},201);
  }
  if(path==='/api/patient/logs'&&method==='POST'){
   const p=patientRequired(req),input=await body(req),today=localDate();if(typeof input.task_id!=='string'||input.task_id.length>100)reject(400,'Tarefa inválida.');const task=db.prepare("SELECT t.*,p.patient_id,p.status,p.start_date,p.end_date FROM care_tasks t JOIN care_plans p ON p.id=t.plan_id WHERE t.id=? AND p.patient_id=? AND p.status='active'").get(input.task_id,p.id);if(!task)reject(404,'Tarefa não disponível.');if(!validDate(input.performed_date)||input.performed_date>today||input.performed_date<daysBefore(today,29)||input.performed_date<task.start_date||input.performed_date>task.end_date||!JSON.parse(task.days).includes(new Date(input.performed_date+'T12:00:00Z').getUTCDay()))reject(400,'Escolha um dia previsto no plano, dentro dos últimos 30 dias.');if(!['done','partial','skipped'].includes(input.status))reject(400,'Informe como foi a tarefa.');for(const key of ['pain','difficulty'])if(input[key]!==null&&input[key]!==undefined&&(!Number.isInteger(input[key])||input[key]<0||input[key]>10))reject(400,'Use valores de 0 a 10.');const comment=safeString(input.comment??'',2000);if(comment===null)reject(400,'Observação muito longa.');const now=new Date().toISOString();let id;
   transaction(db,()=>{patientRequired(req);const live=db.prepare("SELECT p.status FROM care_tasks t JOIN care_plans p ON p.id=t.plan_id WHERE t.id=? AND p.patient_id=?").get(task.id,p.id);if(live?.status!=='active')reject(409,'O plano foi alterado. Atualize antes de salvar.');const previous=db.prepare('SELECT * FROM care_logs WHERE patient_id=? AND task_id=? AND performed_date=?').get(p.id,task.id,input.performed_date);if(previous)revision(input,previous);else if(input.revision!==undefined)reject(409,'Recarregue os registros antes de salvar.');id=previous?.id||randomUUID();db.prepare('INSERT INTO care_logs(id,patient_id,task_id,performed_date,status,pain,difficulty,comment,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(patient_id,task_id,performed_date) DO UPDATE SET status=excluded.status,pain=excluded.pain,difficulty=excluded.difficulty,comment=excluded.comment,updated_at=excluded.updated_at,revision=care_logs.revision+1').run(id,p.id,task.id,input.performed_date,input.status,input.pain??null,input.difficulty??null,comment,now,now);audit(null,'patient_task_recorded',id)});return json({id},201);
  }
  if(path.startsWith('/api/patient/'))reject(404,'Página não encontrada.');
  const u=clinician(req);
  if(path==='/api/care/patients'&&method==='GET'){
   const rows=db.prepare(`SELECT p.id,p.email,p.name,p.phone,p.owner_id,p.active,p.revision,p.created_at,p.updated_at,p.password_hash IS NOT NULL AS has_access,u.name AS owner_name,(SELECT title FROM care_plans c WHERE c.patient_id=p.id AND c.status='active') AS active_plan,(SELECT MAX(performed_date) FROM care_logs l WHERE l.patient_id=p.id) AS last_record FROM patients p JOIN users u ON u.id=p.owner_id ${u.role==='admin'?'':'WHERE owner_id=?'} ORDER BY p.name`).all(...(u.role==='admin'?[]:[u.id]));return json({patients:rows,today:localDate()});
  }
  if(path==='/api/care/patients'&&method==='POST'){
   const input=await body(req),name=safeString(input.name,100),email=safeString(input.email,254)?.toLowerCase(),phone=safeString(input.phone??'',40);if(!name||!validEmail(email)||phone===null)reject(400,'Informe nome e e-mail válidos.');if(db.prepare('SELECT id FROM patients WHERE email=?').get(email))reject(409,'Este e-mail já está cadastrado como paciente.');const id=randomUUID(),now=new Date().toISOString();let access;transaction(db,()=>{db.prepare('INSERT INTO patients(id,email,name,phone,owner_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,email,name,phone,u.id,now,now);access=invite(db.prepare('SELECT * FROM patients WHERE id=?').get(id),u);audit(u.id,'patient_created',id)});return json({id,...access},201);
  }
  const patientMatch=path.match(/^\/api\/care\/patients\/([^/]+)(?:\/(access|plans))?$/);
  if(patientMatch){const p=owned(patientMatch[1],u),action=patientMatch[2];
   if(!action&&method==='GET')return json({patient:{id:p.id,name:p.name,email:p.email,phone:p.phone,active:!!p.active,revision:p.revision,has_access:!!p.password_hash},today:localDate(),plans:plans(p.id),logs:logs(p.id),measurements:measurements(p.id),dailyScales:dailyScales(p.id),...progress.data(p.id)});
   if(!action&&method==='PATCH'){const input=await body(req);revision(input,p);if(typeof input.active!=='boolean')reject(400,'Situação inválida.');transaction(db,()=>{revision(input,p);db.prepare('UPDATE patients SET active=?,revision=revision+1,updated_at=? WHERE id=?').run(input.active?1:0,new Date().toISOString(),p.id);if(!input.active){db.prepare('DELETE FROM patient_sessions WHERE patient_id=?').run(p.id);db.prepare('UPDATE patient_invites SET used_at=? WHERE patient_id=? AND used_at IS NULL').run(Date.now(),p.id)}audit(u.id,input.active?'patient_reactivated':'patient_suspended',p.id)});return json({ok:true});}
   if(action==='access'&&method==='POST'){if(!p.active)reject(409,'Reative o paciente para criar um link.');return json(transaction(db,()=>invite(p,u)),201);}
   if(action==='plans'&&method==='POST'){if(!p.active)reject(409,'Reative o paciente para criar um plano.');const v=planValues(await body(req)),id=randomUUID(),now=new Date().toISOString();transaction(db,()=>{if(!owned(p.id,u).active)reject(409,'Reative o paciente para criar um plano.');db.prepare("INSERT INTO care_plans(id,patient_id,author_id,title,goal,instructions,start_date,end_date,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,'draft',?,?)").run(id,p.id,u.id,v.title,v.goal,v.instructions,v.start_date,v.end_date,now,now);saveTasks(id,v.tasks);audit(u.id,'care_plan_drafted',id)});return json({id},201);}
  }
  const planMatch=path.match(/^\/api\/care\/plans\/([^/]+)$/);
  if(planMatch){const input=await body(req);const row=db.prepare('SELECT * FROM care_plans WHERE id=?').get(planMatch[1]);if(!row)reject(404,'Plano não encontrado.');const p=owned(row.patient_id,u);revision(input,row);
   if(method==='PUT'){if(row.status!=='draft')reject(409,'Crie uma nova versão para alterar um plano já publicado.');const v=planValues(input);transaction(db,()=>{revision(input,row);db.prepare('UPDATE care_plans SET title=?,goal=?,instructions=?,start_date=?,end_date=?,revision=revision+1,updated_at=? WHERE id=?').run(v.title,v.goal,v.instructions,v.start_date,v.end_date,new Date().toISOString(),row.id);db.prepare('DELETE FROM care_tasks WHERE plan_id=?').run(row.id);saveTasks(row.id,v.tasks);audit(u.id,'care_plan_updated',row.id)});return json({ok:true});}
   if(method==='PATCH'){if(!['active','completed','archived'].includes(input.status)||(input.status==='active'&&row.status!=='draft')||(input.status==='completed'&&row.status!=='active')||(input.status==='archived'&&!['draft','completed'].includes(row.status)))reject(400,'Mudança de situação inválida.');if(input.status==='active'&&(!p.active||!tasks(row.id).length||row.end_date<localDate()))reject(400,'Inclua tarefas e um período atual antes de publicar.');const now=new Date().toISOString();transaction(db,()=>{revision(input,row);if(input.status==='active'&&!owned(p.id,u).active)reject(409,'Reative o paciente antes de publicar.');if(input.status==='active')db.prepare("UPDATE care_plans SET status='completed',revision=revision+1,updated_at=? WHERE patient_id=? AND status='active'").run(now,p.id);db.prepare('UPDATE care_plans SET status=?,revision=revision+1,updated_at=?,published_at=COALESCE(published_at,?) WHERE id=?').run(input.status,now,input.status==='active'?now:null,row.id);audit(u.id,'care_plan_'+input.status,row.id)});return json({ok:true});}
  }
  const coachMatch=path.match(/^\/api\/care\/tasks\/([^/]+)\/coach$/);
  if(coachMatch&&method==='PATCH'){
   const input=await body(req);
   const task=db.prepare('SELECT t.*,p.patient_id,p.status,p.revision AS plan_revision FROM care_tasks t JOIN care_plans p ON p.id=t.plan_id WHERE t.id=?').get(coachMatch[1]);
   if(!task)reject(404,'Exercício não encontrado.');
   const p=owned(task.patient_id,u);if(!p.active||task.status!=='active')reject(409,'Configure o timer de um plano ativo.');
   const coach=coachValues(input.coach,task.kind);
   transaction(db,()=>{
    const live=db.prepare('SELECT revision,status FROM care_plans WHERE id=?').get(task.plan_id);
    if(!Number.isSafeInteger(input.revision)||input.revision!==live.revision||live.status!=='active')reject(409,'O plano foi alterado. Atualize antes de salvar.');
    db.prepare('UPDATE care_tasks SET coach_config=? WHERE id=?').run(JSON.stringify(coach||{}),task.id);
    db.prepare('UPDATE care_plans SET revision=revision+1,updated_at=? WHERE id=?').run(new Date().toISOString(),task.plan_id);
    audit(u.id,'exercise_coach_updated',task.id);
   });return json({ok:true});
  }
  const feedbackMatch=path.match(/^\/api\/care\/logs\/([^/]+)\/feedback$/);
  if(feedbackMatch&&method==='POST'){const log=db.prepare('SELECT * FROM care_logs WHERE id=?').get(feedbackMatch[1]);if(!log)reject(404,'Registro não encontrado.');owned(log.patient_id,u);const input=await body(req),text=safeString(input.text,2000);if(!text)reject(400,'Escreva o retorno ao paciente.');const id=randomUUID();transaction(db,()=>{db.prepare('INSERT INTO care_feedback(id,log_id,author_id,text,created_at) VALUES(?,?,?,?,?)').run(id,log.id,u.id,text,new Date().toISOString());audit(u.id,'care_feedback_added',id)});return json({id},201);}
  reject(404,'Página não encontrada.');
 };
 handle.revokePatientSession=req=>{const raw=rawCookie(req);if(raw)db.prepare('DELETE FROM patient_sessions WHERE token_hash=?').run(digest(raw));};
 return handle;
}
