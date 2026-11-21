/** Manual availability check only; never starts a background polling loop. */
import {db} from '@/db';
import {sql} from 'drizzle-orm';
export const dynamic='force-dynamic';
export async function GET(){
  try {
    const configured=process.env.PLATFORM_WEBSITE_URL || 'https://citizenbank.co.ls';
    const base=['https://citizenbank.co.ls','https://citizen-website-demo.vercel.app'].includes(configured)?configured:'https://citizenbank.co.ls';
    const response=await fetch(base+'/api/health/ready',{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(6000)});
    const body=await response.json();
    if(response.ok && body.status==='ready'){
      await db.execute(sql`select 1`);
      return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
    }
  } catch {}
  return Response.json({ok:false,code:'DATA_CONNECTION_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'no-store','Retry-After':'60'}});
}
