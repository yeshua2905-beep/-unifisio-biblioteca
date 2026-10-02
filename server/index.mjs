import {resolve} from 'node:path';
import {createApp} from './app.mjs';
const production=process.env.NODE_ENV==='production';
const publicUrl=process.env.PUBLIC_URL||(!production?'http://localhost:3000':null);
if(!publicUrl||publicUrl.includes('SEU-ENDERECO'))throw new Error('Configure PUBLIC_URL com o endereço real da biblioteca.');
const secure=new URL(publicUrl).protocol==='https:';if(production&&!secure)throw new Error('PUBLIC_URL precisa usar HTTPS em produção.');
const app=await createApp({dataDir:resolve(process.env.DATA_DIR||'data'),publicUrl,staticDir:resolve('dist'),secure,trustProxy:process.env.TRUST_PROXY==='1'});
app.server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Biblioteca Unifisio iniciada.'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>app.server.close(()=>{app.close();process.exit(0)}));
