import {bankingStatus} from '@/lib/banking-status';
export function GET(){return Response.json(bankingStatus,{headers:{'Cache-Control':'no-store'}});}
