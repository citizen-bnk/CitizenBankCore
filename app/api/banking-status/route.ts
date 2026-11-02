import {bankingStatus,liveBankingStatus} from '@/lib/banking-status';
export function GET(){return Response.json(process.env.DEMO_MODE==='true'?bankingStatus:liveBankingStatus,{headers:{'Cache-Control':'no-store'}});}
