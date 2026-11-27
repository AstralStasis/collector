export const copyArchive = (value) => JSON.parse(JSON.stringify(value));
export function emptyArchive() {
  return {version:1,profile:{name:"光之冒险者",server:"艾欧泽亚",demo:false},owned:[],wishlist:[],plan:[],preferences:{category:"all",style:"casual",budget:"45",excludePaid:true,prioritizeWish:true},activity:[],lastUpdated:0};
}
export function archiveFingerprint(value) {
  return JSON.stringify({profile:value.profile,owned:[...value.owned].sort(),wishlist:[...value.wishlist].sort(),plan:value.plan,preferences:value.preferences,activity:value.activity});
}
export function mergeArchives(base, local, remote) {
  if(base===null||base===undefined)base=emptyArchive();
  const result=copyArchive(remote);
  for(const group of ["profile","preferences"]) {
    result[group]={...remote[group]};
    for(const key of Object.keys(local[group])) {
      const localValue=JSON.stringify(local[group][key]),previous=base[group];
      const previousValue=previous===null||previous===undefined?undefined:previous[key];
      if(localValue!==JSON.stringify(previousValue))result[group][key]=local[group][key];
    }
  }
  for(const field of ["owned","wishlist","plan"]) {
    const a=new Set(base[field]),b=new Set(local[field]),c=new Set(remote[field]);
    const all=new Set([...a,...b,...c]);
    const selected=new Set([...all].filter(key=>b.has(key)===a.has(key)?c.has(key):b.has(key)));
    const localOrder=field==="plan"&&JSON.stringify(local.plan)!==JSON.stringify(base.plan);
    const order=localOrder?[...local[field],...remote[field]]:[...remote[field],...local[field]];
    result[field]=[...new Set(order)].filter(key=>selected.has(key));
  }
  result.wishlist=result.wishlist.filter(key=>!result.owned.includes(key));
  const activity=new Map([...remote.activity,...local.activity].map(x=>[`${x.at}:${x.text}`,x]));
  result.activity=[...activity.values()].sort((a,b)=>b.at-a.at).slice(0,30);
  result.lastUpdated=Date.now();return result;
}
