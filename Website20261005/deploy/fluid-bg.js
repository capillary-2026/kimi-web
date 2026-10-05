/* fluid-bg.js — Three.js fluid simulation background */
(function () {
  'use strict';

  const VERT = `varying vec2 v_uv;
void main(){v_uv=uv;gl_Position=vec4(position,1.);}`;

  const FLUID_FRAG = `precision highp float;
uniform sampler2D uFluidTex;
uniform vec2 uResolution;
uniform vec4 iMouse;
uniform float uBrushSize,uBrushStrength,uFluidDecay,uTrailLength,uStopDecay;
varying vec2 v_uv;
vec3 enc(vec3 s){return s/0.8+0.5;}
vec3 dec(vec3 r){return(r-0.5)*0.8;}
float lineDist(vec2 p,vec2 a,vec2 b){
  vec2 ab=b-a;float t=clamp(dot(p-a,ab)/max(dot(ab,ab),1e-6),0.,1.);
  return length(p-(a+t*ab));
}
void main(){
  vec2 px=v_uv*uResolution;
  vec2 tx=1./uResolution;
  vec3 prev=dec(texture2D(uFluidTex,v_uv).rgb);
  vec2 vel=prev.rg;float ink=prev.b;
  vec3 L=dec(texture2D(uFluidTex,v_uv+vec2(-tx.x,0.)).rgb);
  vec3 R=dec(texture2D(uFluidTex,v_uv+vec2( tx.x,0.)).rgb);
  vec3 U=dec(texture2D(uFluidTex,v_uv+vec2(0., tx.y)).rgb);
  vec3 D=dec(texture2D(uFluidTex,v_uv+vec2(0.,-tx.y)).rgb);
  vec2 avgV=(L.rg+R.rg+U.rg+D.rg)*0.25;
  float avgI=(L.b+R.b+U.b+D.b)*0.25;
  vel=mix(vel,avgV,.28);ink=mix(ink,avgI,.28);
  vec2 adv=v_uv-vel*tx*1.2;
  vec3 avc=dec(texture2D(uFluidTex,adv).rgb);
  vel=mix(vel,avc.rg,.45);ink=mix(ink,avc.b,.45);
  vec2 mp=iMouse.xy,mp2=iMouse.zw,mv=mp-mp2;
  float ml=length(mv);
  if(ml>6.)mv=mv/ml*6.;
  bool hasM=length(iMouse.xy)>0.;
  if(hasM){
    float qL=lineDist(px,mp,mp2),qP=distance(px,mp),q=mix(qL,qP,.4);
    float bm=exp(-q*q*(2.2e-4/uBrushSize));
    vel+=mv*bm*0.03*uBrushStrength;
    ink+=bm*0.03*uBrushStrength*3.;
  }
  vel*=uFluidDecay;ink*=uTrailLength;
  if(hasM&&ml<0.5){
    float nc=exp(-distance(px,mp)*distance(px,mp)*1e-5);
    vel*=mix(1.,uStopDecay,nc);ink*=mix(1.,uStopDecay,nc);
  }
  vel=clamp(vel,vec2(-.4),vec2(.4));ink=clamp(ink,-.4,.4);
  gl_FragColor=vec4(enc(vec3(vel,ink)),1.);
}`;

  const DISPLAY_FRAG = `precision highp float;
uniform float u_time;uniform vec2 u_resolution;uniform sampler2D u_fluid;
varying vec2 v_uv;
float rand(vec2 n){return fract(sin(dot(n,vec2(12.9898,4.1414)))*43758.5453);}
float noise(vec2 p){
  vec2 i=floor(p),f=fract(p);
  f=f*f*(3.-2.*f);
  return mix(mix(rand(i),rand(i+vec2(1,0)),f.x),mix(rand(i+vec2(0,1)),rand(i+vec2(1,1)),f.x),f.y);
}
float fbm(vec2 p){float s=0.,a=.5,fr=1.;for(int i=0;i<6;i++){s+=noise(p*fr)*a;a*=.5;fr*=2.;}return s;}
vec3 decF(vec2 uv){return(texture2D(u_fluid,uv).rgb-.5)*0.8;}
void main(){
  vec2 uv=v_uv;
  vec3 fs=decF(v_uv);
  uv+=fs.rg*(0.038+0.18*fs.b);
  uv=uv*2.-1.;
  uv*=vec2(u_resolution.x/u_resolution.y,1.);
  float t=u_time*0.2;
  vec2 mov=vec2(fbm(uv*.5+t),fbm(uv*.5+t+2.));
  float pat=smoothstep(0.,1.,fbm(uv+mov));
  vec3 c1=vec3(.85,.92,.96),c2=vec3(.55,.80,.90),c3=vec3(.10,.55,.75);
  gl_FragColor=vec4(mix(mix(c1,c2,pat),c3,pat*pat),1.);
}`;

  function init() {
    const container = document.getElementById('fluid-bg');
    if (!container || typeof THREE === 'undefined') return;

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    let W = innerWidth, H = innerHeight;
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });
    container.appendChild(renderer.domElement);

    let SW = Math.floor(W * 0.5), SH = Math.floor(H * 0.5);
    const rtOpts = {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, type: THREE.HalfFloatType,
    };
    let rtA = new THREE.WebGLRenderTarget(SW, SH, rtOpts);
    let rtB = new THREE.WebGLRenderTarget(SW, SH, rtOpts);

    const geo = new THREE.PlaneGeometry(2, 2);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const fluidMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FLUID_FRAG,
      uniforms: {
        uFluidTex: { value: rtA.texture },
        uResolution: { value: new THREE.Vector2(SW, SH) },
        iMouse: { value: new THREE.Vector4(0, 0, 0, 0) },
        uBrushSize: { value: 1.0 }, uBrushStrength: { value: 1.0 },
        uFluidDecay: { value: 0.985 }, uTrailLength: { value: 0.97 },
        uStopDecay: { value: 0.92 },
      },
    });

    const displayMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: DISPLAY_FRAG,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(W, H) },
        u_fluid: { value: rtA.texture },
      },
    });

    const fluidScene = new THREE.Scene();
    fluidScene.add(new THREE.Mesh(geo, fluidMat));
    const displayScene = new THREE.Scene();
    displayScene.add(new THREE.Mesh(geo, displayMat));

    const t0 = performance.now();
    const mouse = { x: 0, y: 0, px: 0, py: 0 };
    let mouseTimer = null;
    let active = true;

    (function loop() {
      requestAnimationFrame(loop);
      if (!active) return;
      const elapsed = (performance.now() - t0) / 1000;
      fluidMat.uniforms.uFluidTex.value = rtA.texture;
      fluidMat.uniforms.iMouse.value.set(
        mouse.x * SW / W, (1 - mouse.y / H) * SH,
        mouse.px * SW / W, (1 - mouse.py / H) * SH
      );
      renderer.setRenderTarget(rtB);
      renderer.render(fluidScene, cam);
      const tmp = rtA; rtA = rtB; rtB = tmp;
      displayMat.uniforms.u_time.value = elapsed;
      displayMat.uniforms.u_fluid.value = rtA.texture;
      renderer.setRenderTarget(null);
      renderer.render(displayScene, cam);
    }());

    window.addEventListener('pointermove', e => {
      mouse.px = mouse.x; mouse.py = mouse.y;
      mouse.x = e.clientX; mouse.y = e.clientY;
      clearTimeout(mouseTimer);
      mouseTimer = setTimeout(() => { mouse.x = mouse.y = mouse.px = mouse.py = 0; }, 100);
    });

    window.addEventListener('resize', () => {
      W = innerWidth; H = innerHeight;
      renderer.setSize(W, H);
      displayMat.uniforms.u_resolution.value.set(W, H);
      SW = Math.floor(W * 0.5); SH = Math.floor(H * 0.5);
      rtA.setSize(SW, SH); rtB.setSize(SW, SH);
      fluidMat.uniforms.uResolution.value.set(SW, SH);
    });

    window.setFluidActive = v => { active = v; };
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
}());
