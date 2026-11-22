export const CUSTOMER_PRODUCTS=['CURRENT','SAVINGS','CRYPTO'] as const;
export const CUSTOMER_TEST_CREDIT_CENTS=500_000;
export function customerDefaultPermissions(roles:readonly string[]){const allowed=roles.includes('CUSTOMER');return {accounts:allowed,cards:allowed,energize:allowed};}
export function shouldCreateVirtualCard(cards:{form:string;archivedAt:Date|null}[],allowMixed=false){
 const current=cards.filter(c=>!c.archivedAt);
 return !current.some(c=>c.form==='VIRTUAL')&&(allowMixed||!current.some(c=>c.form==='PHYSICAL'));
}
