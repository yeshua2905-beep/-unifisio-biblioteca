import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,Check,Pause,Play,RotateCcw,Volume2,VolumeX} from 'lucide-react';
import type {CareTask,CoachConfig} from './care-shared';
import './exercise-coach.css';

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
 const runRef=useRef(run),config=useRef<CoachConfig|null>(null),deadline=useRef(0),remaining=useRef(0),audio=useRef<AudioContext|null>(null),nodes=useRef<OscillatorNode[]>([]),soundRef=useRef(sound),voiceRef=useRef<SpeechSynthesisVoice|null>(null),active=useRef(true),operation=useRef(0),inFlight=useRef(false),cueVersion=useRef(0);
 const sync=(next:Run)=>{runRef.current=next;setRun(next)};
 const supportedVoice=voices.find(v=>/^pt[-_]BR$/i.test(v.lang))||voices.find(v=>/^pt/i.test(v.lang));
 soundRef.current=sound;voiceRef.current=supportedVoice||null;
 const stopSound=()=>{cueVersion.current++;if('speechSynthesis' in window)window.speechSynthesis.cancel();nodes.current.forEach(n=>{try{n.stop()}catch{}});nodes.current=[]};
 async function enableAudio(){if(soundRef.current==='off')return true;try{const Audio=window.AudioContext||(window as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;if(!Audio)throw new Error();if(!audio.current||audio.current.state==='closed')audio.current=new Audio();if(audio.current.state==='suspended')await audio.current.resume();return audio.current.state==='running'}catch{if(soundRef.current==='beep')setMessage('O sinal sonoro não está disponível neste navegador. A contagem visual continua funcionando.');return false}}
 function cue(text:string,end=false){
  if(soundRef.current==='off')return;const cueId=++cueVersion.current;
  if(soundRef.current==='voice'&&voiceRef.current&&'speechSynthesis' in window){
   window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.voice=voiceRef.current;utterance.lang=voiceRef.current.lang;utterance.rate=1.15;
   utterance.onerror=e=>{if(!active.current||soundRef.current!=='voice'||cueId!==cueVersion.current||e.error==='interrupted'||e.error==='canceled')return;if(audio.current?.state==='running'){setSound('beep');soundRef.current='beep';setMessage('A voz falhou. O guia usará sinal sonoro; você também pode escolher Silencioso.');beep(end)}else{setSound('off');soundRef.current='off';setMessage('A voz não está disponível. A contagem visual continua funcionando.')}};
   window.speechSynthesis.speak(utterance);return;
  }
  beep(end);
 }
 function beep(end=false){const ctx=audio.current;if(!ctx||ctx.state!=='running')return;const oscillator=ctx.createOscillator(),gain=ctx.createGain();oscillator.type='sine';oscillator.frequency.value=end?660:440;gain.gain.setValueAtTime(0,ctx.currentTime);gain.gain.linearRampToValueAtTime(.12,ctx.currentTime+.012);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+(end?.35:.11));oscillator.connect(gain);gain.connect(ctx.destination);nodes.current.push(oscillator);oscillator.onended=()=>{nodes.current=nodes.current.filter(n=>n!==oscillator);oscillator.disconnect();gain.disconnect()};oscillator.start();oscillator.stop(ctx.currentTime+(end?.4:.14))}
 useEffect(()=>{
  root.current?.focus({preventScroll:true});root.current?.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  active.current=true;
  if('speechSynthesis' in window){const refresh=()=>setVoices(window.speechSynthesis.getVoices());refresh();window.speechSynthesis.addEventListener('voiceschanged',refresh);return()=>{active.current=false;operation.current++;inFlight.current=false;window.speechSynthesis.removeEventListener('voiceschanged',refresh);stopSound();void audio.current?.close().catch(()=>{})}}
  return()=>{active.current=false;operation.current++;inFlight.current=false;stopSound();void audio.current?.close().catch(()=>{})};
 },[]);
 useEffect(()=>{
  function pauseHidden(){const current=runRef.current;if(document.hidden){operation.current++;inFlight.current=false;stopSound()}if(document.hidden&&['prepare','exercise','rest'].includes(current.stage)&&!current.paused){remaining.current=Math.max(0,deadline.current-performance.now());sync({...current,paused:true});stopSound();setMessage('Guia pausado porque a tela saiu de foco. Toque em Continuar quando estiver pronto.')}}
  document.addEventListener('visibilitychange',pauseHidden);
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
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',pauseHidden)};
 },[]);
 const valid=bounded(sets,1,20)&&bounded(restSeconds,0,300)&&(mode==='reps'?bounded(reps,1,100)&&bounded(repSeconds,1,30):bounded(seconds,1,600));
 async function prepareOperation(expected:Run){
  if(inFlight.current)return false;
  const ticket=++operation.current;inFlight.current=true;
  await enableAudio();
  if(ticket!==operation.current)return false;
  inFlight.current=false;
  return active.current&&!document.hidden&&runRef.current===expected;
 }
 async function start(){const current=runRef.current;if(!valid||current.stage!=='ready')return;setMessage('');if(!await prepareOperation(current))return;config.current={mode,sets:Number(sets),restSeconds:Number(restSeconds),...(mode==='reps'?{reps:Number(reps),repSeconds:Number(repSeconds)}:{seconds:Number(seconds)})};deadline.current=performance.now()+1000;sync({stage:'prepare',set:1,count:3,paused:false});cue('Prepare-se. Três.')}
 async function pause(){const current=runRef.current;if(current.paused){setMessage('');if(!await prepareOperation(current))return;deadline.current=performance.now()+Math.max(100,remaining.current);sync({...current,paused:false});cue('Continue.')}else{operation.current++;inFlight.current=false;remaining.current=Math.max(0,deadline.current-performance.now());sync({...current,paused:true});stopSound()}}
 async function nextSet(){const current=runRef.current;if(current.stage!=='next')return;setMessage('');if(!await prepareOperation(current))return;deadline.current=performance.now()+1000;sync({stage:'prepare',set:current.set+1,count:3,paused:false});cue('Prepare-se. Três.')}
 function reset(){operation.current++;inFlight.current=false;stopSound();config.current=null;sync(initial);setMessage('')}
 const running=['prepare','exercise','rest'].includes(run.stage),c=config.current;
 return <section ref={root} tabIndex={-1} className="exercise-coach" aria-label={'Guia de treino: '+task.title}>
  <header className="coach-header"><div><span className="eyebrow">NO SEU RITMO</span><h3>Treinar com guia</h3><p>{task.title}</p></div><button type="button" className="secondary" onClick={onClose} aria-label="Fechar guia de treino"><ArrowLeft size={18}/> Voltar</button></header>
  <fieldset className="coach-audio"><legend>Como prefere acompanhar?</legend>{([{value:'voice',label:'Voz',icon:Volume2},{value:'beep',label:'Sinal sonoro',icon:Volume2},{value:'off',label:'Silencioso',icon:VolumeX}] as const).map(option=><label key={option.value} className={sound===option.value?'selected':''}><input type="radio" name="coach-sound" value={option.value} checked={sound===option.value} disabled={option.value==='voice'&&!supportedVoice} onChange={()=>{stopSound();setSound(option.value)}}/><option.icon size={18}/>{option.label}</label>)}{sound!=='off'&&<button type="button" className="coach-test" onClick={async()=>{await enableAudio();if(active.current)cue('Um. Dois. Três.')}}>Ouvir teste</button>}</fieldset>
  {!supportedVoice&&<small className="muted">Voz em português indisponível neste navegador. Use o sinal sonoro ou a contagem visual.</small>}
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
