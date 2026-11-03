import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateBriefAssessment} from '../server/assessment-ai.mjs';
import {assessmentValues} from '../server/clinical-assessment.mjs';
const value={history:'Relato clínico de teste',diagnosis:'Diagnóstico informado'};
const result={conduct:'Rascunho para revisão',patientExplanation:'Orientação para revisão',reassessment:'Reavaliar capacidade'};
const payload=r=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(r)}]}]});
test('Formato breve exige somente os dois textos e mantém triagem desconhecida',()=>{
 const reject=(status,message)=>{throw new Error(message)};
 const v=assessmentValues({...value,mode:'brief'},reject);
 assert.equal(v.triage,'unassessed');assert.deepEqual(v.factors,[]);assert.equal(v.diagnosis,value.diagnosis);
 assert.throws(()=>assessmentValues({...value,mode:'brief',diagnosis:'x'.repeat(4001)},reject));
});
test('Geração envia só os dois campos, usa saída estruturada e não armazena resposta na API',async()=>{
 let request;
 const output=await generateBriefAssessment({...value,patientName:'Não enviar',email:'private@example.org',exam:'Registro antigo não enviar'},{apiKey:'test-key',model:'test-model',fetcher:async(url,options)=>{request={url,...options};return Response.json(payload(result))}});
 assert.deepEqual(output,{...result,sources:[]});
 const body=JSON.parse(request.body);assert.deepEqual(JSON.parse(body.input),value);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.equal(body.model,'test-model');assert.match(body.instructions,/Não invente/);
});
test('Sem configuração, não chama provedor nem apresenta regras fixas como geração',async()=>{
 await assert.rejects(()=>generateBriefAssessment(value,{apiKey:'',model:'',fetcher:()=>assert.fail()}),{status:503});
});
test('Falha, recusa, resposta incompleta ou inválida nunca vira conduta',async()=>{
 const invalid=[{status:'incomplete',output:[]},{status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'Não'}]}]},payload({...result,conduct:''}),payload({...result,conduct:'x'.repeat(4001)}),payload({conduct:'incompleto'}),payload(null)];
 for(const response of invalid)await assert.rejects(()=>generateBriefAssessment(value,{apiKey:'test',model:'test',fetcher:async()=>Response.json(response)}),{status:502});
 await assert.rejects(()=>generateBriefAssessment(value,{apiKey:'test',model:'test',fetcher:async()=>new Response('secret-provider-error',{status:401})}),e=>e.status===502&&!e.message.includes('secret'));
 await assert.rejects(()=>generateBriefAssessment(value,{apiKey:'test',model:'test',fetcher:async()=>{throw new Error('timeout')}}),{status:502});
});
