import {transaction} from './database.mjs';
import {safeString} from './security.mjs';
export const assessmentFields=['complaint','history','symptoms','limitations','goals','health','routine','sleep','beliefs','exam','hypothesis','restrictions','triageNotes','conduct','patientExplanation','reassessment'];
export const factorNames=['Carga e rotina','Força e capacidade funcional','Sono e recuperação','Peso corporal','Medos e expectativas','Outros'];
export function assessmentValues(input,reject){
 if(!input||typeof input!=='object'||Array.isArray(input))reject(400,'Dados da anamnese inválidos.');
 const value={};
 for(const key of assessmentFields){value[key]=safeString(input[key]??'',4000);if(value[key]===null)reject(400,'Use até 4.000 caracteres por campo.');}
 if(!['unassessed','clear','refer'].includes(input.triage))reject(400,'Confira a triagem clínica.');
 if(!['general','knee_oa'].includes(input.context))reject(400,'Confira o contexto clínico.');
 value.triage=input.triage;value.context=input.context;
 if(!Array.isArray(input.factors)||input.factors.length>6)reject(400,'Confira os fatores clínicos.');
 const names=new Set();value.factors=input.factors.map(f=>{if(!f||!factorNames.includes(f.name)||names.has(f.name)||!['unknown','possible','relevant','unrelated'].includes(f.relevance))reject(400,'Fator clínico inválido.');names.add(f.name);const rationale=safeString(f.rationale??'',1000);if(rationale===null||(['possible','relevant'].includes(f.relevance)&&!rationale))reject(400,'Justifique os fatores considerados relevantes ou possíveis.');return {name:f.name,relevance:f.relevance,rationale};});
 return value;
}
// Structured drafting only: never infer a diagnosis or a causal factor from free text.
export function suggestAssessment(v){
 if(v.triage!=='clear')return {conduct:v.triage==='refer'?'Prioridade: esclarecer os sinais de alerta e organizar avaliação/encaminhamento conforme a urgência clínica. Não iniciar progressão automática de exercícios.':'Completar a triagem clínica antes de formular a conduta.',patientExplanation:'Precisamos concluir a avaliação para definir os próximos passos com segurança.',reassessment:'Registrar resultado da avaliação e encaminhamento antes de avançar.',sources:[]};
 const factors=v.factors.filter(f=>['possible','relevant'].includes(f.relevance));
 const conduct=[`Objetivo acordado: ${v.goals||'definir com o paciente uma atividade prioritária e uma medida de progresso.'}`,`Limitação a abordar: ${v.limitations||'registrar capacidade atual na atividade escolhida.'}`,`Avaliação necessária: ${v.exam||'documentar exame físico e medidas funcionais antes de selecionar e dosar exercícios.'}`];
 if(v.context==='knee_oa')conduct.push('Osteoartrite de joelho confirmada pelo profissional: considerar fortalecimento local e atividade aeróbia individualizados. Definir exercícios, carga, frequência e progressão após avaliar capacidade, sintomas e restrições.');
 for(const f of factors){conduct.push(`${f.name} — ${f.relevance==='relevant'?'relevância clínica registrada':'hipótese a investigar'}: ${f.rationale}`);if(f.name==='Peso corporal'&&v.context==='knee_oa')conduct.push('Discutir manejo do peso apenas se sobrepeso/obesidade estiver confirmado e em decisão compartilhada, com apoio nutricional quando indicado. O peso isolado não explica a dor individual.');}
 conduct.push(`Restrições e precauções: ${v.restrictions||'confirmar antes da prescrição.'}`,'Definir dose e critérios de progressão/regressão individualmente; revisar resposta durante e após as atividades.');
 return {conduct:conduct.join('\n\n'),patientExplanation:`Vamos trabalhar para ${v.goals||'melhorar a atividade que é mais importante para você'}. Os fatores discutidos são pontos para avaliar e acompanhar; não são uma prova isolada da causa da sua dor. O plano será ajustado à sua capacidade e à sua resposta.`,reassessment:'Definir a data de revisão. Repetir a mesma medida funcional e de sintomas, comparar com o início e registrar tolerância e adesão. Ajustar a conduta conforme os resultados.',sources:v.context==='knee_oa'?[{title:'NICE NG226 — exercício e manejo do peso na osteoartrite (adultos)',url:'https://www.nice.org.uk/guidance/ng226/chapter/Recommendations',reviewed:'2026-10-19'}]:[]};
}
export function createClinicalAssessment({db,clinician,owned,body,reject,json,audit}){
 const data=id=>{const row=db.prepare('SELECT * FROM care_assessments WHERE patient_id=?').get(id);return row?{...JSON.parse(row.content),revision:row.revision,updated_at:row.updated_at,author_name:db.prepare('SELECT name FROM users WHERE id=?').get(row.author_id)?.name}:null;};
 return async(req,path,method)=>{
  const match=path.match(/^\/api\/care\/patients\/([^/]+)\/assessment(?:\/(suggest))?$/);if(!match)return null;
  const user=clinician(req);owned(match[1],user);
  if(method==='GET'&&!match[2])return json({assessment:data(match[1])});
  if((method==='PUT'&&!match[2])||(method==='POST'&&match[2]==='suggest')){
   const input=await body(req),v=assessmentValues(input,reject);
   if(match[2])return json({suggestion:suggestAssessment(v)});
   transaction(db,()=>{const liveUser=clinician(req);owned(match[1],liveUser);const old=db.prepare('SELECT * FROM care_assessments WHERE patient_id=?').get(match[1]);if((old&&input.revision!==old.revision)||(!old&&input.revision!==undefined))reject(409,'A anamnese foi atualizada. Reabra esta aba antes de salvar. Seu texto continua na tela para copiar.');const now=new Date().toISOString();if(old)db.prepare('INSERT INTO care_assessment_history(patient_id,content,revision,author_id,updated_at) VALUES(?,?,?,?,?)').run(old.patient_id,old.content,old.revision,old.author_id,old.updated_at);db.prepare('INSERT INTO care_assessments(patient_id,content,author_id,updated_at) VALUES(?,?,?,?) ON CONFLICT(patient_id) DO UPDATE SET content=excluded.content,author_id=excluded.author_id,updated_at=excluded.updated_at,revision=care_assessments.revision+1').run(match[1],JSON.stringify(v),liveUser.id,now);audit(liveUser.id,'clinical_assessment_saved',match[1]);});
   return json({assessment:data(match[1])});
  }
  reject(405,'Método não permitido.');
 };
}
