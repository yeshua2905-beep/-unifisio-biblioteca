import {useState} from 'react';
import {exerciseArtOptions,inferExerciseArt} from './exercise-art-data.mjs';
import type {CoachConfig} from './care-shared';
export {exerciseArtOptions,inferExerciseArt};
type Pose={head:[number,number];body:string;arms:string;legs:string;equipment?:string};
const poses:Record<string,Pose>={
 squat:{head:[145,47],body:'M140 65L118 110',arms:'M137 70L171 86L202 82',legs:'M118 110L164 137L144 188L174 188 M118 110L145 143L127 188L155 188'},
 lunge:{head:[150,42],body:'M150 60L143 112',arms:'M150 69L180 92L189 76',legs:'M143 112L188 119L188 187L213 187 M143 112L106 162L119 187L141 187'},
 step:{head:[146,37],body:'M145 55L136 107',arms:'M145 69L175 84L170 107',legs:'M136 107L185 108L185 145L209 145 M136 107L131 190L155 190',equipment:'M168 195V153H229V195'},
 calf:{head:[155,35],body:'M155 53L151 109',arms:'M155 68L181 90L196 70',legs:'M151 109L151 172L163 188 M151 109L138 171L149 188'},
 seated:{head:[145,42],body:'M145 60L144 117',arms:'M144 73L177 105L178 116',legs:'M144 117L195 117L195 182L217 182 M144 117L179 122L179 187L199 187',equipment:'M102 127H164 M111 127V190 M160 127V190'},
 knee:{head:[116,44],body:'M116 62L116 119',arms:'M116 76L137 112L155 117',legs:'M116 119L163 119L226 116L243 112 M116 119L160 127L160 187L182 187',equipment:'M77 129H138 M86 129V190 M133 129V190'},
 hamstring:{head:[153,37],body:'M153 55L151 111',arms:'M153 72L182 98L191 85',legs:'M151 111L145 188L169 188 M151 111L185 149L222 124L230 110'},
 bridge:{head:[68,156],body:'M89 155L146 111',arms:'M97 157L139 183L166 183',legs:'M146 111L195 135L208 183L232 183 M146 111L184 147L193 187L219 187',equipment:'M47 198H267'},
 hip:{head:[148,36],body:'M148 54L148 111',arms:'M148 72L177 93L190 80',legs:'M148 111L147 187L168 187 M148 111L206 152L229 156'},
 side:{head:[64,137],body:'M86 143L156 159',arms:'M87 145L106 166L134 164',legs:'M156 159L243 180L267 179 M156 159L216 120L248 112',equipment:'M42 198H280'},
 hinge:{head:[205,78],body:'M187 88L132 109',arms:'M177 89L181 140L184 167',legs:'M132 109L140 151L132 188L158 188 M132 109L117 150L108 188L130 188',equipment:'M171 177H203'},
 quadruped:{head:[215,95],body:'M191 105L121 107',arms:'M186 107L181 183L202 183 M183 108L224 111L258 100',legs:'M121 107L138 161L116 185L140 185 M121 107L88 112L50 105',equipment:'M43 198H281'},
 supine:{head:[71,169],body:'M93 169L153 169',arms:'M96 164L100 119L100 85',legs:'M153 169L180 124L226 127 M153 169L203 168L250 182',equipment:'M45 198H282'},
 plank:{head:[243,99],body:'M221 109L139 132',arms:'M214 113L229 181L257 181',legs:'M139 132L63 182L44 184 M139 132L84 184L64 185',equipment:'M35 198H281'},
 push:{head:[171,65],body:'M155 79L115 126',arms:'M159 88L196 99L235 94',legs:'M115 126L89 185L111 185 M115 126L73 183L94 183',equipment:'M245 42V196'},
 raise:{head:[155,55],body:'M155 73L155 120',arms:'M155 83L108 51L88 23 M155 83L202 51L222 23',legs:'M155 120L136 188L157 188 M155 120L177 188L197 188'},
 row:{head:[135,48],body:'M132 65L121 115',arms:'M131 78L164 99L143 106',legs:'M121 115L113 188L136 188 M121 115L150 181L174 181',equipment:'M151 106L264 100'},
 elbow:{head:[144,40],body:'M144 58L144 117',arms:'M144 72L170 113L203 85',legs:'M144 117L131 188L153 188 M144 117L163 188L185 188',equipment:'M194 78L213 89'},
 rotation:{head:[147,41],body:'M147 59L147 117',arms:'M147 74L147 105L201 100',legs:'M147 117L134 188L157 188 M147 117L166 188L188 188',equipment:'M197 100L255 111'},
 neck:{head:[153,42],body:'M148 60L145 117',arms:'M145 72L182 66L173 45',legs:'M145 117L133 188L155 188 M145 117L165 188L188 188'},
 walk:{head:[159,37],body:'M157 55L145 112',arms:'M155 70L119 103L104 83 M155 70L183 89L207 80',legs:'M145 112L172 149L205 187L225 187 M145 112L118 153L91 182L109 187'},
 balance:{head:[155,37],body:'M155 55L155 111',arms:'M155 72L104 89L74 84 M155 72L205 89L232 84',legs:'M155 111L153 188L178 188 M155 111L190 143L173 165'},
 general:{head:[155,38],body:'M155 56L155 113',arms:'M155 73L120 112 M155 73L192 112',legs:'M155 113L132 188L155 188 M155 113L178 188L199 188'}
};
export function ExerciseArt({title='',kind='auto',custom,small=false}:{title?:string;kind?:string;custom?:string;small?:boolean}){
 const key=kind==='auto'?inferExerciseArt(title):kind,label=exerciseArtOptions[key]||title;
 if(kind==='custom'&&custom)return <figure className={'exercise-art '+(small?'small':'')}><img src={custom} alt={'Ilustração de '+title}/><figcaption>{title||'Exercício'}</figcaption></figure>;
 const pose=poses[key]||poses.general;
 return <figure className={'exercise-art '+(small?'small':'')}><svg viewBox="0 0 320 220" role="img" aria-label={'Desenho de '+(title||label)}><ellipse cx="157" cy="196" rx="101" ry="7" fill="#20436b" opacity=".09"/><circle cx="155" cy="106" r="86" fill="#edf4fa"/>{['hand','wrist','foot'].includes(key)?<g stroke="#20436b" strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round">{key==='hand'?<><path d="M103 185L95 133L81 111Q78 99 88 96L106 120V73Q106 59 119 64L125 110V51Q131 38 140 52L144 107V57Q153 46 161 61L161 112V75Q173 61 180 79L185 141L171 185Z"/><circle cx="137" cy="143" r="23" fill="#f6a251" stroke="#dc8a40"/></>:key==='wrist'?<><path d="M54 156L149 142L167 102L214 91L244 112L238 147L201 159L160 163L58 181"/><path d="M162 98Q170 63 206 58" stroke="#dc8a40"/></>:<><path d="M136 43L139 139L192 156L223 175L222 188H94L98 167L105 139L103 43"/><path d="M194 103Q221 118 238 142" stroke="#dc8a40"/></>}</g>:<g stroke="#20436b" strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round">{pose.equipment&&<path d={pose.equipment} stroke="#8eabc4" strokeWidth="6"/>}<path d={pose.legs}/><path d={pose.body} stroke="#dc8a40" strokeWidth="22"/><path d={pose.arms}/><circle cx={pose.head[0]} cy={pose.head[1]} r="14" fill="#f4c5a4" strokeWidth="4"/><path d={`M${pose.head[0]-11} ${pose.head[1]-8}q10-14 23 0`} strokeWidth="6"/></g>}</svg><figcaption>{title||label}</figcaption></figure>
}
export function ExerciseArtPicker({value,onChange,title=''}:{value:Pick<CoachConfig,'illustration'|'illustrationImage'>;onChange:(patch:Partial<CoachConfig>)=>void;title?:string}){
 const [error,setError]=useState('');
 async function upload(file?:File){if(!file)return;setError('');if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>250000){setError('Envie JPG, PNG ou WebP com até 250 KB.');return}const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(file)});onChange({illustration:'custom',illustrationImage:data})}
 return <div className="exercise-art-picker"><label>Desenho do exercício<select value={value.illustration||'auto'} onChange={e=>onChange({illustration:e.target.value,...(e.target.value!=='custom'?{illustrationImage:undefined}:{})})}>{Object.entries(exerciseArtOptions).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>{value.illustration==='custom'&&<label>Enviar a arte específica<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void upload(e.target.files?.[0]).catch(()=>setError('Não foi possível abrir a imagem.'))}/><small>JPG, PNG ou WebP · até 250 KB.</small></label>}{error&&<p role="alert" className="form-error">{error}</p>}<ExerciseArt title={title} kind={value.illustration||'auto'} custom={value.illustrationImage} small/></div>
}
