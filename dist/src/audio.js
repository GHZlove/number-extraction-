// Short synthesized transients, rate-limited for dense crowds. No audio assets.
const GUNS={
  pistol:[.045,.075,2200,120],smg:[.025,.045,2700,150],rifle:[.05,.08,1900,95],carbine:[.035,.06,2400,140],lmg:[.045,.075,1600,90],
  shotgun:[.095,.11,1500,70],sniper:[.09,.105,1150,55],railgun:[.1,.07,3000,330],crossbow:[.04,.05,1400,210],grenade:[.09,.09,850,65],
  revolver:[.075,.09,1700,80],doublebarrel:[.09,.11,1400,65],plasma:[.08,.035,3200,540],flamethrower:[.12,.045,900,110],rocket:[.14,.1,700,50],
};
export class Sound {
  constructor(){this.enabled=false;this.context=null;this.master=null;this.noiseBuffer=null;this.last=new Map();}
  toggle(){
    this.enabled=!this.enabled;
    if(this.enabled){try{
      const Audio=window.AudioContext||window.webkitAudioContext;this.context ||= new Audio();
      if(!this.master){this.master=this.context.createGain();this.master.gain.value=.55;this.master.connect(this.context.destination);}
      const resumed=this.context.resume();resumed?.catch?.(()=>{});this.play('merge');
    }catch{this.enabled=false;}}
    return this.enabled;
  }
  tone(frequency,duration,wave='triangle',volume=.035,end=frequency*.6){
    const ctx=this.context,osc=ctx.createOscillator(),gain=ctx.createGain(),now=ctx.currentTime;
    osc.type=wave;osc.frequency.setValueAtTime(frequency,now);osc.frequency.exponentialRampToValueAtTime(Math.max(30,end),now+duration);
    gain.gain.setValueAtTime(volume,now);gain.gain.exponentialRampToValueAtTime(.001,now+duration);
    osc.connect(gain);gain.connect(this.master||ctx.destination);osc.start(now);osc.stop(now+duration);
  }
  noise(duration,volume,cutoff){
    const ctx=this.context;if(!ctx.createBuffer||!ctx.createBufferSource)return;
    if(!this.noiseBuffer){this.noiseBuffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.2),ctx.sampleRate);const samples=this.noiseBuffer.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;}
    const source=ctx.createBufferSource(),gain=ctx.createGain(),now=ctx.currentTime;source.buffer=this.noiseBuffer;
    gain.gain.setValueAtTime(volume,now);gain.gain.exponentialRampToValueAtTime(.001,now+duration);
    if(ctx.createBiquadFilter){const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.setValueAtTime(cutoff,now);source.connect(filter);filter.connect(gain);}else source.connect(gain);
    gain.connect(this.master||ctx.destination);source.start(now);source.stop(now+duration);
  }
  play(type,event={}){
    if(!this.enabled||!this.context)return;
    const key=type==='attack'?`${type}:${event.weapon||'pistol'}`:type,now=this.context.currentTime;
    const gap=type==='hit'?.045:type==='kill'?.06:type==='attack'?.025:.07;
    if(now-(this.last.get(key)??-Infinity)<gap)return;this.last.set(key,now);
    try{
      if(type==='attack'){
        const setting=GUNS[event.weapon||'pistol'];
        if(setting){const[d,v,cutoff,f]=setting;this.noise(d,v,cutoff);this.tone(f,d+.025,'triangle',.035,f*.45);}
        else{const heavy=['greatsword','warhammer','battleaxe'].includes(event.weapon);this.noise(heavy?.1:.055,.055,heavy?1100:2400);this.tone(heavy?85:190,.07,'triangle',.025);}
      }else if(type==='hit'){
        const heavy=event.strength>=.9;this.noise(heavy?.055:.025,event.blocked?.035:heavy?.075:.045,event.blocked?3500:1900);
        this.tone(event.blocked?820:heavy?120:230,heavy?.075:.035,event.blocked?'sine':'triangle',.025);
      }else if(type==='armorbreak'){
        this.noise(.09,.055,4200);for(const f of [1100,1600,2100])this.tone(f,.11,'sine',.018,f*.55);
      }else if(type==='explosion'){
        this.noise(.18,.13,700);this.tone(75,.18,'sawtooth',.04,32);
      }else if(type==='kill'){
        this.noise(.055,.055,2600);this.tone(250,.09,'triangle',.035,520);
      }else{
        const settings={merge:[600,.18,'sine'],loot:[740,.09,'sine'],divide:[320,.2,'triangle'],hurt:[75,.12,'sawtooth'],dash:[210,.05,'sine'],heal:[500,.15,'sine'],finish:[850,.25,'sine'],node:[440,.18,'sine'],overload:[160,.2,'sawtooth'],parry:[1200,.14,'sine'],guard:[440,.05,'triangle']};
        const setting=settings[type];if(setting)this.tone(setting[0],setting[1],setting[2],.035,setting[0]*(type==='hurt'?.5:1.35));
      }
    }catch{/* Audio support must never block the game. */}
  }
}
