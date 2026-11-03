// Optional, synthesized effects; no audio assets or network requests.
export class Sound {
  constructor(){this.enabled=false;this.context=null;}
  toggle(){
    this.enabled=!this.enabled;
    if(this.enabled){try{const Audio=window.AudioContext||window.webkitAudioContext;this.context ||= new Audio();void this.context.resume();this.play('merge');}catch{this.enabled=false;}}
    return this.enabled;
  }
  play(type){
    if(!this.enabled||!this.context)return;
    const settings={attack:[130,.07,'triangle'],merge:[600,.18,'sine'],loot:[740,.09,'sine'],divide:[320,.2,'triangle'],hurt:[75,.12,'sawtooth'],dash:[210,.05,'sine'],kill:[240,.12,'triangle'],heal:[500,.15,'sine'],finish:[850,.25,'sine']};
    const setting=settings[type];if(!setting)return;
    try{const [frequency,duration,wave]=setting,ctx=this.context,osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.type=wave;osc.frequency.setValueAtTime(frequency,ctx.currentTime);osc.frequency.exponentialRampToValueAtTime(frequency*(type==='hurt'?.5:1.35),ctx.currentTime+duration);
      gain.gain.setValueAtTime(.035,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+duration);
      osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+duration);
    }catch{/* Audio support must never block gameplay. */}
  }
}
