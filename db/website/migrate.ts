/** Explicit, isolated website database migrations. Never runs in the Core build. */
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {Pool} from 'pg';
import {loadEnv} from '../env';
loadEnv();
async function main(){
 if(process.env.DEMO_MODE!=='true')throw new Error('Website bootstrap requires DEMO_MODE=true');
 const url=process.env.WEBSITE_DATABASE_URL;
 if(!url)throw new Error('WEBSITE_DATABASE_URL is required; Core DATABASE_URL is never used');
 const pool=new Pool({connectionString:url,max:1,ssl:/localhost|127\.0\.0\.1/.test(url)?undefined:{rejectUnauthorized:true}});
 const conn=await pool.connect();
 try{
 await conn.query('BEGIN');
 await conn.query("SELECT pg_advisory_xact_lock(71942601)");
 const marker=await conn.query("SELECT to_regclass('citizen_migrations.website') AS marker");
 if(!marker.rows[0].marker){
  const count=await conn.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') AND table_schema NOT LIKE 'pg_toast%'");
  if(count.rows[0].n!==0)throw new Error('Initial bootstrap requires an empty destination');
  await conn.query('CREATE SCHEMA citizen_migrations; CREATE TABLE citizen_migrations.website(name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
 }
 const folder=fileURLToPath(new URL('./migrations/',import.meta.url));
 for(const name of readdirSync(folder).filter(x=>x.endsWith('.sql')).sort()){
  const sql=readFileSync(folder+name,'utf8'),hash=createHash('sha256').update(sql).digest('hex');
  const previous=await conn.query('SELECT sha256 FROM citizen_migrations.website WHERE name=$1',[name]);
  if(previous.rowCount){if(previous.rows[0].sha256!==hash)throw new Error('Applied migration changed: '+name);continue;}
  await conn.query(sql);
  await conn.query('INSERT INTO citizen_migrations.website(name,sha256) VALUES($1,$2)',[name,hash]);
  console.log('Applied',name);
 }
 await conn.query('COMMIT');
 console.log('Website demo database migrated');
 }catch(e){await conn.query('ROLLBACK');throw e;}finally{conn.release();await pool.end();}
}
main().catch(()=>{console.error('Website migration failed; transaction rolled back. Check configuration and SQL without printing credentials.');process.exit(1);});
