import {createHash} from 'node:crypto';
import {and,eq,isNull} from 'drizzle-orm';
import {dataScope,demoDatabaseUrl} from '../lib/execution-context';
export async function ensureDemonstrationCards(){
 if(dataScope()!=='demo')throw Error('Card seeding requires the isolated demonstration scope');demoDatabaseUrl();
 const {db,schema:S}=await import('./index');let inserted=0;
 for(const user of await db.select({id:S.users.id}).from(S.users)){
 const accounts=await db.select().from(S.accounts).where(eq(S.accounts.userId,user.id));const current=accounts.find(a=>a.type==='CURRENT'),savings=accounts.find(a=>a.type==='SAVINGS');if(!current)continue;
 const existing=await db.select().from(S.cards).where(and(eq(S.cards.userId,user.id),isNull(S.cards.archivedAt)));
 for(const [index,label,account,form] of [[0,'Current',current,'PHYSICAL'],[1,'Savings',savings||current,'PHYSICAL'],[2,'Virtual',current,'VIRTUAL']] as const){
 if(existing.some(c=>c.label===label&&c.status==='ACTIVE'))continue;
 const hash=createHash('sha256').update('citizen-fictional-card:'+user.id+':'+index).digest('hex');const id=`${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
 const added=await db.insert(S.cards).values({id,userId:user.id,accountId:account.id,label,last4:String(1000+parseInt(hash.slice(0,6),16)%9000),brand:index===1?'MASTERCARD':'VISA',kind:'DEBIT',form,expiry:'10/30',status:'ACTIVE',dailyLimit:'5000.00',monthlyLimit:'50000.00'}).onConflictDoNothing().returning({id:S.cards.id});inserted+=added.length;
 }
 }return inserted;
}
