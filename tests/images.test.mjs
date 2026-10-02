import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createApp} from '../server/app.mjs';
import {digest} from '../server/security.mjs';
import {imageFormat} from '../server/image-format.mjs';
const origin='https://images.example';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/WuoAAAAASUVORK5CYII=','base64');
function form(overrides={},file=png){const f=new FormData();for(const[k,v]of Object.entries({title:'Exercício de joelho',description:'Ilustração sem identificação.',category:'Joelho',visibility:'team',...overrides}))f.set(k,v);if(file)f.set('file',new File([file],'teste.png',{type:'image/png'}));return f}
test('Galeria protege arquivo e metadados, revisão, privacidade, edição e persistência',async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'unifisio-images-'));let app=await createApp({dataDir:dir,staticDir:resolve('dist'),publicUrl:origin});
 try{for(const[id,role]of [['admin','admin'],['professional','professional'],['other','professional'],['reader','reader']]){app.db.prepare('INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)').run(id,id+'@example.org',id,'fixture',role,new Date().toISOString());app.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(id),id,Date.now()+60000)}
 async function call(path,method='GET',payload,u='admin',requestOrigin=origin){const headers={Origin:requestOrigin};if(u)headers.Cookie='__Host-unifisio='+u;const body=payload instanceof FormData?payload:payload===undefined?undefined:JSON.stringify(payload);if(payload&&!(payload instanceof FormData))headers['Content-Type']='application/json';return app.handle(new Request(origin+path,{method,headers,...(body?{body}:{})}))}
 assert.equal((await call('/api/images','GET',undefined,'')).status,401);
 assert.equal((await call('/api/images','POST',form(),'reader')).status,403);
 assert.equal((await call('/api/images','POST',form(),'admin','https://evil.example')).status,403);
 const submitted=await call('/api/images','POST',form(),'professional');assert.equal(submitted.status,201);const {id,status}=await submitted.json();assert.equal(status,'pending');
 const url='/api/images/'+id+'/file';assert.equal((await call(url,'GET',undefined,'reader')).status,404);assert.equal((await call(url,'GET',undefined,'')).status,401);assert.equal((await call('/api/images','GET',undefined,'other')).status,200);assert.equal((await (await call('/api/images','GET',undefined,'reader')).json()).images.length,0);
 assert.equal((await call('/api/images','PATCH',{id,status:'published'},'professional')).status,403);
 assert.equal((await call('/api/images','PUT',form({id,title:'Invadir'}),'other')).status,403);
 assert.equal((await call('/api/images','PATCH',{id,status:'rejected',note:'Ajustar legenda.'})).status,200);
 assert.equal((await call('/api/images','PUT',form({id,title:'Legenda revisada'},null),'professional')).status,200);
 assert.equal((await call('/api/images','PATCH',{id,status:'published'})).status,200);
 const image=await call(url,'GET',undefined,'reader');assert.equal(image.status,200);assert.equal(image.headers.get('Content-Type'),'image/png');assert.match(image.headers.get('Content-Disposition'),/^inline/);assert.match(image.headers.get('Cache-Control'),/no-store/);assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);
 assert.match((await call(url+'?download=1','GET',undefined,'reader')).headers.get('Content-Disposition'),/^attachment/);
 assert.equal((await call('/api/images','PUT',form({id},null),'professional')).status,403);
 const restricted=await (await call('/api/images','POST',form({visibility:'restricted'}),'professional')).json();await call('/api/images','PATCH',{id:restricted.id,status:'published'});
 assert.equal((await call('/api/images/'+restricted.id+'/file','GET',undefined,'other')).status,404);assert.equal((await (await call('/api/images','GET',undefined,'reader')).json()).images.length,1);assert.equal((await call('/api/images/'+restricted.id+'/file','GET',undefined,'professional')).status,200);
 assert.equal((await call('/api/images','POST',form({material_id:'unknown'}))).status,400);
 assert.equal((await call('/api/images','POST',form({},Buffer.from('<svg><script>alert(1)</script></svg>')))).status,400);
 assert.equal((await call('/api/images','POST',form({},png.subarray(0,30)))).status,400);
 assert.equal((await call('/api/images','POST',form({},Buffer.alloc(10*1024*1024+1)))).status,413);
 app.close();app=await createApp({dataDir:dir,staticDir:resolve('dist'),publicUrl:origin});assert.equal((await call(url,'GET',undefined,'reader')).status,200);
 await call('/api/images','PATCH',{id,status:'archived'});assert.equal((await call(url,'GET',undefined,'reader')).status,404);
 const key=app.db.prepare('SELECT file_key FROM images WHERE id=?').get(id).file_key;assert.equal((await call('/api/images','DELETE',{id},'reader')).status,403);assert.equal((await call('/api/images','DELETE',{id})).status,200);await assert.rejects(access(resolve(dir,'uploads',key)));assert.equal((await call(url)).status,404);
 app.db.prepare('UPDATE users SET active=0 WHERE id=?').run('professional');assert.equal((await call('/api/images/'+restricted.id+'/file','GET',undefined,'professional')).status,401);
 }finally{app.close();await rm(dir,{recursive:true,force:true})}
});
test('Formatos raster são detectados pelos bytes e dimensão excessiva é recusada',()=>{assert.deepEqual(imageFormat(png),{width:1,height:1,mime:'image/png',ext:'png'});const big=Buffer.from(png);big.writeUInt32BE(20000,16);assert.throws(()=>imageFormat(big),/grande/);assert.throws(()=>imageFormat(Buffer.from('image/jpeg')),/válida/)});

test("Formato jpeg real é reconhecido",()=>{const b=Buffer.from("/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAACAAMDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABv/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AIIApD3/2Q==","base64");const f=imageFormat(b);assert.equal(f.mime,"image/jpeg");assert.equal(f.width,3);assert.equal(f.height,2)});

test("Formato webp real é reconhecido",()=>{const b=Buffer.from("UklGRjgAAABXRUJQVlA4ICwAAADwAQCdASoDAAIAAUAmJaACdLoB+AAF9AAA/vFNr/xu7cy7W5/82BAzQ+dAAA==","base64");const f=imageFormat(b);assert.equal(f.mime,"image/webp");assert.equal(f.width,3);assert.equal(f.height,2)});


test('A tela da galeria entrega o módulo como JavaScript para o navegador',async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'unifisio-gallery-static-'));
 const app=await createApp({dataDir:dir,staticDir:resolve('dist'),publicUrl:origin});
 try{
  const page=await app.handle(new Request(origin+'/imagens.html'));
  assert.equal(page.status,200);
  const html=await page.text();
  const script=html.match(/<script type="module" src="([^"]+)"/)[1];
  assert.equal(script,'/images-gallery.mjs?v=2');
  const module=await app.handle(new Request(origin+script));
  assert.equal(module.status,200);
  assert.equal(module.headers.get('Content-Type'),'text/javascript; charset=utf-8');
  assert.match(await module.text(),/addEventListener\('submit'/);
  const head=await app.handle(new Request(origin+script,{method:'HEAD'}));
  assert.equal(head.headers.get('Content-Type'),'text/javascript; charset=utf-8');
  assert.equal(await head.text(),'');
 }finally{app.close();await rm(dir,{recursive:true,force:true})}
});
