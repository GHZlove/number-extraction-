export class Input {
  constructor(canvas,onPause) {
    this.keys=new Set();this.pressed=new Set();this.touchKeys=new Set();this.joy={x:0,y:0};this.active=false;
    const controlled=['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD','KeyQ','KeyR','KeyE','ShiftLeft','ShiftRight'];
    window.addEventListener('keydown',e=>{
      if(e.code==='Escape'&&!e.repeat){onPause();return;}
      if(!this.active||e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
      if(controlled.includes(e.code))e.preventDefault();
      if(!this.keys.has(e.code))this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup',e=>this.keys.delete(e.code));
    window.addEventListener('blur',()=>this.clear());
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.clear();});
    canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&this.active&&e.button===0){canvas.focus();this.keys.add('Space');}});
    window.addEventListener('pointerup',()=>this.keys.delete('Space'));
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    for(const button of document.querySelectorAll('[data-control]')) {
      const code=button.dataset.control;
      button.addEventListener('pointerdown',e=>{e.preventDefault();if(!this.active)return;button.setPointerCapture(e.pointerId);this.touchKeys.add(code);this.pressed.add(code);button.classList.add('held');});
      for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>{this.touchKeys.delete(code);button.classList.remove('held');});
    }
    const joystick=document.getElementById('joystick'),knob=document.getElementById('joystick-knob');
    let pointer=null;
    const update=e=>{const r=joystick.getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2;
      const length=Math.hypot(dx,dy)||1,amount=Math.min(length,37);this.joy={x:dx/length*amount/37,y:dy/length*amount/37};
      knob.style.transform=`translate(${this.joy.x*37}px,${this.joy.y*37}px)`;};
    joystick.addEventListener('pointerdown',e=>{e.preventDefault();if(!this.active||pointer!==null)return;pointer=e.pointerId;joystick.setPointerCapture(pointer);update(e);});
    joystick.addEventListener('pointermove',e=>{if(e.pointerId===pointer)update(e);});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])joystick.addEventListener(type,e=>{if(e.pointerId===pointer){pointer=null;this.joy={x:0,y:0};knob.style.transform='';}});
    this.resetJoystick=()=>{pointer=null;knob.style.transform='';};
  }
  clear(){this.keys.clear();this.pressed.clear();this.touchKeys.clear();this.joy={x:0,y:0};this.resetJoystick?.();document.querySelectorAll('.held').forEach(el=>el.classList.remove('held'));}
  consume(){
    const held=code=>this.keys.has(code)||this.touchKeys.has(code);
    const state={x:(held('KeyD')||held('ArrowRight')?1:0)-(held('KeyA')||held('ArrowLeft')?1:0)+this.joy.x,
      y:(held('KeyS')||held('ArrowDown')?1:0)-(held('KeyW')||held('ArrowUp')?1:0)+this.joy.y,
      attack:held('Space'),interact:held('KeyE'),divide:this.pressed.has('KeyQ'),heal:this.pressed.has('KeyR'),
      dash:this.pressed.has('ShiftLeft')||this.pressed.has('ShiftRight')};
    this.pressed.clear();return state;
  }
}
