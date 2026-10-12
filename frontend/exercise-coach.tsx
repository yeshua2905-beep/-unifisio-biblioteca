import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,Check,Pause,Play,RotateCcw,Volume2,VolumeX} from 'lucide-react';
import type {CareTask,CoachConfig} from './care-shared';
import './exercise-coach.css';
import {coachBeepSource} from './coach-audio';

type Sound='voice'|'beep'|'off';
type Stage='ready'|'prepare'|'exercise'|'rest'|'next'|'finished';
type Run={stage:Stage;set:number;count:number;paused:boolean};
const initial:Run={stage:'ready',set:1,count:0,paused:false};
const bounded=(value:string,min:number,max:number)=>value!==''&&Number.isInteger(Number(value))&&Number(value)>=min&&Number(value)<=max;
export default function ExerciseCoach({task,onReview,onClose}:{task:CareTask;onReview:()=>void;onClose:()=>void}){
 const [sound,setSound]=useState<Sound>('beep'),[voices,setVoices]=useState<SpeechSynthesisVoice[]>([]),[message,setMessage]=useState('');
 const [mode,setMode]=useState<'reps'|'time'>(task.coach?.mode||'reps'),[sets,setSets]=useState(task.coach?.sets.toString()||''),[reps,setReps]=useState(task.coach?.reps?.toString()||''),[seconds,setSeconds]=useState(task.coach?.seconds?.toString()||''),[repSeconds,setRepSeconds]=useState(task.coach?.repSeconds?.toString()||''),[restSeconds,setRestSeconds]=useState(task.coach?.restSeconds.toString()||'');
 const [run,setRun]=useState<Run>(initial);
 const root=useRef<HTMLElement|null>(null);
 const runRef=useRef(run),config=useRef<CoachConfig|null>(null),deadline=useRef(0),remaining=useRef(0),audio=useRef<HTMLAudioElement|null>(null),soundRef=useRef(sound),voiceRef=useRef<SpeechSynthesisVoice|null>(null),active=useRef(true),operation=useRef(0),inFlight=useRef(false),cueVersion=useRef(0);
 const sync=(next:Run)=>{runRef.current=next;setRun(next)};
 const voiceAvailable=typeof window!=='undefined'&&'speechSynthesis' in window&&'SpeechSynthesisUtterance' in window;
 const supportedVoice=voices.find(v=>/^pt[-_]BR$/i.test(v.lang))||voices.find(v=>/^pt/i.test(v.lang));
 soundRef.current=sound;voiceRef.current=supportedVoice||null;
 const stopSound=()=>{cueVersion.current++;if('speechSynthesis' in window&&(window.speechSynthesis.speaking||window.speechSynthesis.pending))window.speechSynthesis.cancel();if(audio.current){audio.current.pause();try{audio.current.currentTime=0}catch{}}};
 function audioFailed(cueId:number,kind:Sound,timedOut=false){if(!active.current||cueId!==cueVersion.current||soundRef.current!==kind)return;setMessage(timedOut?'O aparelho não confirmou o áudio. Toque em Ativar e testar áudio e confira o volume de mídia. A contagem visual continua.':kind==='voice'?'A voz não iniciou neste aparelho. Toque em Ativar e testar áudio ou escolha Sinal sonoro. A contagem visual continua.':'O sinal sonoro não iniciou. Toque em Ativar e testar áudio e confira o volume de mídia do aparelho. A contagem visual continua.')}
 function beep(cueId:number):Promise<boolean>{
  try{
   if(!audio.current){const element=new Audio(coachBeepSource);element.preload='auto';element.volume=1;element.setAttribute('playsinline','');audio.current=element}
   const element=audio.current;try{element.currentTime=0}catch{}
   // play() ocorre diretamente no toque inicial, sem aguardar carregamento ou outras APIs.
   const playback=element.play();
   return new Promise(resolve=>{let settled=false;const finish=(ok:boolean,timedOut=false)=>{if(settled)return;settled=true;clearTimeout(timeout);if(!ok)audioFailed(cueId,'beep',timedOut);resolve(ok)};const timeout=window.setTimeout(()=>{if(cueId===cueVersion.current)element.pause();finish(false,true)},1500);Promise.resolve(playback).then(()=>finish(true),()=>finish(false))});
  }catch{audioFailed(cueId,'beep');return Promise.resolve(false)}
 }
 function cue(text:string,_end=false):Promise<boolean>{
  if(soundRef.current==='off')return Promise.resolve(true);const cueId=++cueVersion.current;
  if(soundRef.current==='voice'){
   if(!voiceAvailable){audioFailed(cueId,'voice');return Promise.resolve(false)}
   try{
    const synthesis=window.speechSynthesis;
    if(synthesis.speaking||synthesis.pending)synthesis.cancel();
    const utterance=new SpeechSynthesisUtterance(text);if(voiceRef.current)utterance.voice=voiceRef.current;utterance.lang=voiceRef.current?.lang||'pt-BR';utterance.rate=1.15;
    utterance.onerror=e=>{if(e.error==='interrupted'||e.error==='canceled')return;audioFailed(cueId,'voice')};
    // iOS pode não listar vozes. A voz padrão em pt-BR também é tentada, no próprio gesto.
    synthesis.speak(utterance);return Promise.resolve(true);
   }catch{audioFailed(cueId,'voice');return Promise.resolve(false)}
  }
  return beep(cueId);
 }
 function chooseSound(value:Sound){stopSound();soundRef.current=value;setSound(value);setMessage('');if(value!=='off')void cue('Um. Dois. Três.')}
 function testAudio(){setMessage('');void cue('Um. Dois. Três.')}
 useEffect(()=>{
  root.current?.focus({preventScroll:true});root.current?.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  active.current=true;
  if('speechSynthesis' in window){const refresh=()=>setVoices(window.speechSynthesis.getVoices());refresh();window.speechSynthesis.addEventListener('voiceschanged',refresh);return()=>{active.current=false;operation.current++;inFlight.current=false;window.speechSynthesis.removeEventListener('voiceschanged',refresh);stopSound();if(audio.current){audio.current.removeAttribute('src');audio.current.load();audio.current=null}}}
  return()=>{active.current=false;operation.current++;inFlight.current=false;stopSound();if(audio.current){audio.current.removeAttribute('src');audio.current.load();audio.current=null}};
 },[]);
 useEffect(()=>{
  function pauseHidden(force=false){const current=runRef.current;const hidden=force||document.hidden;if(hidden){operation.current++;inFlight.current=false;stopSound()}if(hidden&&['prepare','exercise','rest'].includes(current.stage)&&!current.paused){remaining.current=Math.max(0,deadline.current-performance.now());sync({...current,paused:true});stopSound();setMessage('Guia pausado porque a tela saiu de foco. Toque em Continuar quando estiver pronto.')}}
  const visibilityChanged=()=>pauseHidden();const pageHidden=()=>pauseHidden(true);document.addEventListener('visibilitychange',visibilityChanged);window.addEventListener('pagehide',pageHidden);
  const timer=window.setInterval(()=>{
   const current=runRef.current,c=config.current;if(!c||current.paused||!['prepare','exercise','rest'].includes(current.stage))return;
   const now=performance.now();if(now<deadline.current)return;
   // Atrasos longos pausam o guia; nunca acumulamos contagens para recuperar tempo.
   if(now-deadline.current>1500){remaining.current=current.stage==='exercise'&&c.mode==='reps'?(c.repSeconds||1)*1000:1000;sync({...current,paused:true});stopSound();setMessage('A contagem foi pausada após uma interrupção. Continue quando estiver pronto.');return}
   if(current.stage==='prepare'){
    if(current.count>1){sync({...current,count:current.count-1});cue(String(current.count-1));deadline.current=now+1000}
    else{sync({...current,stage:'exercise',count:c.mode==='reps'?1:0});cue(c.mode==='reps'?'Um.':'Comece.');deadline.current=now+(c.mode==='reps'?(c.repSeconds||1)*1000:1000)}
   }else if(current.stage==='exercise'){
    const limit=c.mode==='reps'?c.reps!:c.seconds!;
    if(current.count<limit){const count=current.count+1;sync({...current,count});if(c.mode==='reps')cue(String(count));else if(limit-count<=3&&limit-count>0)cue(String(limit-count));deadline.current=c.mode==='reps'?now+(c.repSeconds||1)*1000:deadline.current+1000;if(c.mode==='time'&&count===limit)completeSet({...current,count},c,now)}
    else completeSet(current,c,now);
   }else if(current.stage==='rest'){
    const count=current.count-1;if(count<=0){sync({...current,stage:'next',count:0});cue('Descanso concluído. Inicie a próxima série quando estiver pronto.',true)}else{sync({...current,count});if(count<=3)cue(String(count));deadline.current+=1000}
   }
  },100);
  function completeSet(current:Run,c:CoachConfig,now:number){
   if(current.set>=c.sets){sync({...current,stage:'finished',paused:false});cue('Contagem concluída. Registre como foi a atividade.',true)}
   else if(c.restSeconds>0){sync({...current,stage:'rest',count:c.restSeconds});deadline.current=now+1000;cue('Série '+current.set+' concluída. Descanse.',true)}
   else{sync({...current,stage:'next',count:0});cue('Série concluída. Inicie a próxima quando estiver pronto.',true)}
  }
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visibilityChanged);window.removeEventListener('pagehide',pageHidden)};
 },[]);
 const valid=bounded(sets,1,20)&&bounded(restSeconds,0,300)&&(mode==='reps'?bounded(reps,1,100)&&bounded(repSeconds,1,30):bounded(seconds,1,600));
 async function prepareOperation(expected:Run,text:string){
  if(inFlight.current)return false;
  const ticket=++operation.current;inFlight.current=true;
  await cue(text);
  if(ticket!==operation.current)return false;
  inFlight.current=false;
  return active.current&&!document.hidden&&runRef.current===expected;
 }
 async function start(){const current=runRef.current;if(!valid||current.stage!=='ready')return;setMessage('');if(!await prepareOperation(current,'Três.'))return;config.current={mode,sets:Number(sets),restSeconds:Number(restSeconds),...(mode==='reps'?{reps:Number(reps),repSeconds:Number(repSeconds)}:{seconds:Number(seconds)})};deadline.current=performance.now()+1000;sync({stage:'prepare',set:1,count:3,paused:false})}
 async function pause(){const current=runRef.current;if(current.paused){setMessage('');if(!await prepareOperation(current,'Continue.'))return;deadline.current=performance.now()+Math.max(100,remaining.current);sync({...current,paused:false})}else{operation.current++;inFlight.current=false;remaining.current=Math.max(0,deadline.current-performance.now());sync({...current,paused:true});stopSound()}}
 async function nextSet(){const current=runRef.current;if(current.stage!=='next')return;setMessage('');if(!await prepareOperation(current,'Três.'))return;deadline.current=performance.now()+1000;sync({stage:'prepare',set:current.set+1,count:3,paused:false})}
 function reset(){operation.current++;inFlight.current=false;stopSound();config.current=null;sync(initial);setMessage('')}
 const running=['prepare','exercise','rest'].includes(run.stage),c=config.current;
 return <section ref={root} tabIndex={-1} className="exercise-coach" aria-label={'Guia de treino: '+task.title}>
  <header className="coach-header"><div><span className="eyebrow">NO SEU RITMO</span><h3>Treinar com guia</h3><p>{task.title}</p></div><button type="button" className="secondary" onClick={onClose} aria-label="Fechar guia de treino"><ArrowLeft size={18}/> Voltar</button></header>
  <fieldset className="coach-audio"><legend>Como prefere acompanhar?</legend>{([{value:'voice',label:'Voz',icon:Volume2},{value:'beep',label:'Sinal sonoro',icon:Volume2},{value:'off',label:'Silencioso',icon:VolumeX}] as const).map(option=><label key={option.value} className={sound===option.value?'selected':''}><input type="radio" name="coach-sound" value={option.value} checked={sound===option.value} disabled={option.value==='voice'&&!voiceAvailable} onChange={()=>chooseSound(option.value)}/><option.icon size={18}/>{option.label}</label>)}{sound!=='off'&&<button type="button" className="secondary coach-test" onClick={testAudio}><Volume2 size={18}/> Ativar e testar áudio</button>}</fieldset>
  {!voiceAvailable&&<small className="muted">A voz não é oferecida neste navegador. Escolha Sinal sonoro ou Silencioso.</small>}
  {sound!=='off'&&<p className="coach-audio-help">Toque para testar antes de começar. No iPhone ou iPad, confira o volume de mídia e a saída de som (alto-falante ou fones).</p>}
  {message&&<p className="coach-message" role="status">{message}</p>}
  {run.stage==='ready'?<><div className="coach-dose"><strong>Prescrição do seu profissional</strong><p className="preserve">{task.dose}</p></div>{task.coach?<p className="coach-note">Contagem configurada pelo seu profissional. Escolha o áudio e toque em Iniciar.</p>:<p className="coach-note">Copie a quantidade da prescrição para o guia. Ajuste o ritmo e o descanso conforme a orientação recebida.</p>}
   <fieldset className="coach-setup" disabled={!!task.coach}><legend className="sr-only">Configuração da contagem</legend><label>Contar por<select value={mode} onChange={e=>setMode(e.target.value as 'reps'|'time')}><option value="reps">Repetições</option><option value="time">Tempo de exercício</option></select></label><label>Séries<input type="number" min={1} max={20} step={1} inputMode="numeric" value={sets} onChange={e=>setSets(e.target.value)} placeholder="Conforme a prescrição"/></label>{mode==='reps'?<><label>Repetições por série<input type="number" min={1} max={100} step={1} inputMode="numeric" value={reps} onChange={e=>setReps(e.target.value)} placeholder="Conforme a prescrição"/></label><label>Segundos entre contagens<input type="number" min={1} max={30} step={1} inputMode="numeric" value={repSeconds} onChange={e=>setRepSeconds(e.target.value)} placeholder="Ritmo orientado"/></label></>:<label>Segundos por série<input type="number" min={1} max={600} step={1} inputMode="numeric" value={seconds} onChange={e=>setSeconds(e.target.value)} placeholder="Conforme a prescrição"/></label>}<label>Descanso entre séries (segundos)<input type="number" min={0} max={300} step={1} inputMode="numeric" value={restSeconds} onChange={e=>setRestSeconds(e.target.value)} placeholder="0 para não cronometrar"/></label></fieldset>
   <button type="button" className="primary coach-main" onClick={()=>void start()} disabled={!valid}><Play size={22}/> Iniciar contagem</button>{!valid&&<small className="muted">Preencha os campos para liberar a contagem. Use números inteiros dentro dos limites indicados.</small>}
  </>:<><div className={'coach-stage '+run.stage}>
   <p className="coach-series">Série {run.set} de {c?.sets}</p>
   <h4>{run.paused?'Contagem pausada':run.stage==='prepare'?'Prepare-se':run.stage==='rest'?'Hora de descansar':run.stage==='next'?'Pronto para a próxima?':run.stage==='finished'?'Contagem concluída':c?.mode==='time'?'Mantenha o exercício':'Acompanhe seu movimento'}</h4>
   {['prepare','exercise','rest'].includes(run.stage)&&<><div className="coach-count" aria-hidden="true">{run.stage==='exercise'&&c?.mode==='time'?Math.max(0,c.seconds!-run.count):run.count}</div><p className="coach-unit">{run.stage==='exercise'&&c?.mode==='reps'?'de '+c.reps+' repetições':'segundos'}</p><progress aria-label={run.stage==='exercise'?'Progresso da série':'Progresso da preparação ou descanso'} max={run.stage==='exercise'?(c?.mode==='reps'?c.reps:c?.seconds):run.stage==='prepare'?3:c?.restSeconds} value={run.stage==='exercise'?run.count:run.stage==='prepare'?3-run.count:(c?.restSeconds||0)-run.count}/></>}
   {run.stage==='finished'&&<Check size={58} aria-hidden="true"/>}<span className="sr-only" role="status">{run.paused?'Guia pausado.':run.stage==='next'?'Descanso concluído. Você pode iniciar a próxima série.':run.stage==='finished'?'Contagem concluída. Registre como foi a atividade.':'Série '+run.set+(run.stage==='rest'?', descanso.':run.stage==='prepare'?', preparação.':', em execução.')}</span>
  </div><div className="coach-controls">{running&&<button type="button" className="primary coach-main" onClick={()=>void pause()}>{run.paused?<Play size={22}/>:<Pause size={22}/>} {run.paused?'Continuar':'Pausar'}</button>}{run.stage==='next'&&<button type="button" className="primary coach-main" onClick={()=>void nextSet()}><Play size={22}/> Começar próxima série</button>}{run.stage==='finished'&&<><p>Você terminou a contagem. Conte ao profissional como foi e preencha dor e esforço depois do treino.</p><button type="button" className="primary coach-main" onClick={onReview}><Check size={20}/> Registrar como foi</button></>}<button type="button" className="secondary" onClick={reset}><RotateCcw size={18}/>{run.stage==='finished'?'Configurar novamente':'Encerrar contagem'}</button></div></>}
  <p className="coach-footer">O guia acompanha o tempo e a contagem. Siga a execução e os cuidados indicados na prescrição. Mantenha esta tela aberta; sair dela pausa o guia.</p>
 </section>;
}
