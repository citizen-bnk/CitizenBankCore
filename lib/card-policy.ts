export function compatibleCardAccount(kind:'DEBIT'|'CRYPTO',accountType:string){return kind==='CRYPTO'?accountType==='CRYPTO':['CURRENT','SAVINGS'].includes(accountType);}
export function cardFormAllowed(existingForms:readonly string[],requested:'VIRTUAL'|'PHYSICAL',administratorApproved:boolean){return administratorApproved||existingForms.every(form=>form===requested);}
