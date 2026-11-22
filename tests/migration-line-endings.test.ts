import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {applyMissing} from '../db/catch-up';
test('migration catch-up recognises CRLF equivalence but applies changed SQL',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'citizen-migration-'));
 const source='CREATE TYPE example AS ENUM (\'open\');\n';
 const known=createHash('sha256').update(source.replace(/\n/g,'\r\n')).digest('hex');
 const calls:string[]=[];
 const client={query:async(sql:string)=>{calls.push(sql);return {rows:sql.startsWith('SELECT hash')?[{hash:known}]:[]};},release(){}};
 const pool={connect:async()=>client} as unknown as Parameters<typeof applyMissing>[0];
 try{mkdirSync(join(dir,'meta'));writeFileSync(join(dir,'meta','_journal.json'),JSON.stringify({entries:[{tag:'0000_init',when:1,breakpoints:true}]}));writeFileSync(join(dir,'0000_init.sql'),source);
 assert.deepEqual(await applyMissing(pool,dir),[]);assert.ok(!calls.includes('BEGIN'));
 writeFileSync(join(dir,'0000_init.sql'),source.replace('example','new_example'));
 assert.equal((await applyMissing(pool,dir)).length,1);assert.ok(calls.some(sql=>sql.includes('CREATE TYPE new_example')));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
