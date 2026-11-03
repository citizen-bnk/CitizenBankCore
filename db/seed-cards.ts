import {loadEnv} from './env';
import {demoDatabaseUrl,withDataScope} from '../lib/execution-context';
import {ensureDemonstrationCards} from './card-seed';
loadEnv();demoDatabaseUrl();
withDataScope('demo',ensureDemonstrationCards).then(async inserted=>{console.log(JSON.stringify({scope:'demo',inserted,blockedCardsReset:0}));await (await import('./index')).closeDatabases();}).catch(()=>{console.error('Demonstration card seed failed; no live database was targeted.');process.exit(1);});
