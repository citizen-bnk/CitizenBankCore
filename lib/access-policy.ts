/** Banking and institutional roles are separate privilege domains. */
export function bankingCustomerPath(path:string){return /^\/api\/(me|accounts|cards|beneficiaries|payments|transfers|scheduled|loans|transactions|statements|insights|assistant|tts)(\/|$)/.test(path);}
export function canUseBanking(roles:readonly string[]){return roles.includes('CUSTOMER');}
