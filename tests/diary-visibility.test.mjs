import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
test('Diário profissional mostra o relato mais recente aberto, sem edição e com texto escapado',async()=>{
 const dir=await mkdtemp(resolve(process.cwd(),'.diary-render-'));
 try{
  for(const name of ['care-shared','patient-diary']){
   const source=await readFile(resolve('frontend',name+(name==='patient-diary'?'.tsx':'.ts')),'utf8');
   const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText.replace("from './care-shared'","from './care-shared.mjs'");
   await writeFile(resolve(dir,name+'.mjs'),output);
  }
  const {DiaryHistory}=await import(pathToFileURL(resolve(dir,'patient-diary.mjs')).href);
  const entries=[{id:'new',performed_date:'2026-10-14',perception:'Caminhei melhor',complaints:'Incômodo ao levantar',feedback:'<script>Não executar</script>',revision:1,created_at:'2026-10-14T12:00:00Z',updated_at:'2026-10-14T12:00:00Z'},{id:'old',performed_date:'2026-10-13',perception:'Dia anterior',complaints:'',feedback:'',revision:1,created_at:'2026-10-13T12:00:00Z',updated_at:'2026-10-13T12:00:00Z'}];
  const html=renderToStaticMarkup(createElement(DiaryHistory,{entries}));
  assert.match(html,/<details class="diary-entry" open="">/);
  assert.equal((html.match(/open=""/g)||[]).length,1);
  for(const text of ['Caminhei melhor','Incômodo ao levantar','&lt;script&gt;Não executar&lt;/script&gt;'])assert.ok(html.includes(text));
  assert.ok(!html.includes('Editar registro'));assert.ok(!html.includes('<script>'));
  const patient=renderToStaticMarkup(createElement(DiaryHistory,{entries,today:'2026-10-14',onEdit:()=>{}}));
  assert.ok(patient.includes('Editar registro'));assert.ok(!patient.includes('open=""'));
 }finally{await rm(dir,{recursive:true,force:true})}
});
