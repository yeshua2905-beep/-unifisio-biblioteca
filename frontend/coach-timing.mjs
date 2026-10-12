/** One elapsed second. Remaining time is always positive while a phase is active. */
export function nextCoachTick(run, config) {
 const duration=config.mode==='reps'?config.repSeconds:config.seconds;
 const begin=(rep=run.rep)=>({run:{...run,stage:'exercise',rep,count:duration,paused:false},cue:(config.command||'Execute')+'.',phaseStart:true});
 const complete=()=>{
  if(run.set>=config.sets)return {run:{...run,stage:'finished',count:0,paused:false},cue:'Contagem concluída. Registre como foi a atividade.',phaseStart:true};
  if(config.restSeconds>0)return {run:{...run,stage:'rest',count:config.restSeconds},cue:'Série '+run.set+' concluída. Descanse.',phaseStart:true};
  return {run:{...run,stage:'next',count:0},cue:'Série concluída. Inicie a próxima quando estiver pronto.',phaseStart:true};
 };
 if(run.paused||!['prepare','exercise','release','rest'].includes(run.stage))return {run,cue:null,phaseStart:false};
 if(run.count>1){const count=run.count-1;return {run:{...run,count},cue:String(count),phaseStart:false};}
 if(run.stage==='prepare')return begin();
 if(run.stage==='rest')return {run:{...run,stage:'next',count:0},cue:'Descanso concluído. Inicie a próxima série quando estiver pronto.',phaseStart:true};
 if(run.stage==='exercise'&&config.mode==='reps'&&(config.releaseSeconds||0)>0)return {run:{...run,stage:'release',count:config.releaseSeconds},cue:'Relaxe.',phaseStart:true};
 if(config.mode==='reps'&&run.rep<config.reps)return begin(run.rep+1);
 return complete();
}
