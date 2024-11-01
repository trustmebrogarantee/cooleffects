const maxDrops = 32;

const shadersSource = {
  simple: {
    vertex: {
      type: "VERTEX_SHADER",
      source: `
      attribute vec2 position;
      attribute vec2 texCoord;
      uniform vec2 resolution;
      varying vec2 texCoordV;
      void main() {
        gl_Position = vec4(((position / resolution) * 2.0 - 1.0) * vec2(1, -1), 0, 1);
        texCoordV = texCoord;
      }`,
    },
    fragment: {
      type: "FRAGMENT_SHADER",
      source: `
      precision mediump float;
      uniform sampler2D texture0;
      uniform float amount;
      uniform float time;
      uniform vec3 drops[${maxDrops}]; // x,y are pos z is age
      uniform float aspect;
      varying vec2 texCoordV;

      vec2 offset;
      float dist;
      float wave;
      vec2 surf;
      vec2 dir;
      vec2 txC;
      float w;
      float cau;

      void main() {
        txC = texCoordV * vec2(1.0, aspect);
        cau = distance(vec2(-1.0, -1.0), txC) * 20.0 + time;
        surf = vec2(sin(cau), cos(cau)) * 0.01;
        cau = distance(vec2(1.0, 1.0), txC) * 30.0 + time;
        surf += vec2(sin(cau), cos(cau)) * 0.02;
        for(int i = 0; i < ${maxDrops}; i+= 1){
          if(drops[i].z > -90.0){
            dir = drops[i].xy - txC;
            dist = length(dir);
            dir = normalize(dir);
            w = cos((4.0 / (1.0 + pow(2.0, dist * 50.0 - drops[i].z))) * ${(
              Math.PI * 2
            ).toFixed(6)}) * -0.5 + 0.5;
            wave = w * pow(2.0, -dist * 8.0);
            surf += dir * wave;
          }
        }
        offset = texCoordV + surf * amount;
        vec3 tx = vec3(texCoordV, 0.0);
        vec3 norm = normalize(vec3(surf, 1.0));
        vec3 toLight = normalize(vec3(0.0, -0.0, 1.0) - tx);
        vec3 toCamera = normalize(vec3(0.0, 0.0, 1.0) - tx);
        vec3 lRef = normalize(2.0 * dot(norm, toLight) * norm - toLight);
        float spec = dot(lRef, toCamera) * 2.0;
        spec = clamp(spec, 0.0, 1.3) - 0.6;
        spec = pow(spec, 8.0) * 4.0;           
        vec4 col = texture2D(texture0, offset);
        col.xyz = col.xyz + spec;
        gl_FragColor = col;
      }`,
    },
  },
};

class Util {
  static loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.src = src;
      image.onload = () => resolve(image);
      image.onerror = (err) => reject(err);
    });
  }

  static doTimes(count, callback) {
    for (let i = 0; i < count; i++) {
      if (callback(i) === true) break;
    }
  }

  static eachOf(array, callback) {
    for (let i = 0; i < array.length; i++) {
      if (callback(array[i], i) === true) break;
    }
  }

  static create2DCanvasInside(element) {
    const canvas = document.createElement("canvas");
    Object.assign(canvas.style, {
      position: "absolute",
      top: "0px",
      left: "0px",
    });
    canvas.ctx = canvas.getContext("2d");
    element.appendChild(canvas);
    return canvas;
  }

  static createMouse() {
    const mouseEvents = ["mousemove", "mousedown", "mouseup"];
    const touchEvents = ["touchstart", "touchend", "touchmove"]
    const mouse = { x: 0, y: 0, buttonRaw: 0, bounds: null, element: null };
    const preventDefault = (e) => e.preventDefault();

    const applyMouseHandler = (e) => {
      const { element, bounds } = mouse;
      mouse.bounds = element?.getBoundingClientRect();
      if (bounds) {
        mouse.x = e.pageX - bounds.left - scrollX;
        mouse.y = e.pageY - bounds.top - scrollY;
      }
      mouse.buttonRaw = { mousedown: 1, mouseup: 0 }[e.type] ?? mouse.buttonRaw
      e.preventDefault();
    };

    const applyTouchHandler = (e) => {
      const { element, bounds } = mouse;
      mouse.bounds = element?.getBoundingClientRect();
      const [{ pageX, pageY }] = e.changedTouches 
      if (bounds) {
        mouse.x = pageX - bounds.left - scrollX;
        mouse.y = pageY - bounds.top - scrollY;
      }
      mouse.buttonRaw = { touchstart: 0, touchend: 1 }[e.type] ?? mouse.buttonRaw
      e.preventDefault();
    };

    mouse.start = (element, blockContextMenu = false) => {
      mouse.element = element;
      mouseEvents.forEach((event) =>
        document.addEventListener(event, applyMouseHandler)
      );
      touchEvents.forEach((event) =>
        document.addEventListener(event, applyTouchHandler, { passive: false })
      );
      if (blockContextMenu) {
        document.addEventListener("contextmenu", preventDefault, false);
      }
      return mouse;
    };
    return mouse;
  }
}

