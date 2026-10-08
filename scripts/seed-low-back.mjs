import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {openDatabase} from '../server/database.mjs';
import {seedEvidence} from './seed-evidence.mjs';

const collection=JSON.parse(readFileSync(new URL('./low-back-evidence.json',import.meta.url),'utf8'));
const db=openDatabase(resolve(process.env.DATA_DIR||'data'));
try{
 const result=seedEvidence(db,collection,process.env.CURATION_ADMIN_EMAIL||process.env.BOOTSTRAP_ADMIN_EMAIL);
 const placeholders=collection.items.map(()=>'?').join(',');
 const published=db.prepare(`SELECT COUNT(*) AS n FROM materials WHERE id IN (${placeholders}) AND status='published'`).get(...collection.items.map(item=>item.id)).n;
 console.log('Curadoria lombar '+collection.version+': '+result.status+'; inseridos='+result.inserted+'; coleção='+result.total+'; publicados='+published);
}finally{db.close();}
