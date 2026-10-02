import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {openDatabase} from '../server/database.mjs';
import {seedEvidence} from './seed-evidence.mjs';
const collection=JSON.parse(readFileSync(new URL('./knee-protocols.json',import.meta.url),'utf8'));
const db=openDatabase(resolve(process.env.DATA_DIR||'data'));
try{
 const result=seedEvidence(db,collection,process.env.CURATION_ADMIN_EMAIL||process.env.BOOTSTRAP_ADMIN_EMAIL);
 const published=db.prepare("SELECT COUNT(*) AS n FROM materials WHERE id LIKE 'evidence-knee-20261001-%' AND status='published'").get().n;
 console.log('Protocolos joelho '+collection.version+': '+result.status+'; inseridos='+result.inserted+'; publicados='+published);
}finally{db.close();}
