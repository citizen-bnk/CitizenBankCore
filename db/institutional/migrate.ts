import {Client} from 'pg';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const connectionString=process.env.INSTITUTIONAL_DATABASE_URL;
if(!connectionString||connectionString===process.env.DATABASE_URL)throw new Error('Configure a separate INSTITUTIONAL_DATABASE_URL; do not use the banking database.');
const client=new Client({connectionString});
try{
 await client.connect();await client.query("SELECT pg_advisory_lock(hashtext('citizen-institutional-migrations'))");
 await client.query('CREATE TABLE IF NOT EXISTS institutional_migrations(name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
 const folder=join(process.cwd(),'db','institutional');const names=(await readdir(folder)).filter(name=>/^\d{3}_[a-z_]+\.sql$/.test(name)).sort();
 for(const name of names){const sql=(await readFile(join(folder,name),'utf8')).replace(/\r\n/g,'\n');const hash=createHash('sha256').update(sql).digest('hex');const previous=await client.query('SELECT sha256 FROM institutional_migrations WHERE name=$1',[name]);if(previous.rows.length){if(previous.rows[0].sha256!==hash)throw new Error('Installed migration checksum differs: '+name);continue;}
  await client.query('BEGIN');try{await client.query(sql);await client.query('INSERT INTO institutional_migrations(name,sha256) VALUES($1,$2)',[name,hash]);await client.query('COMMIT');console.log('Applied '+name);}catch(error){await client.query('ROLLBACK');throw error;}
 }
}finally{await client.end();}
