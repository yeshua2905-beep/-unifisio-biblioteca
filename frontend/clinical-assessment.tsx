import {useEffect,useState} from 'react';
import {toast} from 'sonner';
import {careRequest} from './care-shared';
import './clinical-assessment.css';

type Assessment={history:string;diagnosis:string;conduct:string;patientExplanation:string;reassessment:string;triage:string;context:string;factors:{name:string;relevance:string;rationale:string}[];revision?:number;updated_at?:string;author_name?:string;[key:string]:unknown};
type Suggestion={conduct:string;patientExplanation:string;reassessment:string;sources:{title:string;url:string}[]};
const empty=():Assessment=>({history:'',diagnosis:'',conduct:'',patientExplanation:'',reassessment:'',triage:'unassessed',context:'general',factors:[]});
export default function ClinicalAssessment({patientId,onPrescription,onDirty}:{patientId:string;onPrescription:(goal:string,text:string)=>void;onDirty:(dirty:boolean)=>void}){
 const [value,setValue]=useState<Assessment>(empty),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[suggestion,setSuggestion]=useState<Suggestion|null>(null);
 const path='/api/care/patients/'+patientId+'/assessment';
 useEffect(()=>{let active=true;setLoading(true);careRequest(path).then(r=>{if(active){setValue({...empty(),...(r.assessment||{})});setError('');setDirty(false);setSuggestion(null)}}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[path]);
 useEffect(()=>{onDirty(dirty);const leave=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',leave);return()=>window.removeEventListener('beforeunload',leave)},[dirty,onDirty]);
 function edit(patch:Partial<Assessment>){setValue(old=>({...old,...patch}));setDirty(true);setSuggestion(null)}
 async function save(){setBusy(true);try{const r=await careRequest(path,'PUT',value);setValue({...empty(),...r.assessment});setDirty(false);toast.success('Anamnese e conduta salvas.')}catch(e){toast.error(e instanceof Error?e.message:'Falha ao salvar.')}finally{setBusy(false)}}
 async function generate(){setBusy(true);try{setSuggestion((await careRequest(path+'/suggest','POST',value)).suggestion)}catch(e){toast.error(e instanceof Error?e.message:'Falha ao gerar.')}finally{setBusy(false)}}
 if(loading)return <p role="status">Carregando anamnese…</p>;
 if(error)return <p role="alert">Não foi possível carregar a anamnese: {error}. Reabra o acompanhamento para tentar novamente.</p>;
 return <div className="clinical-assessment"><div className="section-heading"><div><span className="eyebrow">AVALIAÇÃO E PLANEJAMENTO</span><h2>Anamnese simplificada</h2><p>Informe a história clínica e o diagnóstico. Revise a proposta antes de utilizar.</p></div><span role="status">{dirty?'Alterações não salvas':value.updated_at?'Salvo em '+new Date(value.updated_at).toLocaleString('pt-BR'):'Ainda não preenchida'}</span></div>
 <p className="clinical-note">Área profissional. Informações clínicas permanecem restritas. O gerador atual é baseado em regras e não interpreta o texto como uma IA; dados ausentes exigem avaliação profissional.</p>
 <fieldset disabled={busy} className="clinical-fields"><form className="care-form" onSubmit={e=>{e.preventDefault();void save()}}>
 <div className="clinical-grid"><label>História clínica do paciente<textarea rows={6} maxLength={4000} required value={value.history||''} onChange={e=>edit({history:e.target.value})} placeholder="Relato clínico, sintomas, evolução, limitações e informações relevantes."/></label>
 <label>Diagnóstico<textarea rows={3} maxLength={4000} required value={value.diagnosis||''} onChange={e=>edit({diagnosis:e.target.value})} placeholder="Diagnóstico informado pelo profissional; indique se é hipótese."/></label></div>
 <button className="secondary" type="button" disabled={!value.history?.trim()||!value.diagnosis?.trim()} onClick={()=>void generate()}>Gerar proposta de conduta</button>
 {suggestion&&<article className="clinical-suggestion" aria-label="Sugestão de conduta"><h3>Proposta preliminar para revisão</h3><p className="preserve">{suggestion.conduct}</p><p className="preserve"><strong>Explicação ao paciente:</strong> {suggestion.patientExplanation}</p><p className="preserve"><strong>Reavaliação:</strong> {suggestion.reassessment}</p><button type="button" className="secondary" onClick={()=>edit({conduct:suggestion.conduct.slice(0,4000),patientExplanation:suggestion.patientExplanation.slice(0,4000),reassessment:suggestion.reassessment.slice(0,4000)})}>Usar como rascunho editável</button></article>}
 <details><summary>Revisar e editar a conduta</summary><div className="clinical-grid"><label>Conduta profissional<textarea rows={7} maxLength={4000} value={value.conduct||''} onChange={e=>edit({conduct:e.target.value})}/></label><label>Explicação ao paciente<textarea rows={4} maxLength={4000} value={value.patientExplanation||''} onChange={e=>edit({patientExplanation:e.target.value})}/></label><label>Reavaliação e critérios de evolução<textarea rows={3} maxLength={4000} value={value.reassessment||''} onChange={e=>edit({reassessment:e.target.value})}/></label></div></details>
 <div className="form-actions clinical-save"><span>{dirty?'Salve antes de sair.':value.author_name?'Última edição: '+value.author_name:'Preenchimento pelo profissional'}</span><button className="primary" type="submit" disabled={!value.history?.trim()||!value.diagnosis?.trim()}>{busy?'Salvando…':'Salvar anamnese e conduta'}</button><button className="secondary" type="button" disabled={dirty||!value.patientExplanation?.trim()} onClick={()=>onPrescription('',[value.patientExplanation,value.reassessment].filter(Boolean).join('\n\n'))}>Revisar texto na prescrição</button></div>
 <p className="muted">A prescrição abre como rascunho para revisão profissional antes de publicar.</p>
 </form></fieldset></div>;
}
