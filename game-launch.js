const activities={ENG1:'development',ENG2:'practice',ENG3:'development',ENG4:'practice',ENG5:'development',ENG6:'development',ENG9:'evaluation',ENG10:'practice',ENG11:'practice',R03:'development',R04:'development',R06:'evaluation',R08:'practice',R09:'evaluation'};
export function gameLaunchFor(id) {
  if(typeof id!=='string'||!/^(ENG\d+|R\d+)(-T\d+)?$/.test(id))return null;
  const story=id.split('-T')[0],activity=activities[story];if(!activity)return null;
  const url=new URL('https://factoryrelay.vercel.app/');url.searchParams.set('work',id);url.searchParams.set('activity',activity);if(activity!=='practice')url.hash='inbox';
  return {url:url.href,activity,label:activity==='practice'?'Start / continue practice':'Start / continue study',story,id};
}
export function launchContext(search) {
  const params=new URLSearchParams(search),launch=gameLaunchFor(params.get('work'));
  return launch?{work:launch.id,activity:launch.activity}:null;
}