class WebglRippleEffect {
  constructor({ dropSoundUrl, centralImageUrl, container } = {}) {
    this.dropSoundUrl = dropSoundUrl;
    this.centralImageUrl = centralImageUrl;
    this.container = container || document.body;
    this.canvas = null;
    this.drops = new Float32Array(3 * maxDrops);
    this.currentDrop = 0;
    this.mouse = null;
    this.globalTime = 0;
    this.webGL = null;
    this.initialize();
    this.canvasRatio = 1
  }

  async initialize() {
    Util.doTimes(maxDrops, (i) => {
      const index = i * 3;
      this.drops[index] = Math.random();
      this.drops[index + 1] = Math.random();
      this.drops[index + 2] = -100;
    });

    const pool = document.createElement("canvas");
    pool.ctx = pool.getContext("2d");
    pool.width = 2048;
    pool.height = 1024;
    this.canvas = Util.create2DCanvasInside(this.container);
    pool.ctx.fillRect(0, 0, pool.width, pool.height);
    const image = await Util.loadImage(this.centralImageUrl);

    const ratioDiff = 1 + (pool.width / pool.height) - (this.container.clientWidth / this.container.clientHeight)
    console.log(ratioDiff);
    const scaleFactor = 2
    pool.ctx.drawImage(
      image,
      pool.width / 2 - ((image.naturalWidth * ratioDiff) * scaleFactor) / 2,
      pool.height / 2 - (image.naturalHeight * scaleFactor) / 2,
      (image.naturalWidth * ratioDiff) * scaleFactor,
      (image.naturalHeight) * scaleFactor
    );

    console.log(pool.width / pool.height, this.container.clientWidth / this.container.clientHeight);
    
    
    this.resizeCanvas();
    this.mouse = Util.createMouse().start(this.canvas, false);
    this.startWebGL([{ image: pool, wrap: "MIRRORED_REPEAT" }]);
    requestAnimationFrame((t) => this.update(t));
  }

  resizeCanvas() {
    this.canvas.height = this.container.clientHeight;
    this.canvas.width = this.container.clientWidth;
  }

  update(timer) {
    this.globalTime = timer + 120000;
    if (this.canvas.width !== this.container.clientWidth || this.canvas.height !== this.container.clientHeight) {
      this.resizeCanvas();
    }
    this.display();
    requestAnimationFrame((t) => this.update(t));
  }

  createProgram(gl, pname) {
    const locs = { uniforms: [], attributes: [] };
    const shaders = [];

    const getLocs = (type, source) => {
      source
        .split(type)
        .slice(1)
        .forEach((str) => {
          const name = str.split(";")[0].trim().split(" ").pop().split("[")[0];
          locs[type + "s"].push(name);
        });
    };

    [shadersSource[pname].vertex, shadersSource[pname].fragment].forEach(
      ({ type, source }) => {
        const shader = gl.createShader(gl[type]);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        shaders.push(shader);
        getLocs("uniform", source);
        getLocs("attribute", source);
      }
    );

    const program = gl.createProgram();
    shaders.forEach((shader) => gl.attachShader(program, shader));
    gl.linkProgram(program);

    program.locations = {};
    locs.uniforms.forEach(
      (name) => (program.locations[name] = gl.getUniformLocation(program, name))
    );
    locs.attributes.forEach(
      (name) => (program.locations[name] = gl.getAttribLocation(program, name))
    );

    gl.programs ??= {};
    gl.programs[pname] = program;
    return program;
  }

