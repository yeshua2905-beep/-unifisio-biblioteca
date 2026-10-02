import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
export function openDatabase(dir){mkdirSync(dir,{recursive:true,mode:0o700});const db=new DatabaseSync(resolve(dir,'library.sqlite'));db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));return db;}
export function transaction(db,work){db.exec('BEGIN IMMEDIATE');try{const value=work();db.exec('COMMIT');return value}catch(e){db.exec('ROLLBACK');throw e}}
