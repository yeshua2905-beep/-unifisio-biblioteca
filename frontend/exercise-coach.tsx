import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,Check,Pause,Play,RotateCcw,Volume2,VolumeX} from 'lucide-react';
import type {CareTask,CoachConfig} from './care-shared';
import './exercise-coach.css';
import {coachBeepSource} from './coach-audio';
import {nextCoachTick} from './coach-timing.mjs';

type Sound='voice'|'beep'|'off';
type Stage='ready'|'prepare'|'exercise'|'release'|'rest'|'next'|'finished';
type Run={stage:Stage;set:number;rep:number;count:number;paused:boolean};
function initialSound():Sound{try{const saved=window.localStorage.getItem('unifisio-coach-sound');if(saved==='off'||saved==='beep'||saved==='voice'&&'speechSynthesis' in window&&'SpeechSynthesisUtterance' in window)return saved}catch{}return typeof window!=='undefined'&&'speechSynthesis' in window&&'SpeechSynthesisUtterance' in window?'voice':'beep'}
const initial:Run={stage:'ready',set:1,rep:1,count:0,paused:false};
const bounded=(value:string,min:number,max:number)=>value!==''&&Number.isInteger(Number(value))&&Number(value)>=min&&Number(value)<=max;
export default function ExerciseCoach({task,onReview,onClose}:{task:CareTask;onReview:()=>void;onClose:()=>void}){
 const [sound,setSound]=useState<Sound>(initialSound),[voices,setVoices]=useState<SpeechSynthesisVoice[]>([]),[message,setMessage]=useState('');
 const [mode,setMode]=useState<'reps'|'time'>(task.coach?.mode||'reps'),[sets,setSets]=useState(task.coach?.sets.toString()||''),[reps,setReps]=useState(task.coach?.reps?.toString()||''),[seconds,setSeconds]=useState(task.coach?.seconds?.toString()||''),[repSeconds,setRepSeconds]=useState(task.coach?.repSeconds?.toString()||''),[restSeconds,setRestSeconds]=useState(task.coach?.restSeconds.toString()||'');
 const [command,setCommand]=useState(task.coach?.command||'Execute'),[releaseSeconds,setReleaseSeconds]=useState(task.coach?.releaseSeconds?.toString()||'0');
 const [run,setRun]=useState<Run>(initial);
 const root=useRef<HTMLElement|null>(null);
 const runRef=useRef(run),config=useRef<CoachConfig|null>(null),deadline=useRef(0),remaining=useRef(0),audio=useRef<HTMLAudioElement|null>(null),soundRef=useRef(sound),voiceRef=useRef<SpeechSynthesisVoice|null>(null),active=useRef(true),operation=useRef(0),inFlight=useRef(false),cueVersion=useRef(0);
 const sync=(next:Run)=>{runRef.current=next;setRun(next)};
 const voiceAvailable=typeof window!=='undefined'&&'speechSynthesis' in window&&'SpeechSynthesisUtterance' in window;
 const supportedVoice=voices.find(v=>/^pt[-_]BR$/i.test(v.lang))||voices.find(v=>/^pt/i.test(v.lang));
 soundRef.current=sound;voiceRef.current=supportedVoice||null;
 const stopSound=()=>{cueVersion.current++;if('speechSynthesis' in window&&(window.speechSynthesis.speaking||window.speechSynthesis.pending))window.speechSynthesis.cancel();if(audio.current){audio.current.pause();try{audio.current.currentTime=0}catch{}}};
 function audioFailed(cueId:number,kind:Sound,timedOut=false){if(!active.current||cueId!==cueVersion.current||soundRef.current!==kind)return;setMessage(timedOut?'O aparelho não confirmou o áudio. Toque em Testar áudio e confira o volume de mídia. A contagem visual continua.':kind==='voice'?'A voz não iniciou neste aparelho. Toque em Testar áudio ou escolha Som. A contagem visual continua.':'O sinal sonoro não iniciou. Toque em Testar áudio e confira o volume de mídia do aparelho. A contagem visual continua.')}
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
    let started=false;const watchdog=window.setTimeout(()=>{if(!started)audioFailed(cueId,'voice',true)},800);
    utterance.onstart=()=>{started=true;clearTimeout(watchdog)};utterance.onend=()=>clearTimeout(watchdog);
    utterance.onerror=e=>{clearTimeout(watchdog);if(e.error==='interrupted'||e.error==='canceled')return;audioFailed(cueId,'voice')};
    // iOS pode não listar vozes. A voz padrão em pt-BR também é tentada, no próprio gesto.
    synthesis.speak(utterance);return Promise.resolve(true);
   }catch{audioFailed(cueId,'voice');return Promise.resolve(false)}
  }
  return beep(cueId);
 }
 function chooseSound(value:Sound){stopSound();soundRef.current=value;setSound(value);try{window.localStorage.setItem('unifisio-coach-sound',value)}catch{}setMessage('');if(value!=='off')void cue('Um. Dois. Três.')}
 function testAudio(){setMessage('');void cue('Um. Dois. Três.')}
 useEffect(()=>{
  root.current?.focus({preventScroll:true});root.current?.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  active.current=true;
  if('speechSynthesis' in window){const refresh=()=>setVoices(window.speechSynthesis.getVoices());refresh();window.speechSynthesis.addEventListener('voiceschanged',refresh);return()=>{active.current=false;operation.current++;inFlight.current=false;window.speechSynthesis.removeEventListener('voiceschanged',refresh);stopSound();if(audio.current){audio.current.removeAttribute('src');audio.current.load();audio.current=null}}}
  return()=>{active.current=false;operation.current++;inFlight.current=false;stopSound();if(audio.current){audio.current.removeAttribute('src');audio.current.load();audio.current=null}};
 },[]);
 useEffect(()=>{
  function pauseHidden(force=false){const current=runRef.current;const hidden=force||document.hidden;if(hidden){operation.current++;inFlight.current=false;stopSound()}if(hidden&&['prepare','exercise','release','rest'].includes(current.stage)&&!current.paused){remaining.current=Math.max(0,deadline.current-performance.now());sync({...current,paused:true});stopSound();setMessage('Guia pausado porque a tela saiu de foco. Toque em Continuar quando estiver pronto.')}}
  const visibilityChanged=()=>pauseHidden();const pageHidden=()=>pauseHidden(true);document.addEventListener('visibilitychange',visibilityChanged);window.addEventListener('pagehide',pageHidden);
  const timer=window.setInterval(()=>{
   const current=runRef.current,c=config.current;if(!c||current.paused||!['prepare','exercise','release','rest'].includes(current.stage))return;
   const now=performance.now();if(now<deadline.current)return;
   // Atrasos longos pausam o guia; nunca acumulamos contagens para recuperar tempo.
   if(now-deadline.current>1500){operation.current++;inFlight.current=false;remaining.current=1000;sync({...current,paused:true});stopSound();setMessage('A contagem foi pausada após uma interrupção. Continue quando estiver pronto.');return}
   const tick=nextCoachTick(current,c);sync(tick.run);
   if(tick.cue&&(tick.phaseStart||current.stage==='prepare'||(c.mode==='reps'&&['exercise','release'].includes(current.stage))||soundRef.current==='beep'||tick.run.count<=3)){
    // Short countdown cues never interrupt a longer movement command.
    const voiceBusy=soundRef.current==='voice'&&'speechSynthesis' in window&&(window.speechSynthesis.speaking||window.speechSynthesis.pending);
    if(tick.phaseStart||!voiceBusy)void cue(tick.cue,tick.phaseStart);
   }
   deadline.current=tick.phaseStart?now+1000:deadline.current+1000;
  },100);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visibilityChanged);window.removeEventListener('pagehide',pageHidden)};
 },[]);
 const valid=command.trim().length>0&&command.trim().length<=80&&bounded(releaseSeconds,0,60)&&bounded(sets,1,20)&&bounded(restSeconds,0,300)&&(mode==='reps'?bounded(reps,1,100)&&bounded(repSeconds,1,30):bounded(seconds,1,600));
 async function prepareOperation(expected:Run,text:string){
  if(inFlight.current)return false;
  const ticket=++operation.current;inFlight.current=true;
  await cue(text);
  if(ticket!==operation.current)return false;
  inFlight.current=false;
  return active.current&&!document.hidden&&runRef.current===expected;
 }
 async function start(){const current=runRef.current;if(!valid||current.stage!=='ready')return;setMessage('');if(!await prepareOperation(current,'Três.'))return;config.current={mode,command:command.trim(),releaseSeconds:Number(releaseSeconds),sets:Number(sets),restSeconds:Number(restSeconds),...(mode==='reps'?{reps:Number(reps),repSeconds:Number(repSeconds)}:{seconds:Number(seconds)})};deadline.current=performance.now()+1000;sync({stage:'prepare',set:1,rep:1,count:3,paused:false})}
 async function pause(){const current=runRef.current;if(current.paused){setMessage('');if(!await prepareOperation(current,'Continue.'))return;deadline.current=performance.now()+Math.max(100,remaining.current);sync({...current,paused:false})}else{operation.current++;inFlight.current=false;remaining.current=Math.max(0,deadline.current-performance.now());sync({...current,paused:true});stopSound()}}
 async function nextSet(){const current=runRef.current;if(current.stage!=='next')return;setMessage('');if(!await prepareOperation(current,'Três.'))return;deadline.current=performance.now()+1000;sync({stage:'prepare',set:current.set+1,rep:1,count:3,paused:false})}
 function reset(){operation.current++;inFlight.current=false;stopSound();config.current=null;sync(initial);setMessage('')}
 const running=['prepare','exercise','release','rest'].includes(run.stage),c=config.current;
 const duration=run.stage==='exercise'?(c?.mode==='reps'?c.repSeconds:c?.seconds):run.stage==='release'?c?.releaseSeconds:run.stage==='prepare'?3:c?.restSeconds;
 const fill=duration?Math.min(100,Math.max(0,(duration-run.count)/duration*100)):0;
 const label=run.paused?'Pausado':run.stage==='prepare'?'Prepare-se':run.stage==='release'?'Relaxe':run.stage==='rest'?'Descanse':run.stage==='next'?'Próxima série':run.stage==='finished'?'Concluído':c?.command||'Execute';
 const audioControls=<fieldset className="coach-audio"><legend>Como você quer acompanhar?</legend>{([{value:'voice',label:'Voz',icon:Volume2},{value:'beep',label:'Som',icon:Volume2},{value:'off',label:'Silencioso',icon:VolumeX}] as const).map(option=><label key={option.value} className={sound===option.value?'selected':''}><input type="radio" name="coach-sound" value={option.value} checked={sound===option.value} disabled={option.value==='voice'&&!voiceAvailable} onChange={()=>chooseSound(option.value)}/><option.icon size={18}/>{option.label}</label>)}{sound!=='off'&&<button type="button" className="coach-test" onClick={testAudio}><Volume2 size={18}/> Testar áudio</button>}</fieldset>;
 return <section ref={root} tabIndex={-1} className="exercise-coach" aria-label={'Guia de treino: '+task.title}>
  <header className="coach-header"><button type="button" className="coach-back" onClick={()=>{reset();onClose()}} aria-label="Voltar aos exercícios"><ArrowLeft size={22}/></button><div><span className="eyebrow">GUIA DE EXERCÍCIOS</span><h3>{task.title}</h3></div><span className="coach-timer-label">Passo a passo</span></header>
  {run.stage==='ready'?<div className="coach-ready">
   <div className="coach-prescription"><div className="coach-dose"><strong>Seu exercício de hoje</strong><p className="preserve">{task.dose}</p><span className="coach-note">Siga as instruções do seu fisioterapeuta. A contagem acompanha o tempo, não avalia o movimento.</span></div></div>
   {task.coach&&<div className="coach-dose-chips"><span>{sets} séries</span><span>{mode==='reps'?reps+' repetições':seconds+' s por série'}</span>{mode==='reps'&&<span>{repSeconds} s por repetição</span>}<span>{restSeconds} s de descanso</span></div>}
   {audioControls}
   {message&&<p className="coach-message" role="status">{message}</p>}
   {task.coach&&<button type="button" className="primary coach-main" onClick={()=>void start()} disabled={!valid}><Play size={22}/> Iniciar exercício</button>}
   <details className="coach-settings" open={task.coach?undefined:true}><summary>{task.coach?'Ver configuração da contagem':'Configurar conforme a prescrição'}</summary>
    {!task.coach&&<p className="coach-note">Informe a quantidade e o tempo orientados pelo seu profissional.</p>}
    <fieldset className="coach-setup" disabled={!!task.coach}><legend className="sr-only">Configuração da contagem</legend><label className="coach-wide">Comando do movimento<input maxLength={80} value={command} onChange={e=>setCommand(e.target.value)} placeholder="Ex.: Contraia, Eleve, Aperte"/></label><label>Contagem<select value={mode} onChange={e=>setMode(e.target.value as 'reps'|'time')}><option value="reps">Repetições</option><option value="time">Tempo de exercício</option></select></label><label>Séries<input type="number" min={1} max={20} step={1} inputMode="numeric" value={sets} onChange={e=>setSets(e.target.value)} placeholder="Nº de séries"/></label>{mode==='reps'?<><label>Repetições por série<input type="number" min={1} max={100} step={1} inputMode="numeric" value={reps} onChange={e=>setReps(e.target.value)} placeholder="Nº de repetições"/></label><label>Tempo de cada repetição (s)<input type="number" min={1} max={30} step={1} inputMode="numeric" value={repSeconds} onChange={e=>setRepSeconds(e.target.value)} placeholder="Tempo orientado"/></label><label>Relaxar entre repetições (s)<input type="number" min={0} max={60} step={1} inputMode="numeric" value={releaseSeconds} onChange={e=>setReleaseSeconds(e.target.value)}/></label></>:<label>Tempo por série (s)<input type="number" min={1} max={600} step={1} inputMode="numeric" value={seconds} onChange={e=>setSeconds(e.target.value)} placeholder="Tempo orientado"/></label>}<label>Descanso entre séries (s)<input type="number" min={0} max={300} step={1} inputMode="numeric" value={restSeconds} onChange={e=>setRestSeconds(e.target.value)} placeholder="0 sem descanso"/></label></fieldset>
   </details>
   {!task.coach&&<button type="button" className="primary coach-main" onClick={()=>void start()} disabled={!valid}><Play size={22}/> Iniciar exercício</button>}
   {!valid&&<small className="coach-note">Preencha os campos com os valores da prescrição para iniciar.</small>}
   <p className="coach-footer">Escolha como prefere acompanhar. Use “Testar áudio” antes de começar.</p>
  </div>:<>
   <div className={'coach-stage '+run.stage+(run.paused?' paused':'')}>
    <div key={run.stage+run.set+':'+run.rep} className="coach-fill" aria-hidden="true" style={{height:fill+'%'}}/>
    <div className="coach-timer-content"><div className="coach-run-meta"><p className="coach-series">Série <strong>{run.set}</strong> de {c?.sets}</p>{c?.mode==='reps'&&['exercise','release'].includes(run.stage)&&<p className="coach-repetition">Repetição <strong>{run.rep}</strong> de {c.reps}</p>}</div>
     <h4>{label}</h4>     {running&&<><div className="coach-count" role="timer" aria-label={run.count+" segundos restantes"}>{run.count}</div><p className="coach-unit">segundos</p>
      <p className="coach-remaining">{run.stage==='exercise'||run.stage==='release'?c?.mode==='reps'?(run.stage==='release'?c.reps!-run.rep:c.reps!-run.rep+1)+' repetições restantes':'Mantenha o movimento':run.stage==='prepare'?'Começamos em instantes':'Recupere o fôlego'}</p>
      <progress className="sr-only" aria-label="Progresso da contagem" max={duration||1} value={(duration||0)-run.count}/></>}
     {run.stage==='next'&&<p className="coach-remaining">Inicie quando estiver pronto.</p>}
     {run.stage==='finished'&&<><Check size={58} aria-hidden="true"/><p className="coach-remaining">Você terminou todas as séries.</p></>}
     <span className="sr-only" role="status">{run.paused?'Guia pausado.':run.stage==='next'?'Descanso concluído. Você pode iniciar a próxima série.':run.stage==='finished'?'Contagem concluída. Registre como foi a atividade.':'Série '+run.set+(run.stage==='rest'?', descanso.':run.stage==='prepare'?', preparação.':run.stage==='release'?', relaxe.':', em execução.')}</span>
    </div>
   </div>
   {message&&<p className="coach-message" role="status">{message}</p>}
   {audioControls}
   <div className="coach-controls">{running&&<button type="button" className="primary coach-main" onClick={()=>void pause()}>{run.paused?<Play size={22}/>:<Pause size={22}/>} {run.paused?'Continuar':'Pausar'}</button>}{run.stage==='next'&&<button type="button" className="primary coach-main" onClick={()=>void nextSet()}><Play size={22}/> Iniciar próxima série</button>}{run.stage==='finished'&&<button type="button" className="primary coach-main" onClick={()=>{stopSound();onReview()}}><Check size={20}/> Registrar como foi</button>}
    <div className="coach-bottom-controls"><button type="button" className="coach-test" onClick={()=>chooseSound(sound==='off'?(voiceAvailable?'voice':'beep'):'off')}>{sound==='off'?<VolumeX size={20}/>:<Volume2 size={20}/>} {sound==='off'?'Ativar áudio':'Silenciar'}</button><button type="button" className="secondary" onClick={reset}><RotateCcw size={18}/>{run.stage==='finished'?'Novo treino':'Reiniciar'}</button></div>
   </div>
   <p className="coach-footer">Mantenha esta tela aberta. Sair dela pausa a contagem.</p>
  </>}
 </section>;
}
