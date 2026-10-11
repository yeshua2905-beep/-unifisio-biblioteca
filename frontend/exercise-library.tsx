import { useState } from 'react';
import { Dumbbell, Search, ArrowUpRight } from 'lucide-react';
import data from './exercise-data.json';
import profiles from './pathology-data.json';
import { matchesQuery } from './lib/search.mjs';
const exercises = data.exercises;
const mapping: Record<string, string[]> = data.profileExercises;
const sources: Record<string, {title:string;url:string;scope:string}> = data.sources;
type Exercise = typeof exercises[number];
const linkedProfiles = (id:string) => profiles.filter(p => mapping[p.id]?.includes(id));
export function StrengthExercise({exercise,condition}:{exercise:Exercise;condition?:string}) {
  return <details className="strength-exercise">
    <summary><span><span className="exercise-meta">{exercise.region} · {exercise.phase}</span><strong>{exercise.title}</strong><span>{exercise.muscles}</span><span className="exercise-chain">{exercise.chain}</span></span><Dumbbell size={19} aria-hidden="true"/></summary>
    <div className="exercise-body">
      {condition && <p className="exercise-context"><strong>Aplicação em {condition}:</strong> opção para selecionar após avaliação e liberação; não é um circuito obrigatório.</p>}
      <p><strong>Equipamento:</strong> {exercise.equipment}</p>
      <h4>Como executar</h4><ol>{exercise.steps.map(step => <li key={step}>{step}</li>)}</ol>
      <div className="path-dose"><strong>Dose inicial adaptável</strong><p>{exercise.dose}</p></div>
      <p><strong>Quando progredir:</strong> complete a dose com controle e recuperação estável até o dia seguinte. {exercise.progress}</p>
      <p className="exercise-restriction"><strong>Limites desta opção:</strong> {exercise.restriction}</p>
      <p><strong>Reduzir ou interromper:</strong> dor aguda, piora progressiva, aumento relevante de edema/derrame, perda de função ou sintomas neurológicos novos. Reavaliar antes de continuar. Não há um limite de dor único válido para todas as condições.</p>
      <details className="exercise-sources"><summary>Fundamento e fontes</summary><p>Ficha operacional elaborada para o acervo. As fontes sustentam a categoria de intervenção ou oferecem repertório educativo; não validam cada dose, variação ou vínculo com todas as patologias.</p>{exercise.sourceIds.map(id => <div key={id}><a href={sources[id].url} target="_blank" rel="noopener noreferrer">{sources[id].title} <ArrowUpRight size={13}/></a><p>{sources[id].scope}</p></div>)}<p>Revisão bibliográfica desta inclusão: 10/10/2026. Não foram atribuídas classificações próprias de GRADE, RoB 2 ou AMSTAR 2.</p></details>
    </div>
  </details>;
}
export function ProfileStrengthExercises({profileId,title,restriction}:{profileId:string;title:string;restriction:string}) {
  const selected = exercises.filter(exercise => mapping[profileId]?.includes(exercise.id));
  if (!selected.length) return null;
  return <section className="profile-strength"><h4>Mais opções de fortalecimento para esta condição</h4><p>Selecione pela fase e pelo déficit. Os vínculos são uma organização clínica do repertório; não demonstram eficácia de cada exercício isolado em {title.toLowerCase()}.</p><p className="exercise-restriction"><strong>Permissões da condição:</strong> {restriction}</p><p>Em fratura, ruptura ou pós-operatório, as opções abaixo representam tarefas após a respectiva liberação. Não antecipar carga com base apenas na ausência de dor ou no tempo decorrido.</p>{selected.map(exercise => <StrengthExercise key={exercise.id} exercise={exercise} condition={title}/>)}</section>;
}
export default function ExerciseLibrary(){
  const [query,setQuery]=useState(''),[region,setRegion]=useState('Todas as regiões'),[phase,setPhase]=useState('Todas as fases'),[condition,setCondition]=useState('Todas as condições'),[chain,setChain]=useState('Todas as cadeias');
  const conditions=profiles.filter(p => mapping[p.id]);
  const filtered=exercises.filter(exercise => (chain==='Todas as cadeias'||exercise.chain===chain)&&(region==='Todas as regiões'||exercise.region===region)&&(phase==='Todas as fases'||exercise.phase===phase)&&(condition==='Todas as condições'||mapping[condition]?.includes(exercise.id))&&matchesQuery({title:exercise.title,category:exercise.region,reference:'',kind:'Exercício',summary:[exercise.muscles,exercise.equipment,exercise.phase,exercise.chain,exercise.chain==='Cadeia cinética fechada'?'CCF CKC':'',...linkedProfiles(exercise.id).map(p=>p.title)].join(' ')},query));
  const hasFilters=chain!=='Todas as cadeias'||!!query||region!=='Todas as regiões'||phase!=='Todas as fases'||condition!=='Todas as condições';
  const current=profiles.find(p=>p.id===condition);
  return <section className="exercise-library" aria-labelledby="exercise-title"><div className="section-heading"><div><span className="eyebrow">DA ATIVAÇÃO À CARGA PROGRESSIVA</span><h2 id="exercise-title">Exercícios de fortalecimento</h2><p>{exercises.length} opções para consultar por músculo, região e condição clínica.</p></div><Dumbbell size={28} aria-hidden="true"/></div>
    <div className="exercise-intro"><p>Escolha exercícios pela avaliação, objetivo e fase de recuperação. A dose é um ponto de partida, ajustável à capacidade; a lista não é uma prescrição automática nem reúne todos os exercícios existentes.</p><p>Permissões para movimento, apoio e resistência são diferentes. Em reparos, fraturas, instabilidade, lesão nervosa e crianças, consultar o protocolo correspondente antes de aplicar carga. Em cadeia cinética fechada (CCF), mão ou pé permanecem apoiados ou mecanicamente restritos durante a tarefa. Em exercícios mistos, isso muda entre segmentos ou fases. CCF não significa ausência de carga no tecido nem superioridade universal. Controle motor e equilíbrio complementam o trabalho, mas não substituem resistência suficiente para ganhar força.</p></div>
    <label className="exercise-search"><Search size={19}/><span className="sr-only">Buscar exercício, músculo ou patologia</span><input id="exercise-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Busque: quadríceps, fibulares, Aquiles, LCA…"/></label>
    <div className="exercise-filters"><label>Cadeia cinética<select aria-label="Cadeia cinética" value={chain} onChange={e=>setChain(e.target.value)}>{['Todas as cadeias','Cadeia cinética fechada','Cadeia cinética aberta','Mista ou conforme execução'].map(value=><option key={value}>{value}</option>)}</select></label><label>Região<select aria-label="Região" value={region} onChange={e=>setRegion(e.target.value)}>{['Todas as regiões',...new Set(exercises.map(e=>e.region))].map(value=><option key={value}>{value}</option>)}</select></label><label>Objetivo de carga<select aria-label="Objetivo de carga" value={phase} onChange={e=>setPhase(e.target.value)}>{['Todas as fases',...new Set(exercises.map(e=>e.phase))].map(value=><option key={value}>{value}</option>)}</select></label><label>Condição<select aria-label="Condição" value={condition} onChange={e=>setCondition(e.target.value)}><option>Todas as condições</option>{conditions.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label></div>
    {current&&<div className="exercise-restriction"><strong>{current.title} — antes de aplicar</strong><p>{current.restriction}</p><p>{current.progress}</p></div>}
    <div className="exercise-results"><p role="status">{filtered.length} {filtered.length===1?'exercício encontrado':'exercícios encontrados'} · {conditions.length} condições relacionadas</p>{hasFilters&&<button className="text-action" onClick={()=>{setQuery('');setRegion('Todas as regiões');setPhase('Todas as fases');setCondition('Todas as condições');setChain('Todas as cadeias')}}>Limpar seleção</button>}</div>
    <div className="strength-grid">{filtered.map(exercise=><StrengthExercise key={exercise.id} exercise={exercise} condition={current?.title}/>)}</div>{!filtered.length&&<p className="home-empty">Nenhuma opção nesta combinação. Limpe um filtro ou procure pelo músculo.</p>}
    <details className="exercise-method"><summary>Como o repertório foi organizado</summary><p>Pesquisa direcionada em diretrizes clínicas, ensaios e materiais educativos de instituições. Inclusão organizada para uso profissional; não é revisão sistemática nem inventário exaustivo. Exercícios e doses foram redigidos como exemplos de aplicação. Referências antigas foram mantidas quando relevantes e identificadas pelo ano.</p><p>Para cápsula, instabilidade, artroplastias e fraturas, a ligação com o repertório é uma adaptação após liberação, e não prova direta de eficácia específica. Lesão de plexo, DTM, rótulo inespecífico 3B e fratura por estresse do colo não recebem associação automática de carga; seus guias mantêm a triagem e os limites próprios.</p><p>Registre exercício, lado, carga, séries, repetições, esforço, sintomas e recuperação. Escolha poucos movimentos relevantes; aumentar uma variável por vez. Saltos, corrida e retorno ao esporte exigem critérios próprios além deste repertório.</p></details>
  </section>;
}
