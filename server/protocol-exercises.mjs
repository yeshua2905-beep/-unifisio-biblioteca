import {randomUUID} from 'node:crypto';
import {safeString} from './security.mjs';
import {transaction} from './database.mjs';
import guides from './protocol-guides.json' with {type:'json'};
const fields={title:180,steps:6000,dose:2000,phase:120,equipment:180,chain:80,restriction:3000,progress:2000,reference:2000,url:2000};
const chains=['','Cadeia cinética fechada','Cadeia cinética aberta','Mista ou conforme execução'];
export function createProtocolExercisesHandler({db,required,body,reject,json,audit}){
 function target(kind,id,u){
  if(!['guide','material'].includes(kind)||typeof id!=='string'||!id||id.length>100)reject(400,'Protocolo inválido.');
  if(kind==='material'){
   const m=db.prepare('SELECT * FROM materials WHERE id=?').get(id);
   if(!m||m.kind!=='Protocolo clínico'||(u.role!=='admin'&&m.status!=='published'&&m.author_id!==u.id))reject(404,'Protocolo não encontrado.');
  }else{
   const guide=guides.find(g=>g.id===id);
   if(!guide||!guide.materialIds.some(mid=>db.prepare("SELECT id FROM materials WHERE id=? AND status='published'").get(mid)))reject(404,'Guia não encontrado.');
  }
 }
 const editable=(row,u)=>u.role==='admin'||(u.role==='professional'&&row.author_id===u.id&&row.status==='pending');
 function values(p){const result={};for(const [key,max] of Object.entries(fields)){const value=safeString(p[key]??'',max);if(value===null)reject(400,'Confira os campos e o tamanho dos textos.');result[key]=value;}if(!result.title||!result.steps||!result.dose)reject(400,'Informe nome, execução e dose do exercício.');if(!chains.includes(result.chain))reject(400,'Cadeia cinética inválida.');if(result.url){let url;try{url=new URL(result.url)}catch{reject(400,'Informe um link válido.');}if(!['http:','https:'].includes(url.protocol))reject(400,'Use um link http ou https.');}return result;}
 function checkRevision(p,row){if(!Number.isSafeInteger(p.revision)||p.revision!==row.revision)reject(409,'Este exercício foi atualizado por outra pessoa. Recarregue a lista antes de editar.');}
 return async function(req,url){
  const u=required(req),method=req.method;
  if(method==='GET'){
   const kind=url.searchParams.get('targetKind'),id=url.searchParams.get('targetId');target(kind,id,u);
   const rows=db.prepare("SELECT e.*,u.name AS author_name FROM protocol_exercises e JOIN users u ON u.id=e.author_id WHERE target_kind=? AND target_id=? AND e.status!='archived' ORDER BY e.created_at,e.id").all(kind,id).filter(row=>u.role==='admin'||row.status==='published'||row.author_id===u.id);
   return json({exercises:rows.map(row=>({...row,canEdit:editable(row,u)})),canContribute:u.role!=='reader',isAdmin:u.role==='admin'});
  }
  if(!['POST','PUT','PATCH'].includes(method))reject(405,'Método não permitido.');
  if(u.role==='reader')reject(403,'Seu acesso é de consulta.');
  const p=await body(req);
  if(method==='POST'){
   target(p.targetKind,p.targetId,u);const v=values(p),id=randomUUID(),now=new Date().toISOString(),status=u.role==='admin'?'published':'pending';
   transaction(db,()=>{db.prepare('INSERT INTO protocol_exercises(id,target_kind,target_id,title,steps,dose,phase,equipment,chain,restriction,progress,reference,url,status,author_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,p.targetKind,p.targetId,...Object.keys(fields).map(k=>v[k]),status,u.id,now,now);audit(u.id,'protocol_exercise_created',id)});
   return json({id,status},201);
  }
  if(typeof p.id!=='string'||p.id.length>100)reject(400,'Exercício inválido.');
  const row=db.prepare('SELECT * FROM protocol_exercises WHERE id=?').get(p.id);
  if(!row||row.status==='archived')reject(404,'Exercício não encontrado.');target(row.target_kind,row.target_id,u);
  if(!editable(row,u))reject(403,'Você não pode alterar este exercício.');checkRevision(p,row);
  transaction(db,()=>{
   if(method==='PUT'){
    const v=values(p);db.prepare('UPDATE protocol_exercises SET title=?,steps=?,dose=?,phase=?,equipment=?,chain=?,restriction=?,progress=?,reference=?,url=?,updated_at=?,revision=revision+1 WHERE id=?').run(...Object.keys(fields).map(k=>v[k]),new Date().toISOString(),row.id);audit(u.id,'protocol_exercise_updated',row.id);
   }else{
    if(!['published','archived'].includes(p.status))reject(400,'Situação inválida.');if(p.status==='published'&&u.role!=='admin')reject(403,'Somente administradores podem publicar.');db.prepare('UPDATE protocol_exercises SET status=?,updated_at=?,revision=revision+1 WHERE id=?').run(p.status,new Date().toISOString(),row.id);audit(u.id,p.status==='published'?'protocol_exercise_published':'protocol_exercise_archived',row.id);
   }
  });return json({ok:true});
 };
}
