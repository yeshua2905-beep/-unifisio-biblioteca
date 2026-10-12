import type {CoachConfig} from './care-shared';
type TimerRun={stage:'ready'|'prepare'|'exercise'|'release'|'rest'|'next'|'finished';set:number;rep:number;count:number;paused:boolean};
export function nextCoachTick(run:TimerRun,config:CoachConfig):{run:TimerRun;cue:string|null;phaseStart:boolean};
