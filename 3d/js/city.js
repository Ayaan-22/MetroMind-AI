/* MetroMind 3D — procedural urban diorama. No remote textures or models. */
(function (global) {
  'use strict';
  const THREE = global.THREE;
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  class MetroCity {
    constructor(canvas, options = {}) {
      if (!THREE) throw new Error('The 3D engine could not be loaded.');
      this.canvas = canvas; this.options = options; this.tool = 'view'; this.mode = 'dusk'; this.layer = 'base'; this.quality = 'balanced';
      this.editorEnabled = false; this.brushSize = 1; this.gridGuides = false; this.lastPaintWorld = null;
      this.reducedMotion = global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 1.6));
      this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.outputEncoding = THREE.sRGBEncoding; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
      this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#101b24'); this.scene.fog = new THREE.Fog('#101b24', 65, 135);
      this.camera = new THREE.PerspectiveCamera(39, 1, .1, 500); this.camera.position.set(27.7, 25.6, 32);
      this.controls = new THREE.OrbitControls(this.camera, canvas); this.controls.enableDamping = true; this.controls.dampingFactor = .075;
      this.controls.minDistance = 9; this.controls.maxDistance = 86; this.controls.maxPolarAngle = Math.PI * .47; this.controls.target.set(0, -3, 0);
      this.controls.screenSpacePanning = true; this.controls.enablePan = true; this.controls.autoRotateSpeed = .32;
      this.cameraPreset='isometric';this.cameraFraming='explore';this.cameraTouched=false;
      this.controls.addEventListener('start', () => { this.cameraTween = null;this.cameraTouched=true; });
      this.scene.add(this.hemi = new THREE.HemisphereLight(0xb9daef, 0x252319, .9));
      this.scene.add(this.sun = new THREE.DirectionalLight(0xffdbb0, 2.5)); this.sun.position.set(-18, 32, 16); this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(1024, 1024); Object.assign(this.sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: .5, far: 85 });
      this.sun.shadow.bias = -.0002; this.sun.shadow.normalBias = .025; this.sun.shadow.radius = 3;
      this.scene.add(this.rim = new THREE.DirectionalLight(0xa6d8ee, .65)); this.rim.position.set(20, 18, -25);
      this.clock = new THREE.Clock(); this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2();
      this.pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.1); this.pickPoint = new THREE.Vector3(); this.tmp = new THREE.Object3D();
      this.box = new THREE.BoxGeometry(1, 1, 1); this.plane = new THREE.PlaneGeometry(1, 1); this.crownGeo = new THREE.IcosahedronGeometry(1, 1); this.cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
      this.materials = this.makeMaterials(); this.world = new THREE.Group(); this.scene.add(this.world);
      this.overlay = new THREE.Group(); this.scene.add(this.overlay); this.route = new THREE.Group(); this.scene.add(this.route);
      this.markers = new THREE.Group(); this.scene.add(this.markers);
      this.landscapeEnabled = true; this.particlesEnabled = true; this.ensureEffects();
      this.hover = new THREE.Mesh(new THREE.BoxGeometry(1, .045, 1), new THREE.MeshBasicMaterial({ color: 0xc4fff0, transparent: true, opacity: .48, depthWrite: false })); this.hover.visible = false; this.scene.add(this.hover);
      this.selection = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(.97, .1, .97)), new THREE.LineBasicMaterial({ color: 0x94f9d6, transparent: true, opacity: .9 })); this.selection.visible = false; this.scene.add(this.selection);
      this.events = []; this.bindPointer();
      this.lastTime = 0; this.fps = 60; this.frameCount = 0; this.fpsTime = 0; this.alive = true;
      const render = time => { if (!this.alive) return; this.animationFrame = requestAnimationFrame(render); this.animate(time); }; this.animationFrame = requestAnimationFrame(render);
      this.resize(canvas.clientWidth || 800, canvas.clientHeight || 700);
    }
    makeMaterials() {
      const texture = document.createElement('canvas'); texture.width = 128; texture.height = 512; const ctx = texture.getContext('2d');
      ctx.fillStyle = '#546871'; ctx.fillRect(0, 0, 128, 512);
      for (let row = 0; row < 30; row++) for (let col = 0; col < 6; col++) {
        const n = hash(row * 31 + col * 47); ctx.fillStyle = n > .64 ? (n > .88 ? '#ffe4ac' : '#98a9a8') : (n > .3 ? '#38505b' : '#1d2d37');
        ctx.fillRect(col * 21 + 4, row * 17 + 4, 12, 10); ctx.fillStyle = '#152630'; ctx.fillRect(col * 21 + 9, row * 17 + 4, 1, 10);
      }
      const map = new THREE.CanvasTexture(texture); map.anisotropy = 4; map.encoding=THREE.sRGBEncoding;
      const lit = document.createElement('canvas'); lit.width = 128; lit.height = 512; const l = lit.getContext('2d'); l.fillStyle = '#000'; l.fillRect(0, 0, 128, 512);
      for (let row = 0; row < 30; row++) for (let col = 0; col < 6; col++) if (hash(row * 31 + col * 47) > .64) { l.fillStyle = hash(row * 17 + col) > .5 ? '#ffe1a4' : '#c4e1e2'; l.fillRect(col * 21 + 4, row * 17 + 4, 12, 10); }
      const emissiveMap = new THREE.CanvasTexture(lit);emissiveMap.encoding=THREE.sRGBEncoding;
      map.wrapT = THREE.RepeatWrapping; emissiveMap.wrapT = THREE.RepeatWrapping;
      const facade = [0xbed0ce, 0x839da5, 0xadc2cd, 0xc7b8a7, 0x798f99].map(color => {
        const material = new THREE.MeshStandardMaterial({ color, map, emissiveMap, emissive: 0xffdeb3, emissiveIntensity: .35, roughness: .57, metalness: .24 });
        material.color.convertSRGBToLinear();
        material.userData.facade = true;
        material.onBeforeCompile = shader => {
          shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float instanceUvScale;');
          shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_UV\nvUv.y *= instanceUvScale;\n#endif');
        };
        material.customProgramCacheKey = () => 'metro-city-facade-uv-v1'; return material;
      });
      // r128 does not color-manage hex albedos automatically. Linearizing them
      // prevents slate asphalt from becoming ice-white under sRGB output.
      const standard = (color, roughness = .8, metalness = 0) => new THREE.MeshStandardMaterial({ color:new THREE.Color(color).convertSRGBToLinear(), roughness, metalness });
      return { facade, road: standard(0x384550), roadAlt: standard(0x3c4b55), highway: standard(0x324d54), traffic: standard(0x5a4939), mud: standard(0x706249), pavement: standard(0x738080), roof: standard(0x465961, .65), roofDark: standard(0x34464e), glass: standard(0x1d3e4a, .28, .6), ground: standard(0x203039), edge: standard(0x283a43), rail: standard(0x93a4a8,.45,.5), grass: standard(0x385b4b), trunk: standard(0x5d5140), leaves: standard(0x3e6c54), leaves2: standard(0x587b5a), water: new THREE.MeshStandardMaterial({ color: 0x244e58, roughness: .23, metalness: .4 }), line: new THREE.MeshBasicMaterial({ color: 0xd9dcc8, transparent: true, opacity: .5 }), orange: standard(0xeb9252), light: new THREE.MeshStandardMaterial({ color: 0xffedc6, emissive: 0xffd99f, emissiveIntensity: 1.2 }), vent: standard(0x819497,.6,.35), car: standard(0xffffff,.4,.25), carGlass: standard(0x182e39,.17,.5) };
    }
    batch(geometry, material, transforms, colors) {
      if (!transforms.length) return null;
      if (material.userData.facade) { geometry = geometry.clone(); geometry.setAttribute('instanceUvScale', new THREE.InstancedBufferAttribute(new Float32Array(transforms.map(v => v[4] / 6)), 1)); }
      const mesh = new THREE.InstancedMesh(geometry, material, transforms.length); if (material.userData.facade) mesh.userData.ownedGeometry = true;
      transforms.forEach((v, i) => { this.tmp.position.set(v[0], v[1], v[2]); this.tmp.scale.set(v[3], v[4], v[5]); this.tmp.rotation.set(v[7] || 0, v[6] || 0, v[8] || 0); this.tmp.updateMatrix(); mesh.setMatrixAt(i, this.tmp.matrix); if (colors) mesh.setColorAt(i, new THREE.Color(colors[i])); });
      mesh.castShadow = geometry !== this.plane; mesh.receiveShadow = true; mesh.instanceMatrix.needsUpdate = true;
      if (transforms[0][9] != null && this.pickMeshes) { mesh.userData.cellIndices = transforms.map(v => v[9]); this.pickMeshes.push(mesh); }
      return mesh;
    }
    clear(group) { while (group.children.length) { const child = group.children[0]; group.remove(child); child.traverse(node => { if (node.isInstancedMesh) node.dispose(); if (node.userData.ownedGeometry && node.geometry) node.geometry.dispose(); if (node.userData.ownedMaterial && node.material) { if (node.material.map) node.material.map.dispose(); node.material.dispose(); } }); } }
    ensureEffects() {
      if(!this.landscape){this.landscape=new THREE.Group();this.landscape.name='Q-value landscape';this.scene.add(this.landscape);}
      if(!this.particles){this.particles=new THREE.Group();this.particles.name='District lights';this.scene.add(this.particles);}
      if(this.landscapeEnabled==null)this.landscapeEnabled=true;if(this.particlesEnabled==null)this.particlesEnabled=true;
      this.landscape.visible=this.landscapeEnabled;this.particles.visible=this.particlesEnabled;
    }
    makeLandscape() {
      this.ensureEffects();this.clear(this.landscape);this.landscapeMesh=null;
      const count=(this.size||0)**2;this.landscapeHeights=new Float32Array(count);this.landscapeTargets=new Float32Array(count);this.landscapeActive=new Set();
      if(!count)return;
      const material=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.52,depthWrite:false,fog:false,toneMapped:false});
      const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material,count);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.renderOrder=6;
      mesh.userData.ownedGeometry=mesh.userData.ownedMaterial=true;this.landscapeMesh=mesh;this.landscape.add(mesh);
      for(let i=0;i<count;i++){this.tmp.position.set(0,-5,0);this.tmp.scale.set(0,0,0);this.tmp.rotation.set(0,0,0);this.tmp.updateMatrix();mesh.setMatrixAt(i,this.tmp.matrix);mesh.setColorAt(i,new THREE.Color(0x73d9bc));}
      mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;
      if(this.learningValues&&this.learningVisits)this.setLearningValues(this.learningValues,this.learningVisits);
    }
    setLandscape(enabled) {this.landscapeEnabled=Boolean(enabled);this.ensureEffects();if(this.landscapeEnabled&&!this.landscapeMesh&&this.size)this.makeLandscape();if(this.landscapeEnabled)this.updateLandscape(0,this.reducedMotion);}
    setLearningValues(values,visits) {
      this.ensureEffects();const count=(this.size||0)**2;
      // Copy each update: the learner mutates its typed arrays in place.
      this.learningValues=values?Float32Array.from({length:count},(_,i)=>Number(values[i])):null;
      this.learningVisits=visits?Float32Array.from({length:count},(_,i)=>Number(visits[i])):null;
      if(!this.landscapeMesh&&count){this.makeLandscape();return;}
      if(!this.landscapeMesh)return;
      const color=new THREE.Color();
      for(let i=0;i<count;i++){
        const value=this.learningValues?.[i],seen=this.learningVisits?.[i];
        const active=Number.isFinite(value)&&Number.isFinite(seen)&&seen>0&&this.isDeveloped(i)&&this.terrain[i]!==1;
        // Height encodes |best Q| with a fixed, bounded log scale. Hue preserves
        // its sign: negative values are blue/violet, positive values are mint.
        const magnitude=active?Math.min(4.3,Math.log1p(Math.abs(value))*.72):0;
        this.landscapeTargets[i]=active?.1+magnitude:0;
        if(active){color.setHSL(value<0?.62+Math.min(1,magnitude/4.3)*.12:.43,.64,.54);this.landscapeMesh.setColorAt(i,color);}
        if(active||this.landscapeHeights[i]>0)this.landscapeActive.add(i);
      }
      this.landscapeMesh.instanceColor.needsUpdate=true;
      this.updateLandscape(0,!values||!visits||this.reducedMotion);
    }
    updateLandscape(dt,snap=false) {
      if(!this.landscapeMesh||(!this.landscapeEnabled&&!snap))return;
      const amount=snap||this.reducedMotion?1:1-Math.exp(-Math.max(0,dt)*7);let changed=false;
      for(const i of this.landscapeActive){
        const target=this.landscapeTargets[i],before=this.landscapeHeights[i];let height=before+(target-before)*amount;
        if(Math.abs(target-height)<.002)height=target;
        this.landscapeHeights[i]=height;
        if(height===before&&dt>0&&!snap)continue;
        const p=this.point(i,.065);this.tmp.position.set(p.x,height>0?p.y+height*.5:-5,p.z);this.tmp.scale.set(height>0?.52:0,height,height>0?.52:0);this.tmp.rotation.set(0,0,0);this.tmp.updateMatrix();this.landscapeMesh.setMatrixAt(i,this.tmp.matrix);changed=true;
        if(height===0&&target===0)this.landscapeActive.delete(i);
      }
      if(changed)this.landscapeMesh.instanceMatrix.needsUpdate=true;
    }
    makeParticles() {
      this.ensureEffects();this.clear(this.particles);this.particleMesh=null;this.particleStates=[];this.particleTime=0;
      if(!this.size)return;
      const count=({high:100,balanced:70,low:36})[this.quality]||70,n=this.size,ox=this.originX??-n/2,oz=this.originZ??-n/2,seed=Number(this.grid?.seed)||0;
      const positions=new Float32Array(count*3),colors=new Float32Array(count*3),palette=[0x8df2c4,0x75cfff,0xe8bd78,0xbca0ed],color=new THREE.Color();let roof=1;
      for(let i=0;i<n*n;i++)if(this.isDeveloped(i))roof=Math.max(roof,this.level(i)+(this.buildingHeights?.[i]||0));
      for(let i=0;i<count;i++){
        const key=seed*.013+i*17;this.particleStates.push({x:ox+.25+hash(key+1)*(n-.5),z:oz+.25+hash(key+3)*(n-.5),y:roof+1.2+hash(key+7)*3.5,phase:hash(key+11)*Math.PI*2,speed:.18+hash(key+19)*.22});
        color.setHex(palette[i%palette.length]);colors.set([color.r,color.g,color.b],i*3);
      }
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
      const material=new THREE.PointsMaterial({size:.42,vertexColors:true,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false,fog:false,toneMapped:false});
      material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_particle_fragment>','#include <map_particle_fragment>\nfloat lightRadius=length(gl_PointCoord-vec2(0.5))*2.0;\nif(lightRadius>1.0)discard;\ndiffuseColor.a*=pow(1.0-lightRadius,1.7);');};
      material.customProgramCacheKey=()=> 'metro-district-lights-v1';
      const mesh=new THREE.Points(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=4;mesh.userData.ownedGeometry=mesh.userData.ownedMaterial=true;this.particleMesh=mesh;this.particles.add(mesh);this.updateParticles(0,true);
    }
    setParticles(enabled) {this.particlesEnabled=Boolean(enabled);this.ensureEffects();if(this.particlesEnabled&&!this.particleMesh&&this.size)this.makeParticles();}
    updateParticles(dt,force=false) {
      if(!this.particleMesh||(!this.particlesEnabled&&!force))return;
      if(!this.reducedMotion)this.particleTime=(this.particleTime||0)+Math.max(0,dt);
      const time=this.particleTime||0,n=this.size,ox=this.originX??-n/2,oz=this.originZ??-n/2,positions=this.particleMesh.geometry.attributes.position;
      this.particleStates.forEach((p,i)=>{const phase=p.phase+time*p.speed;positions.setXYZ(i,Math.max(ox+.1,Math.min(ox+n-.1,p.x+Math.sin(phase)*.65)),p.y+Math.sin(phase*.7)*.35,Math.max(oz+.1,Math.min(oz+n-.1,p.z+Math.cos(phase*.83)*.65)));});positions.needsUpdate=true;
    }
    setGrid(grid) {
      if(this.pendingRebuild){clearTimeout(this.pendingRebuild);this.pendingRebuild=null;}
      const previousGrid=this.grid,previousSize=this.size,previousOriginX=this.originX,previousOriginZ=this.originZ;
      this.grid = grid; this.size = grid.size || grid.N || 30; this.terrain = grid.terrain || grid.T; this.elevation = grid.elevation || grid.E || new Float32Array(this.size * this.size);this.framingPoints=null;
      this.originX=Number.isFinite(grid.originX)?grid.originX:-this.size/2;this.originZ=Number.isFinite(grid.originZ)?grid.originZ:-this.size/2;
      this.freeBuild=Boolean(grid.freeBuild);this.developed=grid.developed;
      if(previousGrid!==grid||previousSize!==this.size||previousOriginX!==this.originX||previousOriginZ!==this.originZ){this.learningValues=null;this.learningVisits=null;}
      this.clear(this.world); this.clear(this.overlay); this.clear(this.route); this.path = null; this.visited=[];this.frontier=[]; this.pickMeshes=[]; this.buildingHeights=new Float32Array(this.size*this.size);
      this.routeAgent=this.routeHalo=null;this.routePoints=[];this.routeLengths=[];this.routeDistance=0;
      const n = this.size, half = n / 2, centerX=this.originX+half,centerZ=this.originZ+half,m = this.materials;
      if(!this.freeBuild){
        const base = new THREE.Mesh(new THREE.BoxGeometry(n + 1.7, .75, n + 1.7), m.edge); base.position.set(centerX,-.4,centerZ); base.receiveShadow = true; base.castShadow = true; base.userData.ownedGeometry = true; this.world.add(base);
        const bevel = new THREE.Mesh(new THREE.BoxGeometry(n + 1.9, .1, n + 1.9), m.rail); bevel.position.set(centerX,-.75,centerZ); bevel.userData.ownedGeometry = true; this.world.add(bevel);
      }
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color:new THREE.Color(this.freeBuild?0x142127:0x101b23).convertSRGBToLinear(),toneMapped:false })); ground.rotation.x = -Math.PI / 2; ground.position.set(centerX,this.freeBuild?-.035:-1.5,centerZ); ground.receiveShadow=true; ground.userData.ownedGeometry = true; ground.userData.ownedMaterial = true; this.world.add(ground);
      const gridLines = new THREE.GridHelper(this.freeBuild?400:160,this.freeBuild?400:80,0x263b43,0x20323a); gridLines.position.set(this.freeBuild?Math.round(centerX)+this.originX%1:centerX,this.freeBuild?-.012:-1.48,this.freeBuild?Math.round(centerZ)+this.originZ%1:centerZ); gridLines.material.transparent = true; gridLines.material.opacity = .2; gridLines.userData.ownedGeometry = true; gridLines.userData.ownedMaterial = true; gridLines.visible=!this.freeBuild||this.gridGuides; this.gridLines=gridLines;this.world.add(gridLines);
      this.pickPlane.constant=this.freeBuild?0:-.1;
      const boxes = Array.from({ length: 5 }, () => []), roads = Array.from({ length: 5 }, () => []), podiums = [], roofs = [], vents = [], ledges = [], glass = [], trunks = [], leaves = [], leaves2 = [], grasses = [], marks = [], poles = [], lamps = [], rails = [], cones = [];
      for (let i = 0; i < n * n; i++) {
        if(!this.isDeveloped(i))continue;
        const x = this.originX+i%n+.5, z = this.originZ+Math.floor(i/n)+.5,type = this.terrain[i], y = this.level(i), seed=Math.round(x*127+z*373),h = hash(seed * 13 + 10);
        if (type === 1) {
          podiums.push([x, y + .065, z, .99, .13, .99, 0, 0, 0, i]);
          const park = this.grid.preset!=='freebuild'&&hash(Math.floor(x / 3) * 109 + Math.floor(z / 3) * 47 + 931) > .93;
          if (park) {
            grasses.push([x, y + .14, z, .83, .045, .83]);
            for (let k = 0; k < 2; k++) { const tx = x + (k ? .2 : -.19), tz = z + (hash(seed + k * 9) - .5) * .45, th = .38 + hash(seed + k) * .2; trunks.push([tx, y + .2 + th / 2, tz, .045, th, .045]); leaves.push([tx, y + .3 + th, tz, .25, .32, .25]); leaves2.push([tx - .07, y + .35 + th, tz + .05, .2, .22, .2]); }
          } else {
            const center = Math.max(0, 1 - Math.hypot(x + 2, z) / (30 * .55)); const height = .85 + h * 1.7 + Math.pow(center, 1.6) * (1.3 + hash(seed + 69) * 3.1);
            const width = .82 + hash(seed + 51) * .12, depth = .82 + hash(seed + 21) * .12, facade = Math.floor(hash(seed + 7) * 5);
            this.buildingHeights[i]=height+.19;boxes[facade].push([x, y + .13 + height / 2, z, width, height, depth, 0, 0, 0, i]);
            roofs.push([x, y + .15 + height, z, width + .025, .055, depth + .025, 0, 0, 0, i]);
            if (h > .55) vents.push([x + .08, y + height + .21, z + .06, .17 + h * .07, .1, .2]);
            if (h > .82) { const tierH = height * .18; this.buildingHeights[i]+=tierH;boxes[facade].push([x, y + .15 + height + tierH / 2, z, width * .76, tierH, depth * .77, 0, 0, 0, i]); roofs.push([x, y + .17 + height + tierH, z, width * .79, .04, depth * .8, 0, 0, 0, i]); }
            if (h > .89) { poles.push([x, y + height + .65, z, .018, 1, .018]); lamps.push([x, y + height + 1.15, z, .045, .045, .045]); }
            if (h < .35) glass.push([x + width * .505, y + .13 + height * .5, z, .013, height * .8, depth * .7]);
            if (height > 3) for (let k = 1; k < Math.floor(height); k++) ledges.push([x, y + .14 + k, z, width + .03, .025, depth + .03]);
          }
        } else {
          roads[type < 5 ? type : 0].push([x, y + .015, z, 1.002, .03, 1.002, 0, 0, 0, i]);
          const r = Math.floor(i / n), c = i % n,markRow=Math.floor(z),markCol=Math.floor(x);
          const horizontal = (c && this.terrain[i - 1] !== 1) && (c < n - 1 && this.terrain[i + 1] !== 1);
          const vertical = (r && this.terrain[i - n] !== 1) && (r < n - 1 && this.terrain[i + n] !== 1);
          if (type !== 4 && (horizontal || vertical)) {
            if (horizontal && (!vertical || markRow % 5 === 0)) marks.push([x, y + .038, z, .35, .008, .018]);
            if (vertical && (!horizontal || markCol % 5 === 0)) marks.push([x, y + .039, z, .018, .008, .35]);
            if (horizontal && vertical && markRow % 5 === 0 && markCol % 5 === 0) for (let k = 0; k < 5; k++) { marks.push([x - .32 + k * .16, y + .04, z + .36, .085, .01, .17]); marks.push([x + .36, y + .04, z - .32 + k * .16, .17, .01, .085]); }
          }
          if (type === 3 && hash(seed + 29) > .7) { cones.push([x + .3, y + .09, z + .3, .07, .18, .07]); marks.push([x + .3, y + .12, z + .3, .075, .02, .075]); }
          if (type === 2 && horizontal) { marks.push([x, y + .04, z + .38, 1, .008, .018]); marks.push([x, y + .04, z - .38, 1, .008, .018]); }
          if ((seed * 7) % 23 === 0 && type !== 4 && (horizontal || vertical)) { const ox = horizontal ? .36 : -.37, oz = horizontal ? -.37 : .34; poles.push([x + ox, y + .52, z + oz, .018, 1.02, .018]); rails.push([x + ox + .09, y + 1.03, z + oz, .2, .028, .028]); lamps.push([x + ox + .18, y + 1.012, z + oz, .11, .025, .07]); }
        }
      }
      boxes.forEach((v, i) => { const mesh = this.batch(this.box, m.facade[i], v); if (mesh) this.world.add(mesh); });
      roads.forEach((v, i) => { const mesh = this.batch(this.box, [m.road, m.road, m.highway, m.traffic, m.mud][i], v); if (mesh) this.world.add(mesh); });
      [[podiums,m.pavement],[roofs,m.roof],[vents,m.vent],[ledges,m.roofDark],[glass,m.glass],[grasses,m.grass],[trunks,m.trunk],[leaves,m.leaves],[leaves2,m.leaves2],[marks,m.line],[poles,m.roofDark],[lamps,m.light],[rails,m.rail],[cones,m.orange]].forEach(([v,mat]) => { const geo = v === leaves || v === leaves2 ? this.crownGeo : this.box, mesh = this.batch(geo,mat,v); if (mesh) this.world.add(mesh); });
      // A slim architectural plinth keeps the model readable from every camera angle.
      if(!this.freeBuild){const trim = new THREE.Mesh(new THREE.BoxGeometry(n + 1.8, .028, .028), new THREE.MeshBasicMaterial({ color:0x78b7aa, transparent:true, opacity:.65 })); trim.position.set(centerX,-.39,centerZ+half+.87); trim.userData.ownedGeometry=true; trim.userData.ownedMaterial=true; this.world.add(trim);}
      const markerKey=[this.size,grid.start,grid.goal].join(':');
      if(this.markerKey!==markerKey){this.makeMarkers();this.markerKey=markerKey;}
      else this.markers.children.forEach(marker=>marker.position.copy(this.point(marker.userData.cellIndex,.1)));
      if(previousGrid!==grid)this.carStates=[];
      else if(previousSize!==n||previousOriginX!==this.originX||previousOriginZ!==this.originZ)this.remapTrafficStates(previousSize,previousOriginX,previousOriginZ);
      this.makeTraffic(); this.setTraffic(this.trafficVisible); this.makeOverlay(); this.setLayer(this.layer, this.layerData); this.setMode(this.mode); this.lastRebuild=performance.now();
      this.makeLandscape();this.makeParticles();
      this.controls.minDistance=this.freeBuild?2:Math.max(2,n*.12);this.controls.maxDistance=Math.max(150,n*12);this.camera.far=Math.max(500,n*20);this.camera.updateProjectionMatrix();if(previousSize!==n&&!this.cameraTouched&&!this.editorEnabled)this.fitCamera(this.cameraPreset,false);
    }
    isDeveloped(i) {return i>=0&&i<this.size*this.size&&(!this.freeBuild||!this.developed||this.developed[i]===1);}
    level(i) { return Number(this.elevation && this.elevation[i] || 0) * .22; }
    point(i, lift = .12) { return new THREE.Vector3((this.originX??-this.size/2)+i%this.size+.5,this.level(i)+lift,(this.originZ??-this.size/2)+Math.floor(i/this.size)+.5); }
    updateCells() {
      if(!this.grid||this.pendingRebuild)return;
      // A paint stroke can emit hundreds of pointer events. Coalesce those edits
      // while retaining the camera and the latest search state at commit time.
      const delay=Math.max(24,90-(performance.now()-(this.lastRebuild||0)));
      this.pendingRebuild=setTimeout(()=>{this.pendingRebuild=null;if(!this.alive||!this.grid)return;const visited=this.visited,frontier=this.frontier,path=this.path;this.setGrid(this.grid);this.setSearch(visited,frontier,path);},delay);
    }
    makeMarkers() {
      this.clear(this.markers); const g = this.grid;
      [['ORIGIN',g.start,0x74dcb6],['DESTINATION',g.goal,0xc399b6]].forEach(([name,index,color]) => {
        if (index == null) return; const p=this.point(index,.1), group=new THREE.Group(); group.position.copy(p);group.userData.cellIndex=index;
        const ring=new THREE.Mesh(new THREE.TorusGeometry(.29,.036,6,40),new THREE.MeshBasicMaterial({color}));ring.rotation.x=Math.PI/2;ring.userData.ownedGeometry=true;ring.userData.ownedMaterial=true;group.add(ring);
        const stem=new THREE.Mesh(new THREE.CylinderGeometry(.013,.013,1.35,8),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.75}));stem.position.y=.68;stem.userData.ownedGeometry=true;stem.userData.ownedMaterial=true;group.add(stem);
        const dot=new THREE.Mesh(new THREE.SphereGeometry(.085,12,8),new THREE.MeshBasicMaterial({color}));dot.position.y=1.38;dot.userData.ownedGeometry=true;dot.userData.ownedMaterial=true;group.add(dot);
        const c=document.createElement('canvas');c.width=512;c.height=100;const x=c.getContext('2d');x.fillStyle='#102323';x.beginPath();x.roundRect?x.roundRect(4,4,504,90,20):x.rect(4,4,504,90);x.fill();x.strokeStyle='#719a87';x.lineWidth=2;x.stroke();x.fillStyle='#'+new THREE.Color(color).getHexString();x.beginPath();x.arc(36,49,8,0,Math.PI*2);x.fill();x.font='600 42px Arial,sans-serif';x.fillStyle='#f0fff5';x.textAlign='center';x.fillText(name,273,64);
        const labelMap=new THREE.CanvasTexture(c);labelMap.encoding=THREE.sRGBEncoding;const label=new THREE.Sprite(new THREE.SpriteMaterial({map:labelMap,depthTest:false,transparent:true,sizeAttenuation:false,toneMapped:false}));label.scale.set(.135,.026,1);label.position.y=2.2;label.userData.ownedMaterial=true;group.add(label);group.userData.ring=ring;this.markers.add(group);
      });
      this.scaleMarkerLabels();
    }
    scaleMarkerLabels(){
      // Non-attenuating sprites still scale with viewport height in Three.js.
      // Compensate in CSS pixels so endpoint names stay at 110 × 22 px even
      // when the map grows from an embedded canvas to a full-height stage.
      const scale=2*Math.tan(THREE.MathUtils.degToRad(this.camera.fov*.5))/Math.max(1,this.height||600);
      this.markers.children.forEach(marker=>marker.children.forEach(child=>{if(child.isSprite)child.scale.set(110*scale,22*scale,1);}));
    }
    makeOverlay() {
      const count=this.size*this.size;this.searchMesh=new THREE.InstancedMesh(this.box,new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.48,depthWrite:false}),count);this.searchMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.searchMesh.renderOrder=2;this.searchMesh.userData.ownedMaterial=true;
      for(let i=0;i<count;i++){this.tmp.position.set(0,-4,0);this.tmp.scale.set(0,0,0);this.tmp.rotation.set(0,0,0);this.tmp.updateMatrix();this.searchMesh.setMatrixAt(i,this.tmp.matrix);this.searchMesh.setColorAt(i,new THREE.Color(0x77d9b5));}this.overlay.add(this.searchMesh);
    }
    indices(input) { if(!input)return new Set();if(input instanceof Set)return input;return new Set(Array.from(input)); }
    setSearch(visited,frontier,path) {this.visited=visited;this.frontier=frontier;this.paintOverlay();if(arguments.length>2)this.setPath(path);}
    paintOverlay() {
      if(!this.searchMesh)return;const v=this.indices(this.visited),f=this.indices(this.frontier),data=this.layerData||{},heat=data.heat||[];const color=new THREE.Color();let lo=Infinity,hi=-Infinity;
      if(this.layer==='policy')for(let i=0;i<heat.length;i++)if(this.terrain[i]!==1&&Number.isFinite(Number(heat[i]))){lo=Math.min(lo,Number(heat[i]));hi=Math.max(hi,Number(heat[i]));}
      for(let i=0;i<this.size*this.size;i++){
        let active=false;let h=.045;color.setHex(0x57bd9b);
        if(this.isDeveloped(i)&&this.terrain[i]!==1){
          if(this.layer==='cost'){active=this.terrain[i]>1;color.setHex([0x576d76,0x576d76,0x4dc4c3,0xf5b369,0xae83d5][this.terrain[i]]||0x576d76);}
          else if(this.layer==='policy'){active=data.showHeat!==false&&heat.length>i&&(data.policy?data.policy[i]>=0:true);const value=(Number(heat[i]||0)-lo)/(hi-lo||1);color.setHSL(.58-Math.max(0,Math.min(1,value))*.24,.55,.42);}
          else if(this.layer==='search'){active=v.has(i)||f.has(i);if(f.has(i)){color.setHex(0xf1bf73);h=.075;}}
        }
        const p=this.point(i,.055);this.tmp.position.set(p.x,active?p.y:-5,p.z);this.tmp.scale.set(.94,h,.94);this.tmp.rotation.set(0,0,0);this.tmp.updateMatrix();this.searchMesh.setMatrixAt(i,this.tmp.matrix);this.searchMesh.setColorAt(i,color);
      }this.searchMesh.instanceMatrix.needsUpdate=true;this.searchMesh.instanceColor.needsUpdate=true;
      this.renderPolicy();
    }
    renderPolicy(){
      if(this.policyMesh){this.overlay.remove(this.policyMesh);this.policyMesh.geometry.dispose();this.policyMesh.material.dispose();this.policyMesh=null;}
      const policy=this.layerData&&this.layerData.policy;if(this.layer!=='policy'||!policy)return;const geo=new THREE.ConeGeometry(.12,.3,3);geo.rotateX(Math.PI/2);const trans=[];
      for(let i=0;i<policy.length;i++){const a=policy[i];if(!this.isDeveloped(i)||this.terrain[i]===1||a==null||a<0)continue;const p=this.point(i,.16);const angle=[Math.PI,Math.PI/2,0,-Math.PI/2,-3*Math.PI/4,3*Math.PI/4,Math.PI/4,-Math.PI/4][a]||0;trans.push([p.x,p.y,p.z,1,1,1,angle]);}this.policyMesh=this.batch(geo,new THREE.MeshBasicMaterial({color:0xd7fff0,transparent:true,opacity:.78}),trans);if(this.policyMesh){this.policyMesh.userData.ownedGeometry=true;this.policyMesh.userData.ownedMaterial=true;this.overlay.add(this.policyMesh);}
    }
    setLayer(layer,data){this.layer=layer;this.layerData=data||this.layerData;this.paintOverlay();}
    setPath(path){
      if(path&&this.path&&path.length===this.path.length&&this.path.every((v,i)=>v===path[i]))return;
      this.clear(this.route);this.routeAgent=this.routeHalo=null;this.routePoints=[];this.routeLengths=[];this.routeDistance=0;this.routeTime=0;this.path=path&&path.length>1?Array.from(path):null;this.routeCurve=null;if(!this.path)return;
      const points=[];for(let k=0;k<this.path.length;k++){const p=this.point(this.path[k],.19);if(!k||p.distanceTo(points[points.length-1])>.01)points.push(p);}if(points.length<2)return;
      // Linear segments follow the searched cells exactly, so curves never cut a blocked corner.
      const routeMaterial=(color,opacity=1)=>new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthTest:false,depthWrite:false,fog:false,toneMapped:false});
      // Instanced cylinders give real thickness on WebGL implementations where
      // LineBasicMaterial.linewidth is limited to one pixel. Both route passes
      // are transparent so all city/landscape geometry is drawn before them.
      const segments=points.length-1,casing=new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,1,8),routeMaterial(0x135e49,.62),segments),core=new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,1,8),routeMaterial(0x94f5c7),segments);
      [casing,core].forEach((mesh,k)=>{mesh.renderOrder=1000+k;mesh.frustumCulled=false;mesh.userData.ownedGeometry=mesh.userData.ownedMaterial=true;});
      const transform=new THREE.Object3D(),up=new THREE.Vector3(0,1,0);
      for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],delta=b.clone().sub(a),length=delta.length();transform.position.copy(a).add(b).multiplyScalar(.5);transform.quaternion.setFromUnitVectors(up,delta.normalize());for(const [mesh,radius]of[[casing,.115],[core,.067]]){transform.scale.set(radius,length,radius);transform.updateMatrix();mesh.setMatrixAt(i-1,transform.matrix);}}
      casing.instanceMatrix.needsUpdate=core.instanceMatrix.needsUpdate=true;this.route.add(casing,core);
      const lineGeometry=new THREE.BufferGeometry().setFromPoints(points),glow=new THREE.Line(lineGeometry,new THREE.LineBasicMaterial({color:0xc5ffe3,transparent:true,opacity:.95,depthTest:false,depthWrite:false,fog:false,toneMapped:false}));glow.renderOrder=1002;glow.userData.ownedGeometry=glow.userData.ownedMaterial=true;this.route.add(glow);
      this.routePoints=points;this.routeLengths=[0];for(let i=1;i<points.length;i++)this.routeLengths.push(this.routeLengths[i-1]+points[i].distanceTo(points[i-1]));this.routeDistance=this.routeLengths[this.routeLengths.length-1];
      this.routeAgent=new THREE.Mesh(new THREE.SphereGeometry(.19,16,10),routeMaterial(0xf1fff5));this.routeAgent.renderOrder=1011;this.routeAgent.position.copy(points[0]);this.routeAgent.position.y+=.035;this.routeAgent.userData.ownedGeometry=this.routeAgent.userData.ownedMaterial=true;
      this.routeHalo=new THREE.Mesh(new THREE.SphereGeometry(.32,16,10),routeMaterial(0x8af9c7,.22));this.routeHalo.renderOrder=1010;this.routeHalo.userData.ownedGeometry=this.routeHalo.userData.ownedMaterial=true;this.routeAgent.add(this.routeHalo);this.route.add(this.routeAgent);
    }
    remapTrafficStates(oldSize,oldOriginX,oldOriginZ) {
      const remap=index=>{
        const x=oldOriginX+index%oldSize+.5,z=oldOriginZ+Math.floor(index/oldSize)+.5,col=Math.round(x-this.originX-.5),row=Math.round(z-this.originZ-.5);
        return row>=0&&col>=0&&row<this.size&&col<this.size?row*this.size+col:-1;
      };
      for(const state of this.carStates||[])for(const key of ['prev','cell','next'])state[key]=remap(state[key]);
    }
    trafficRoad(index) {
      return Number.isInteger(index)&&this.isDeveloped(index)&&[0,2,3].includes(this.terrain[index]);
    }
    trafficNeighbors(index) {
      if(!this.trafficRoad(index))return [];
      const n=this.size,row=Math.floor(index/n),col=index%n,result=[];
      for(const other of [row?index-n:-1,col<n-1?index+1:-1,row<n-1?index+n:-1,col?index-1:-1])
        if(this.trafficRoad(other)&&Math.abs(this.level(other)-this.level(index))<1e-6)result.push(other);
      return result;
    }
    trafficTurnNext(prev,cell) {
      const neighbors=this.trafficNeighbors(cell),dx=cell%this.size-prev%this.size,dz=Math.floor(cell/this.size)-Math.floor(prev/this.size);
      // One consistent rotational order pairs lane entries and exits without
      // crossing movements. Directed edges therefore form closed block circuits.
      for(const [x,z]of[[dz,-dx],[dx,dz],[-dz,dx],[-dx,-dz]]){
        const found=neighbors.find(index=>index%this.size-cell%this.size===x&&Math.floor(index/this.size)-Math.floor(cell/this.size)===z);
        if(found!==undefined)return found;
      }
      return -1;
    }
    chooseTrafficNext(prev,cell,seed,turns) {
      return this.trafficCircuitByEdge?.get(prev+':'+cell)?.next??this.trafficTurnNext(prev,cell);
    }
    buildTrafficCircuits() {
      this.trafficCircuitByEdge=new Map();this.trafficCircuits=[];
      const edges=[];let roads=0;
      for(let cell=0;cell<this.terrain.length;cell++){const neighbors=this.trafficNeighbors(cell);if(neighbors.length)roads++;for(const prev of neighbors)edges.push({prev,cell});}
      const seen=new Set(),all=[];
      for(const edge of edges){
        const first=edge.prev+':'+edge.cell;if(seen.has(first))continue;
        const segments=[];let prev=edge.prev,cell=edge.cell,length=0,area=0,minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
        for(let guard=0;guard<=edges.length;guard++){
          const key=prev+':'+cell;if(seen.has(key))break;seen.add(key);
          const next=this.trafficTurnNext(prev,cell),state=this.makeTrafficState(prev,cell,next);if(!state)break;
          const point=this.point(cell),following=this.point(next);
          segments.push({prev,cell,next,curve:state.curve,length:state.length,start:length});length+=state.length;area+=point.x*following.z-following.x*point.z;
          minX=Math.min(minX,point.x);maxX=Math.max(maxX,point.x);minZ=Math.min(minZ,point.z);maxZ=Math.max(maxZ,point.z);
          prev=cell;cell=next;if(prev+':'+cell===first)break;
        }
        if(!segments.length||prev+':'+cell!==first)continue;
        const circuit={key:first,segments,length,area:Math.abs(area)*.5,extent:Math.max(maxX-minX,maxZ-minZ)};
        circuit.capacity=Math.max(1,Math.min(8,Math.floor(length/3)));
        for(let index=0;index<segments.length;index++)this.trafficCircuitByEdge.set(segments[index].prev+':'+segments[index].cell,{...segments[index],circuit,index});
        all.push(circuit);
      }
      // Ignore tiny loops inside broad paved avenues. Cars circulate around
      // real blocks and district boundaries rather than orbiting a 1-cell square.
      this.trafficCircuits=all.filter(route=>route.area>=3.5||route.length>=8&&route.extent>=3);
      if(!this.trafficCircuits.length&&all.length)this.trafficCircuits=[all.reduce((longest,route)=>route.length>longest.length?route:longest)];
      return roads;
    }
    trafficRoutePosition(state) {
      const segment=this.trafficCircuitByEdge?.get(state.prev+':'+state.cell);
      return segment&&segment.next===state.next?{circuit:segment.circuit,distance:segment.start+state.s}:null;
    }
    trafficFollowingSpace(state) {
      const route=this.trafficRoutePosition(state);if(!route)return Infinity;
      let available=Infinity;
      for(const other of this.carStates){
        if(other===state)continue;const leader=this.trafficRoutePosition(other);
        if(!leader||leader.circuit!==route.circuit)continue;
        const gap=(leader.distance-route.distance+route.circuit.length)%route.circuit.length;
        available=Math.min(available,Math.max(0,gap-.85));
      }
      return available;
    }
    makeTrafficState(prev,cell,next,seed=0,s=0,turns=0) {
      if(!this.trafficNeighbors(cell).includes(prev)||!this.trafficNeighbors(cell).includes(next))return null;
      const center=this.point(cell,.09),before=this.point(prev,.09),after=this.point(next,.09),incoming=center.clone().sub(before).normalize(),outgoing=after.clone().sub(center).normalize(),lane=.22;
      const left=direction=>new THREE.Vector3(direction.z,0,-direction.x).multiplyScalar(lane);
      const entry=center.clone().addScaledVector(incoming,-.5).add(left(incoming)),exit=center.clone().addScaledVector(outgoing,.5).add(left(outgoing));
      let curve;
      if(incoming.dot(outgoing)>.99)curve=new THREE.LineCurve3(entry,exit);
      else if(incoming.dot(outgoing)<-.99)curve=new THREE.CubicBezierCurve3(entry,entry.clone().addScaledVector(incoming,.55),exit.clone().addScaledVector(incoming,.55),exit);
      else curve=new THREE.QuadraticBezierCurve3(entry,center.clone().add(left(incoming)).add(left(outgoing)),exit);
      curve.arcLengthDivisions=48;const length=curve.getLength();
      const state={prev,cell,next,seed,turns,s:Math.max(0,Math.min(length,Number(s)||0)),curve,length};state.pose=this.sampleTrafficState(state);return state;
    }
    sampleTrafficState(state) {
      const u=Math.max(0,Math.min(1,state.s/state.length)),point=state.curve.getPointAt(u),tangent=state.curve.getTangentAt(u),norm=Math.hypot(tangent.x,tangent.z)||1,dx=tangent.x/norm,dz=tangent.z/norm;
      return {x:point.x,y:point.y,z:point.z,dx,dz,angle:Math.atan2(dx,dz)};
    }
    trafficCollision(first,second) {
      if(Math.abs(first.y-second.y)>.18)return false;
      const x=second.x-first.x,z=second.z-first.z;
      if(x*x+z*z>.5*.5)return false;
      // Separating axes for buffered car footprints: opposing lanes can pass,
      // while followers and crossing vehicles retain a small clearance.
      for(const [ax,az]of[[first.dx,first.dz],[first.dz,-first.dx],[second.dx,second.dz],[second.dz,-second.dx]]){
        const radius=pose=>.205*Math.abs(pose.dx*ax+pose.dz*az)+.115*Math.abs(pose.dz*ax-pose.dx*az);
        if(Math.abs(x*ax+z*az)>=radius(first)+radius(second))return false;
      }
      return true;
    }
    advanceTrafficState(state,seconds,maxDistance=Infinity) {
      let remaining=seconds,budget=maxDistance,transitions=0;
      while(remaining>1e-10&&budget>1e-10&&transitions<32){
        const speed=({0:.8,2:1.7,3:.32})[this.terrain[state.cell]]||.8,room=Math.max(0,state.length-state.s),distance=Math.min(room,remaining*speed,budget);
        state.s+=distance;remaining-=distance/speed;budget-=distance;
        if(state.s<state.length-1e-10)break;
        const prev=state.cell,cell=state.next,turns=state.turns+1,next=this.chooseTrafficNext(prev,cell,state.seed,turns),following=this.makeTrafficState(prev,cell,next,state.seed,0,turns);
        if(!following)return false;Object.assign(state,following);transitions++;
      }
      state.pose=this.sampleTrafficState(state);return true;
    }
    makeTraffic(){
      const previous=this.carStates||[],states=[],used=new Set(),seed=Number(this.grid?.seed)||0;
      for(const mesh of [this.carBodies,this.carCabins,this.carLights])if(mesh?.parent){mesh.parent.remove(mesh);mesh.dispose();}
      this.carBodies=this.carCabins=this.carLights=null;
      const roads=this.buildTrafficCircuits(),routes=this.trafficCircuits,capacities=new Map(routes.map(route=>[route,0])),capacity=routes.reduce((sum,route)=>sum+route.capacity,0),count=roads?Math.min(72,Math.max(1,Math.floor(roads/8)),capacity):0;
      for(const old of previous){
        if(states.length>=count)break;if(!Number.isFinite(old.s)||!Number.isFinite(old.seed)||!Number.isFinite(old.turns))continue;
        const restored=this.makeTrafficState(old.prev,old.cell,old.next,old.seed,old.s,old.turns),route=restored&&this.trafficRoutePosition(restored),key=old.prev+':'+old.cell;
        if(!restored||!route||!capacities.has(route.circuit)||states.some(other=>this.trafficCollision(restored.pose,other.pose)))continue;
        Object.assign(old,restored);states.push(old);used.add(key);capacities.set(route.circuit,capacities.get(route.circuit)+1);
      }
      const allocations=new Map(capacities);
      while(Array.from(allocations.values()).reduce((sum,value)=>sum+value,0)<count){
        const candidates=routes.filter(route=>allocations.get(route)<route.capacity);if(!candidates.length)break;
        candidates.sort((a,b)=>(allocations.get(a)+1)/a.length-(allocations.get(b)+1)/b.length||a.key.localeCompare(b.key));const route=candidates[0];allocations.set(route,allocations.get(route)+1);
      }
      for(const route of routes){
        const assigned=allocations.get(route),existing=capacities.get(route);if(assigned<=existing)continue;
        const phase=hash(seed*13+route.segments[0].prev*71+route.segments[0].cell*193)*route.length;
        for(let slot=0,attempts=0;capacities.get(route)<assigned&&attempts<assigned*12;slot++,attempts++){
          const distance=(phase+(slot+.5)*route.length/assigned+(Math.floor(slot/assigned)*.173))%route.length;
          const segment=route.segments.find(part=>distance<part.start+part.length)||route.segments[route.segments.length-1],key=segment.prev+':'+segment.cell;
          if(used.has(key))continue;
          const state=this.makeTrafficState(segment.prev,segment.cell,segment.next,seed*131+states.length,distance-segment.start),position=this.trafficRoutePosition(state);
          if(states.some(other=>{const otherRoute=this.trafficRoutePosition(other);if(otherRoute?.circuit===route){const delta=Math.abs(otherRoute.distance-position.distance);if(Math.min(delta,route.length-delta)<.9)return true;}return this.trafficCollision(state.pose,other.pose);}))continue;
          states.push(state);used.add(key);capacities.set(route,capacities.get(route)+1);
        }
      }
      this.carStates=states;const transforms=states.map(()=>[0,0,0,.18,.105,.34]),colors=states.map((state,k)=>[0xc6d2d2,0xaeb8b5,0xd8d4c6,0xa85245,0x506f85,0xc8a760][k%6]);
      this.carBodies=this.batch(this.box,this.materials.car,transforms,colors);this.carCabins=this.batch(this.box,this.materials.carGlass,transforms);this.carLights=this.batch(this.box,this.materials.light,transforms);
      if(this.carBodies){this.world.add(this.carBodies,this.carCabins,this.carLights);for(const mesh of [this.carBodies,this.carCabins,this.carLights])mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.writeTrafficTransforms();this.setTraffic(this.trafficVisible);}
    }
    writeTrafficTransforms() {
      if(!this.carBodies)return;
      this.carStates.forEach((state,k)=>{
        const pose=state.pose=this.sampleTrafficState(state),{x,y,z,angle,dx,dz}=pose;
        this.tmp.rotation.set(0,angle,0);this.tmp.position.set(x,y,z);this.tmp.scale.set(.18,.105,.34);this.tmp.updateMatrix();this.carBodies.setMatrixAt(k,this.tmp.matrix);
        this.tmp.position.y=y+.075;this.tmp.scale.set(.145,.065,.17);this.tmp.updateMatrix();this.carCabins.setMatrixAt(k,this.tmp.matrix);
        this.tmp.position.set(x+dx*.17,y+.02,z+dz*.17);this.tmp.scale.set(.14,.025,.02);this.tmp.updateMatrix();this.carLights.setMatrixAt(k,this.tmp.matrix);
      });
      for(const mesh of [this.carBodies,this.carCabins,this.carLights])mesh.instanceMatrix.needsUpdate=true;
    }
    updateTraffic(dt){
      if(!this.carBodies||!this.trafficVisible||this.reducedMotion||!Number.isFinite(dt)||dt<=0)return;
      const time=Math.min(dt,2),steps=Math.ceil(time/(1/60)),step=time/steps;
      for(let tick=0;tick<steps;tick++){
        for(let k=0;k<this.carStates.length;k++){
          const state=this.carStates[k];
          if(!this.trafficNeighbors(state.cell).includes(state.prev)||!this.trafficNeighbors(state.cell).includes(state.next))continue;
          const candidate={...state};if(!this.advanceTrafficState(candidate,step,this.trafficFollowingSpace(state)))continue;
          if(this.carStates.some((other,index)=>index!==k&&this.trafficCollision(candidate.pose,other.pose)))continue;
          Object.assign(state,candidate);
        }
      }
      this.writeTrafficTransforms();
    }
    setMode(mode){
      this.mode=mode;const modes={day:{bg:0x263a47,sky:0xc7dfee,ground:0x5c6260,ambient:.7,sun:1.65,sunColor:0xfff0d7,rim:.35,emissive:.04,exposure:1.05},dusk:{bg:0x101b24,sky:0xaacfe1,ground:0x393b31,ambient:.5,sun:1.25,sunColor:0xffcda0,rim:.4,emissive:.28,exposure:1.08},night:{bg:0x080f19,sky:0x809fca,ground:0x17262e,ambient:.38,sun:.3,sunColor:0xb7d6ff,rim:.45,emissive:.75,exposure:1.2}};const c=modes[mode]||modes.dusk;
      this.scene.background.setHex(c.bg);this.scene.fog.color.setHex(c.bg);this.hemi.color.setHex(c.sky);this.hemi.groundColor.setHex(c.ground);this.hemi.intensity=c.ambient;this.sun.intensity=c.sun;this.sun.color.setHex(c.sunColor);this.rim.intensity=c.rim;this.materials.facade.forEach(m=>m.emissiveIntensity=c.emissive);this.materials.light.emissiveIntensity=mode==='day'?.2:1.6;this.renderer.toneMappingExposure=c.exposure;
    }
    cameraBounds(){
      if(this.framingPoints)return this.framingPoints;
      const n=this.size||30,ox=this.originX??-n/2,oz=this.originZ??-n/2,points=[];
      // Free Build fits only developed ground and roofs, so unused simulation
      // space never makes a small road network disappear into an empty square.
      if(!this.freeBuild)for(const x of [ox-1,ox+n+1])for(const z of [oz-1,oz+n+1])points.push(new THREE.Vector3(x,-.85,z));
      if(this.terrain)for(let i=0;i<this.terrain.length;i++){
        if(!this.isDeveloped(i))continue;
        const height=this.level(i)+(this.terrain[i]===1?(this.buildingHeights[i]||0)+.9:.12),x=ox+i%n+.5,z=oz+Math.floor(i/n)+.5;
        if(!this.freeBuild&&height<.2)continue;
        for(const dx of [-.5,.5])for(const dz of [-.5,.5]){points.push(new THREE.Vector3(x+dx,height,z+dz));if(this.freeBuild)points.push(new THREE.Vector3(x+dx,-.04,z+dz));}
      }
      if(!points.length)for(const x of [ox+n/2-6,ox+n/2+6])for(const z of [oz+n/2-6,oz+n/2+6])points.push(new THREE.Vector3(x,0,z));
      const box=new THREE.Box3().setFromPoints(points),span=box.getSize(new THREE.Vector3());this.framingCenter=box.getCenter(new THREE.Vector3());this.framingExtent=Math.max(12,span.x,span.z);
      this.framingPoints=points;return points;
    }
    fitCamera(name,animate=true){
      const n=this.size||30,points=this.cameraBounds(),scale=(this.freeBuild?this.framingExtent:n)/30,aspect=Math.max(.1,this.camera.aspect||1),whole=this.cameraFraming==='fit';
      const views={isometric:[27.7,25.6,32],top:[0,52,.001],street:[25,9,28]},v=views[name]||views.isometric;
      const direction=new THREE.Vector3(...v).normalize(),right=new THREE.Vector3(0,1,0).cross(direction).normalize(),up=direction.clone().cross(right).normalize();
      const target=new THREE.Vector3(this.framingCenter?.x??0,name==='street'?1.2*scale:.65*scale,this.framingCenter?.z??0),tangent=Math.tan(THREE.MathUtils.degToRad(this.camera.fov*.5));
      // Fit mode contains the complete city at any aspect. Explore mode uses a
      // larger virtual viewport on narrow screens so the map can extend beyond
      // the edges, with normal panning and zooming instead of a tiny island.
      const fitAspect=whole?aspect:Math.max(1.05,aspect),margin=whole?.84:.96;
      let distance=0;
      for(const point of points){const relative=point.clone().sub(target),depth=relative.dot(direction);distance=Math.max(distance,depth+Math.abs(relative.dot(right))/(tangent*fitAspect*margin),depth+Math.abs(relative.dot(up))/(tangent*margin));}
      if(!whole)distance*=name==='street'?.8:.86;
      distance=Math.max(this.controls.minDistance,Math.min(this.controls.maxDistance,distance));
      const position=target.clone().addScaledVector(direction,distance);this.cameraTween={position,target};
      if(!animate||this.reducedMotion){this.camera.position.copy(position);this.controls.target.copy(target);this.cameraTween=null;this.controls.update();}
    }
    setCamera(name){this.cameraPreset=name;this.cameraFraming='explore';this.cameraTouched=false;this.fitCamera(name);}
    fitCity(){this.cameraFraming='fit';this.cameraTouched=false;this.fitCamera(this.cameraPreset);}
    setOrbit(value){this.controls.autoRotate=Boolean(value)&&!this.reducedMotion;}
    getBearing(){
      // The district's north is -Z. Bearing describes the viewing direction,
      // so a camera east of its target looks west (270 degrees).
      const x=this.camera.position.x-this.controls.target.x,z=this.camera.position.z-this.controls.target.z;
      if(!Number.isFinite(x)||!Number.isFinite(z))return NaN;
      if(Math.hypot(x,z)<1e-8)return 0;
      const degrees=(THREE.MathUtils.radToDeg(Math.atan2(-x,z))+360)%360;
      return degrees<1e-8||360-degrees<1e-8?0:degrees;
    }
    resetNorth(){
      const target=this.controls.target.clone(),offset=this.camera.position.clone().sub(target);
      if(![target.x,target.y,target.z,offset.x,offset.y,offset.z].every(Number.isFinite))return false;
      const radius=Math.hypot(offset.x,offset.z),zoom=this.camera.zoom,damping=this.controls.enableDamping;
      this.cameraTween=null;this.cameraTouched=true;this.controls.autoRotate=false;
      // A disabled-damping update drains OrbitControls' pending rotation/pan
      // through its public API. Restore the chosen framing before the next
      // render, so inertia cannot pull the camera away from north afterward.
      this.controls.enableDamping=false;
      try{
        this.controls.update();
        this.controls.target.copy(target);this.camera.position.set(target.x,target.y+offset.y,target.z+radius);
        if(this.camera.zoom!==zoom){this.camera.zoom=zoom;this.camera.updateProjectionMatrix();}
        this.controls.update();
      }finally{this.controls.enableDamping=damping;}
      return true;
    }
    setTool(tool){this.tool=tool;this.controls.mouseButtons.LEFT=tool==='view'?THREE.MOUSE.ROTATE:null;this.controls.touches.ONE=tool==='view'?THREE.TOUCH.ROTATE:null;this.canvas.style.cursor=tool==='view'?'grab':'crosshair';this.setBrush(this.brushSize);}
    setEditor(enabled,options={}){
      this.editorEnabled=Boolean(enabled);this.paintDown=false;this.lastPaintWorld=null;this.hover.visible=this.selection.visible=false;
      if(this.editorEnabled){this.cameraTween=null;this.cameraTouched=true;}
      this.setBrush(options.brushSize!==undefined?options.brushSize:this.brushSize);
      if(options.showGrid!==undefined)this.setGridGuides(options.showGrid);
    }
    setBrush(size){this.brushSize=Math.max(1,Math.min(15,Math.round(Number(size)||1)));const footprint=this.editorEnabled&&this.tool!=='start'&&this.tool!=='goal'?this.brushSize:1;this.hover.scale.set(footprint,1,footprint);this.selection.scale.set(footprint,1,footprint);}
    setGridGuides(visible){this.gridGuides=Boolean(visible);if(this.gridLines)this.gridLines.visible=!this.freeBuild||this.gridGuides;}
    setQuality(quality){this.quality=quality;this.renderer.setPixelRatio(Math.min(global.devicePixelRatio||1,quality==='high'?2:1.35));this.renderer.shadowMap.enabled=quality!=='low';const resolution=quality==='high'?2048:1024;if(this.sun.shadow.mapSize.x!==resolution){this.sun.shadow.mapSize.set(resolution,resolution);if(this.sun.shadow.map){this.sun.shadow.map.dispose();this.sun.shadow.map=null;}this.renderer.shadowMap.needsUpdate=true;}if(this.particleMesh)this.makeParticles();this.resize(this.width,this.height);}
    zoom(factor){if(!Number.isFinite(factor)||factor<=0)return;const offset=this.camera.position.clone().sub(this.controls.target),distance=Math.max(this.controls.minDistance,Math.min(this.controls.maxDistance,offset.length()/factor));offset.setLength(distance);this.cameraTween=null;this.cameraTouched=true;this.camera.position.copy(this.controls.target).add(offset);this.controls.update();}
    setTraffic(visible){this.trafficVisible=Boolean(visible);[this.carBodies,this.carCabins,this.carLights].forEach(m=>{if(m)m.visible=this.trafficVisible;});}
    resize(width,height){this.width=Math.max(1,width);this.height=Math.max(1,height);this.renderer.setSize(this.width,this.height,false);this.camera.aspect=this.width/this.height;this.camera.updateProjectionMatrix();this.scaleMarkerLabels();if(!this.cameraTouched)this.fitCamera(this.cameraPreset,false);}
    setRay(event){const rect=this.canvas.getBoundingClientRect();if(!rect.width||!rect.height)return false;this.pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);return true;}
    pickWorld(event){
      if(!this.grid||!this.setRay(event)||!this.raycaster.ray.intersectPlane(this.pickPlane,this.pickPoint))return null;
      const x=this.pickPoint.x,z=this.pickPoint.z,cx=(this.originX??-this.size/2)+this.size/2,cz=(this.originZ??-this.size/2)+this.size/2;
      return Number.isFinite(x)&&Number.isFinite(z)&&Math.abs(x-cx)<199&&Math.abs(z-cz)<199?{x,z}:null;
    }
    cellAt(event){if(!this.grid||!this.setRay(event))return -1;const hits=this.raycaster.intersectObjects(this.pickMeshes||[],false);if(hits.length&&hits[0].instanceId!=null)return hits[0].object.userData.cellIndices[hits[0].instanceId];if(!this.raycaster.ray.intersectPlane(this.pickPlane,this.pickPoint))return -1;const x=Math.floor(this.pickPoint.x-this.originX),z=Math.floor(this.pickPoint.z-this.originZ);return x>=0&&z>=0&&x<this.size&&z<this.size?z*this.size+x:-1;}
    paintWorld(point,event){
      if(!point)return;
      const previous=this.lastPaintWorld||point,distance=Math.hypot(point.x-previous.x,point.z-previous.z),steps=Math.max(1,Math.ceil(distance/.35));
      for(let step=1;step<=steps;step++){const t=step/steps;this.options.onPaintWorld?.({x:previous.x+(point.x-previous.x)*t,z:previous.z+(point.z-previous.z)*t},event);}
      this.lastPaintWorld={x:point.x,z:point.z};
    }
    hoverWorld(point,event){
      this.hover.visible=this.selection.visible=Boolean(point)&&this.tool!=='view';
      if(point){const ox=Number.isFinite(this.grid.originX)?this.grid.originX:this.originX,oz=Number.isFinite(this.grid.originZ)?this.grid.originZ:this.originZ,x=ox+Math.floor(point.x-ox)+.5,z=oz+Math.floor(point.z-oz)+.5;const row=Math.floor(point.z-this.originZ),col=Math.floor(point.x-this.originX),i=row*this.size+col;let y=.065;if(row>=0&&row<this.size&&col>=0&&col<this.size&&this.isDeveloped(i))y=this.level(i)+.07;this.hover.position.set(x,y,z);this.selection.position.set(x,y,z);}
      this.options.onHoverWorld?.(point,event);
    }
    bindPointer(){
      const on=(type,listener,opts)=>{this.canvas.addEventListener(type,listener,opts);this.events.push([type,listener,opts]);};this.trafficVisible=!this.reducedMotion;
      on('pointerdown',event=>{if(event.button===0)this.canvas.focus?.({preventScroll:true});if(event.button!==0||this.tool==='view')return;this.cameraTween=null;this.cameraTouched=true;this.paintDown=true;this.lastPaint=-1;this.lastPaintWorld=null;this.canvas.setPointerCapture(event.pointerId);if(this.editorEnabled){this.paintWorld(this.pickWorld(event),event);return;}const i=this.cellAt(event);if(i>=0&&this.options.onCell){this.options.onCell(i,event);this.lastPaint=i;} });
      on('pointermove',event=>{if(this.editorEnabled){const point=this.pickWorld(event);this.hoverWorld(point,event);if(this.paintDown&&this.tool!=='view')this.paintWorld(point,event);return;}const i=this.cellAt(event);this.hover.visible=this.selection.visible=i>=0&&this.tool!=='view';if(i>=0){const p=this.point(i,.075);this.hover.position.copy(p);this.selection.position.copy(p);if(this.terrain[i]===1){this.selection.position.y=this.level(i)+(this.buildingHeights[i]||.16)+.02;this.hover.position.y=this.selection.position.y;}}if(this.options.onHover)this.options.onHover(i,event);if(this.paintDown&&this.tool!=='view'&&i>=0&&i!==this.lastPaint){this.lastPaint=i;if(this.options.onCell)this.options.onCell(i,event);} });
      const end=()=>{const painted=this.paintDown;this.paintDown=false;this.lastPaint=-1;this.lastPaintWorld=null;if(painted)this.options.onStrokeEnd?.();};on('pointerup',end);on('pointercancel',end);on('pointerleave',()=>{this.hover.visible=this.selection.visible=false;if(this.editorEnabled)this.options.onHoverWorld?.(null,null);else if(this.options.onHover)this.options.onHover(-1,null);});on('contextmenu',event=>event.preventDefault());
    }
    animate(time){
      const dt=Math.min(.05,Math.max(0,(time-this.lastTime)/1000||.016));this.lastTime=time;this.elapsed=(this.elapsed||0)+dt;this.frameCount++;if(time-this.fpsTime>650){this.fps=Math.round(this.frameCount*1000/(time-this.fpsTime));this.fpsTime=time;this.frameCount=0;}
      if(this.cameraTween){this.camera.position.lerp(this.cameraTween.position,.065);this.controls.target.lerp(this.cameraTween.target,.065);if(this.camera.position.distanceTo(this.cameraTween.position)<.03)this.cameraTween=null;}
      this.controls.update();if(!this.reducedMotion)this.updateTraffic(dt);
      this.updateLandscape(dt);this.updateParticles(dt);
      const viewDistance=this.camera.position.distanceTo(this.controls.target),extent=this.size||30;this.scene.fog.near=Math.max(65,viewDistance+extent*.25);this.scene.fog.far=Math.max(135,viewDistance+extent*3);
      if(this.routeAgent&&this.path&&this.routeDistance){if(!this.reducedMotion)this.routeTime=(this.routeTime||0)+dt;let distance=((this.routeTime||0)*2.1)%this.routeDistance,index=1;while(index<this.routeLengths.length-1&&this.routeLengths[index]<distance)index++;const a=this.routeLengths[index-1],b=this.routeLengths[index],f=(distance-a)/(b-a||1);this.routeAgent.position.copy(this.routePoints[index-1]).lerp(this.routePoints[index],f);this.routeAgent.position.y+=.035;if(this.routeHalo)this.routeHalo.scale.setScalar(this.reducedMotion?1:1+.1*Math.sin(this.routeTime*3));}
      this.markers.children.forEach((marker,i)=>{if(marker.userData.ring)marker.userData.ring.material.opacity=this.reducedMotion?1:.8+.2*Math.sin(this.elapsed*2+i);});
      this.renderer.render(this.scene,this.camera);this.stats={fps:this.fps,drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles};
    }
    destroy(){this.alive=false;cancelAnimationFrame(this.animationFrame);if(this.pendingRebuild)clearTimeout(this.pendingRebuild);this.events.forEach(([type,fn,opts])=>this.canvas.removeEventListener(type,fn,opts));this.controls.dispose();this.clear(this.world);this.clear(this.route);this.clear(this.markers);this.clear(this.overlay);if(this.landscape)this.clear(this.landscape);if(this.particles)this.clear(this.particles);this.landscapeMesh=this.particleMesh=this.routeAgent=this.routeHalo=null;this.renderer.dispose();}
  }
  global.MetroCity=MetroCity;
})(typeof window!=='undefined'?window:globalThis);
