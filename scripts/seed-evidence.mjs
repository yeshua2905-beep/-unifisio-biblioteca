import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {openDatabase,transaction} from '../server/database.mjs';

const categories=new Set(['Ombro','Joelho','Coluna','Quadril','Tornozelo e pé','Cotovelo e mão','Dor crônica','Esporte e retorno','Pós-operatório','Avaliação funcional','Gestão e procedimentos']);
const kinds=new Set(['Artigo científico','Protocolo clínico','Teste e avaliação','Material para paciente','Procedimento interno','Aula e treinamento']);
export function validateCollection(collection){
 if(!collection||typeof collection.version!=='string'||!/^20\d{2}-\d{2}-\d{2}-v\d+$/.test(collection.version)||!Array.isArray(collection.items)||!collection.items.length)throw new Error('Coleção de evidências inválida.');
 const ids=new Set();
 for(const item of collection.items){
  if(!item||typeof item.id!=='string'||!/^evidence-[a-z0-9-]+$/.test(item.id)||ids.has(item.id))throw new Error('Identificador de evidência inválido ou duplicado.');
  ids.add(item.id);
  for(const [field,max,min] of [['title',180,1],['summary',20000,1],['reference',2000,1],['url',2000,0]]){
   if(typeof item[field]!=='string'||item[field].length>max||item[field].length<min)throw new Error('Campo inválido na evidência: '+field);
  }
  if(!categories.has(item.category)||!kinds.has(item.kind))throw new Error('Categoria ou tipo de evidência inválido.');
  if(item.url){let u;try{u=new URL(item.url);}catch{throw new Error('URL de evidência inválida.');}if(u.protocol!=='https:')throw new Error('Fonte de evidência deve usar HTTPS.');}
 }
 return collection;
}
export function seedEvidence(db,collection,email,now=new Date().toISOString()){
 validateCollection(collection);
 const author=db.prepare("SELECT id,name FROM users WHERE email=? COLLATE NOCASE AND role='admin' AND active=1").get(email||'');
 if(!author)return {status:'waiting-for-admin',inserted:0,total:collection.items.length};
 return transaction(db,()=>{
  db.exec('CREATE TABLE IF NOT EXISTS evidence_imports(version TEXT PRIMARY KEY,inserted INTEGER NOT NULL,created_at TEXT NOT NULL);');
  if(db.prepare('SELECT version FROM evidence_imports WHERE version=?').get(collection.version))return {status:'already-imported',inserted:0,total:collection.items.length};
  const insert=db.prepare("INSERT INTO materials(id,title,category,kind,summary,reference,url,status,author_id,author_name,created_at,updated_at,review_note) VALUES(?,?,?,?,?,?,?,'published',?,?,?,?,?) ON CONFLICT(id) DO NOTHING");
  const audit=db.prepare('INSERT INTO audit(actor_id,action,subject_id,created_at) VALUES(?,?,?,?)');
  let inserted=0;
  for(const item of collection.items){
   const result=insert.run(item.id,item.title,item.category,item.kind,item.summary,item.reference,item.url,author.id,author.name,now,now,'Importação autorizada de curadoria assistida; método e limitações descritos no material.');
   if(result.changes){inserted++;audit.run(author.id,'evidence_import',item.id,now);}
  }
  db.prepare('INSERT INTO evidence_imports(version,inserted,created_at) VALUES(?,?,?)').run(collection.version,inserted,now);
  return {status:'imported',inserted,total:collection.items.length};
 });
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
 const collection=JSON.parse(readFileSync(new URL('./evidence.json',import.meta.url),'utf8'));
 const db=openDatabase(resolve(process.env.DATA_DIR||'data'));
 try{
  const result=seedEvidence(db,collection,process.env.CURATION_ADMIN_EMAIL||process.env.BOOTSTRAP_ADMIN_EMAIL);
  const published=db.prepare("SELECT COUNT(*) AS n FROM materials WHERE id LIKE 'evidence-20261002-%' AND status='published'").get().n;
  console.log('Curadoria '+collection.version+': '+result.status+'; inseridos='+result.inserted+'; coleção='+result.total+'; publicados='+published);
 }finally{db.close();}
}
