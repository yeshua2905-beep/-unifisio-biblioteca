export type Patient={id:string;name:string;email:string;phone?:string;active?:boolean;revision?:number;has_access?:boolean;owner_name?:string;active_plan?:string;last_record?:string};
export type CareTask={id?:string;kind:'exercise'|'conduct';title:string;steps:string;dose:string;days:number[];equipment:string;restriction:string;url:string};
export type CarePlan={id:string;title:string;goal:string;instructions:string;start_date:string;end_date:string;status:'draft'|'active'|'completed'|'archived';revision:number;author_name:string;tasks:CareTask[];published_at?:string};
export type CareLog={id:string;task_id:string;plan_id:string;task_title:string;plan_title:string;performed_date:string;status:'done'|'partial'|'skipped';pain:number|null;difficulty:number|null;comment:string;revision:number;feedback:{id:string;text:string;author_name:string;created_at:string}[]};
export type CareDashboard={patient:Patient;today:string;plans:CarePlan[];logs:CareLog[];measurements:CareMeasurement[]};
export const dayNames=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
export const statusNames={done:'Realizada',partial:'Parcial',skipped:'Não realizada'};
export const planStatus={draft:'Rascunho',active:'Em acompanhamento',completed:'Encerrado',archived:'Arquivado'};
export const dateLabel=(s:string)=>new Date(s+'T12:00:00Z').toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'});
export const moveDate=(s:string,n:number)=>new Date(Date.parse(s)+n*86400000).toISOString().slice(0,10);
export async function careRequest(url:string,method='GET',payload?:unknown){const r=await fetch(url,{method,cache:'no-store',...(payload===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})});const d=await r.json();if(!r.ok){const e=new Error(d.error||'Não foi possível concluir.') as Error&{status:number};e.status=r.status;throw e;}return d;}
export function taskDays(task:CareTask){return task.days.length===7?'Todos os dias':task.days.map(d=>dayNames[d]).join(', ')}

export type CareMeasurement={id:string;plan_id:string;plan_title:string;performed_date:string;eva_before:number;borg_before:number;before_at:string;eva_after:number|null;borg_after:number|null;after_at:string|null;revision:number};