  createTexture(gl, image, settings) {
    settings = Object.assign(
      { wrap: "CLAMP_TO_EDGE", filter: "LINEAR", textureNum: 1 },
      settings
    );
    const texture = gl.createTexture();
    const tn = settings.textureNum;
    if (tn) {
      gl.activeTexture(gl.TEXTURE0 + tn);
      if (gl.currentProgram.locations["texture" + tn]) {
        gl.uniform1i(gl.currentProgram.locations["texture" + tn], tn);
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl[settings.wrap]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl[settings.wrap]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl[settings.filter]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl[settings.filter]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    return texture;
  }

  setVertexBuffer(gl, settings) {
    settings = Object.assign({ type: "FLOAT", size: 2 }, settings);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, settings.data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(gl.currentProgram.locations[settings.name]);
    gl.vertexAttribPointer(
      gl.currentProgram.locations[settings.name],
      settings.size,
      gl[settings.type],
      false,
      0,
      0
    );
  }

  display() {
    const ctx = this.canvas.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.webGL) {
      this.webGLRender();
    }
  }

  startWebGL(images) {
    this.webGL = document.createElement("canvas");
    this.webGL.width = images[0].image.width;
    this.webGL.height = images[0].image.height;
    this.webGL.gl = this.webGL.getContext("webgl");
    const gl = this.webGL.gl;
    const program = this.createProgram(gl, "simple");
    gl.useProgram(program);
    gl.currentProgram = program;
    this.setVertexBuffer(gl, {
      name: "texCoord",
      data: new Float32Array([
        0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0,
      ]),
    });
    this.setVertexBuffer(gl, {
      name: "position",
      data: new Float32Array([
        0,
        0,
        this.webGL.width,
        0,
        0,
        this.webGL.height,
        0,
        this.webGL.height,
        this.webGL.width,
        0,
        this.webGL.width,
        this.webGL.height,
      ]),
    });
    Util.eachOf(images, (imageDesc, i) =>
      this.createTexture(gl, imageDesc.image, {
        textureNum: i,
        wrap: imageDesc.wrap,
      })
    );
    gl.uniform2f(
      program.locations.resolution,
      this.webGL.width,
      this.webGL.height
    );
  }

  webGLRender() {
    const gl = this.webGL.gl;
    if (this.mouse.buttonRaw !== 0) {
      const audio = new Audio(this.dropSoundUrl);
      audio.play();
      this.mouse.buttonRaw = 0;
      const x = this.mouse.x / this.canvas.width;
      const y = this.mouse.y / this.canvas.height;
      const ind = (this.currentDrop++ % maxDrops) * 3;
      this.drops[ind] = x;
      this.drops[ind + 1] = y * ((this.canvas.height / this.canvas.width) * 2);
      this.drops[ind + 2] = -2;
    }

    for (let i = 0; i < maxDrops; i++) {
      if (this.drops[i * 3 + 2] > -90) {
        this.drops[i * 3 + 2] += 0.1;
        if (this.drops[i * 3 + 2] > 50) this.drops[i * 3 + 2] = -100;
      }
    }

    const loc = gl.currentProgram.locations;
    gl.uniform1f(loc.aspect, (this.canvas.height / this.canvas.width) * 2);
    gl.uniform1f(loc.amount, 0.1);
    gl.uniform1f(loc.time, this.globalTime / 1000);
    gl.uniform3fv(loc.drops, this.drops);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.canvas.ctx.drawImage(
      this.webGL,
      0,
      0,
      this.canvas.width,
      this.canvas.height
    );
  }
}

new WebglRippleEffect({
  dropSoundUrl: "/cooleffects/water-drop.wav",
  centralImageUrl: "/cooleffects/vite.svg",
  container: document.getElementById("app"),
});
