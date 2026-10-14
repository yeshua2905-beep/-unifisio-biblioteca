export type Patient={id:string;name:string;email:string;phone?:string;active?:boolean;revision?:number;has_access?:boolean;owner_name?:string;active_plan?:string;last_record?:string};
export type CareTask={id?:string;kind:'exercise'|'conduct';title:string;steps:string;dose:string;days:number[];equipment:string;restriction:string;url:string;coach?:CoachConfig};
export type CarePlan={id:string;title:string;goal:string;instructions:string;start_date:string;end_date:string;status:'draft'|'active'|'completed'|'archived';revision:number;author_name:string;tasks:CareTask[];published_at?:string};
export type CareLog={id:string;task_id:string;plan_id:string;task_title:string;plan_title:string;performed_date:string;status:'done'|'partial'|'skipped';pain:number|null;difficulty:number|null;comment:string;revision:number;feedback:{id:string;text:string;author_name:string;created_at:string}[]};
export type CareDashboard={patient:Patient;today:string;plans:CarePlan[];logs:CareLog[];measurements:CareMeasurement[];dailyScales:DailyScale[];functionalGoals:FunctionalGoal[];functionalLogs:FunctionalLog[];progressNotes:ProgressNote[];diaryEntries:DiaryEntry[]};
export type DiaryEntry={id:string;performed_date:string;perception:string;complaints:string;feedback:string;revision:number;created_at:string;updated_at:string};
export const dayNames=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
export const statusNames={done:'Realizada',partial:'Parcial',skipped:'Não realizada'};
export const planStatus={draft:'Rascunho',active:'Em acompanhamento',completed:'Encerrado',archived:'Arquivado'};
export const dateLabel=(s:string)=>new Date(s+'T12:00:00Z').toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'});
export const moveDate=(s:string,n:number)=>new Date(Date.parse(s)+n*86400000).toISOString().slice(0,10);
export async function careRequest(url:string,method='GET',payload?:unknown){
 let r:Response;
 try{r=await fetch(url,{method,cache:'no-store',...(payload===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})})}
 catch{throw new Error(method==='GET'?'Não foi possível conectar. Verifique sua conexão e tente novamente.':'A conexão foi interrompida. Atualize o acompanhamento para conferir se o registro foi salvo antes de tentar novamente.')}
 let d:any;
 try{d=await r.json()}catch{const e=new Error('Não foi possível confirmar a resposta do sistema. Atualize o acompanhamento e confira seus registros.') as Error&{status:number};e.status=r.status;throw e}
 if(!r.ok){const e=new Error(d.error||'Não foi possível concluir. Tente novamente.') as Error&{status:number};e.status=r.status;throw e;}return d;
}
export function taskDays(task:CareTask){return task.days.length===7?'Todos os dias':task.days.map(d=>dayNames[d]).join(', ')}

export type CareMeasurement={id:string;plan_id:string;plan_title:string;performed_date:string;eva_before:number;borg_before:number;borg_scale?:'rpe6_20'|'modified0_10';before_at:string;corrections?:{phase:'before'|'after';previous_eva:number;previous_borg:number;new_eva:number;new_borg:number;reason:string;created_at:string}[];eva_after:number|null;borg_after:number|null;after_at:string|null;revision:number};
export type FunctionalGoal={id:string;title:string;active:boolean;revision:number;created_at:string;author_name:string};
export type FunctionalLog={id:string;goal_id:string;goal_title:string;performed_date:string;score:number;comment:string;revision:number;created_at:string;updated_at:string};
export type ProgressNote={id:string;text:string;author_name:string;created_at:string};
export type CoachConfig={mode:'reps'|'time';sets:number;reps?:number;seconds?:number;repSeconds?:number;restSeconds:number;command?:string;releaseSeconds?:number;illustration?:string;illustrationImage?:string};

export type DailyScale={id:string;performed_date:string;moment:'now'|'before'|'after';eva:number;borg:number;author_id:string|null;author_name:string|null;revision:number;updated_at:string;history:{id:string;eva:number;borg:number;author_name:string|null;revision:number;created_at:string}[]};
