"use strict";

let gl, program, uModel, uView, uProj;
let canvas;

// Buffers
let axisBuffer, coneBuffer, planeBuffer;

// Camera orbit state
let cameraRadius = 5.0;
let cameraTheta = 0.8; // horizontal angle
let cameraPhi = 0.8; // vertical angle
let isDragging = false;
let lastX = 0,
  lastY = 0;

// Projection matrix
let projMatrix = mat4.create();

// Rotation state
let rotationMatrix = mat4.create();
let rotationQ = quat.create(); // current rotation
let targetQ = quat.create(); // target rotation

function setTargetRotation(q) {
  quat.copy(targetQ, q);
  quat.identity(rotationQ);
}

// upVec is a glMatrix vec3
function getOrbitBasis(upVec) {
  const ux = upVec[0],
    uy = upVec[1],
    uz = upVec[2];

  // Choose right & forward so that
  // 1. right x forward = up (right-handed)
  // 2. right & forward point along positive world axes
  if (uy === 1) {
    // Y up
    return {
      up: vec3.fromValues(0, 1, 0),
      right: vec3.fromValues(0, 0, 1), // +Z
      forward: vec3.fromValues(1, 0, 0), // +X
    };
  } else if (ux === 1) {
    // X up
    return {
      up: vec3.fromValues(1, 0, 0),
      right: vec3.fromValues(0, 1, 0), // +Y
      forward: vec3.fromValues(0, 0, 1), // +Z
    };
  } else if (uz === 1) {
    // Z up
    return {
      up: vec3.fromValues(0, 0, 1),
      right: vec3.fromValues(1, 0, 0), // +X
      forward: vec3.fromValues(0, 1, 0), // +Y
    };
  } else {
    throw new Error("getOrbitBasis: upVec must be a unit axis vector");
  }
}

function getViewMatrix() {
  const upSel = document.getElementById("upVec").value.split(",").map(Number);
  const upVec = vec3.fromValues(upSel[0], upSel[1], upSel[2]);

  // Always keep camera in positive octant:
  // 1. phi: tilt from the up axis ([0, pi/2] is +up)
  // 2. theta: around the up axis ([0, pi/2] is +right and +forward)
  const EPS = 0.001;
  cameraPhi = Math.max(EPS, Math.min(Math.PI / 2 - EPS, cameraPhi));
  cameraTheta = Math.max(EPS, Math.min(Math.PI / 2 - EPS, cameraTheta));

  // Local spherical (relative to orbit basis)
  const sx = cameraRadius * Math.sin(cameraPhi) * Math.cos(cameraTheta);
  const sy = cameraRadius * Math.cos(cameraPhi);
  const sz = cameraRadius * Math.sin(cameraPhi) * Math.sin(cameraTheta);

  const { right, forward, up } = getOrbitBasis(upVec);

  // eye = x*right + y*up + z*forward
  const eye = vec3.create();
  vec3.scaleAndAdd(eye, eye, right, sx);
  vec3.scaleAndAdd(eye, eye, up, sy);
  vec3.scaleAndAdd(eye, eye, forward, sz);

  const view = mat4.create();
  mat4.lookAt(view, eye, [0, 0, 0], up);
  return view;
}

function updateProjection() {
  const dpr = window.devicePixelRatio || 1;
  const displayW = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const displayH = Math.max(1, Math.floor(canvas.clientHeight * dpr));

  if (canvas.width !== displayW || canvas.height !== displayH) {
    canvas.width = displayW;
    canvas.height = displayH;
  }

  gl.viewport(0, 0, canvas.width, canvas.height);
  mat4.perspective(
    projMatrix,
    Math.PI / 4,
    canvas.width / canvas.height,
    0.1,
    100
  );
}

window.addEventListener("load", () => {
  canvas = document.getElementById("canvas");
  gl = canvas.getContext("webgl");
  if (!gl) {
    alert("WebGL not supported!");
    return;
  }

  initShaders();
  initBuffers();
  initControls();
  updateProjection();

  requestAnimationFrame(render);
  window.addEventListener("resize", updateProjection);
});

function initControls() {
  canvas.addEventListener("mousedown", (e) => {
    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });
  canvas.addEventListener("mouseup", () => {
    isDragging = false;
  });
  canvas.addEventListener("mouseleave", () => {
    isDragging = false;
  });
  canvas.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    cameraTheta -= dx * 0.01;
    cameraPhi -= dy * 0.01;
    const EPS = 0.001;
    cameraPhi = Math.max(EPS, Math.min(Math.PI - EPS, cameraPhi));
    cameraTheta = Math.max(EPS, Math.min(Math.PI / 2 - EPS, cameraTheta));
    lastX = e.clientX;
    lastY = e.clientY;
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      cameraRadius *= 1 + e.deltaY * 0.001;
      cameraRadius = Math.max(1.0, Math.min(50.0, cameraRadius));
    },
    { passive: false }
  );
}

function initShaders() {
  const vsSource = `
    attribute vec3 aPosition;
    uniform mat4 uModel, uView, uProj;
    void main() {
      gl_Position = uProj * uView * uModel * vec4(aPosition, 1.0);
    }
  `;
  const fsSource = `
    precision mediump float;
    uniform vec4 uColor;
    void main() {
      gl_FragColor = uColor;
    }
  `;

  const vShader = compileShader(gl.VERTEX_SHADER, vsSource);
  const fShader = compileShader(gl.FRAGMENT_SHADER, fsSource);

  program = gl.createProgram();
  gl.attachShader(program, vShader);
  gl.attachShader(program, fShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Could not link shaders:", gl.getProgramInfoLog(program));
  }

  gl.useProgram(program);

  program.aPosition = gl.getAttribLocation(program, "aPosition");
  uModel = gl.getUniformLocation(program, "uModel");
  uView = gl.getUniformLocation(program, "uView");
  uProj = gl.getUniformLocation(program, "uProj");
  program.uColor = gl.getUniformLocation(program, "uColor");
}

function compileShader(type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compile error:", gl.getShaderInfoLog(shader));
  }
  return shader;
}

function initBuffers() {
  // Axes (lines)
  const axisVerts = [
    0,
    0,
    0,
    2,
    0,
    0, // X
    0,
    0,
    0,
    0,
    2,
    0, // Y
    0,
    0,
    0,
    0,
    0,
    2, // Z
  ];
  axisBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, axisBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(axisVerts), gl.STATIC_DRAW);
  axisBuffer.numItems = axisVerts.length / 3;

  // Cone geometry (arrowhead)
  const coneVerts = [];
  const slices = 20;
  const radius = 0.1;
  const height = 0.3;

  for (let i = 0; i <= slices; i++) {
    const theta = (i / slices) * 2 * Math.PI;
    const x = radius * Math.cos(theta);
    const y = radius * Math.sin(theta);
    const z = -height;

    const nextTheta = ((i + 1) / slices) * 2 * Math.PI;
    const nx = radius * Math.cos(nextTheta);
    const ny = radius * Math.sin(nextTheta);
    const nz = -height;

    coneVerts.push(0, 0, 0, x, y, z, nx, ny, nz);
  }

  coneBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, coneBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(coneVerts), gl.STATIC_DRAW);
  coneBuffer.numItems = coneVerts.length / 3;

  // Plane (square) in XY plane
  const size = 1.0;
  const verts = [
    0,
    0,
    0,
    size,
    0,
    0,
    size,
    size,
    0,
    0,
    0,
    0,
    size,
    size,
    0,
    0,
    size,
    0,
  ];

  planeBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, planeBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  planeBuffer.numItems = verts.length / 3;
}

function normalizeColorToVec4(color) {
  if (!color) return [0, 0, 0, 1];
  if (color.length === 4) return color;
  return [color[0] || 0, color[1] || 0, color[2] || 0, 1.0];
}

function drawAxisWithArrow(color, axisIndex, rotationMat) {
  const col4 = normalizeColorToVec4(color);
  const baseModel = mat4.clone(rotationMat);

  // Line
  gl.bindBuffer(gl.ARRAY_BUFFER, axisBuffer);
  gl.vertexAttribPointer(program.aPosition, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(program.aPosition);

  gl.uniformMatrix4fv(uModel, false, baseModel);
  gl.uniform4fv(program.uColor, col4);
  gl.drawArrays(gl.LINES, axisIndex * 2, 2);

  // Arrowhead
  const coneModel = mat4.clone(baseModel);
  let axisEnd = [0, 0, 0];
  if (axisIndex === 0) axisEnd = [2, 0, 0];
  if (axisIndex === 1) axisEnd = [0, 2, 0];
  if (axisIndex === 2) axisEnd = [0, 0, 2];
  mat4.translate(coneModel, coneModel, axisEnd);

  if (axisIndex === 0) {
    mat4.rotate(coneModel, coneModel, Math.PI / 2, [0, 1, 0]);
  } else if (axisIndex === 1) {
    mat4.rotate(coneModel, coneModel, -Math.PI / 2, [1, 0, 0]);
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, coneBuffer);
  gl.vertexAttribPointer(program.aPosition, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(program.aPosition);

  gl.uniformMatrix4fv(uModel, false, coneModel);
  gl.uniform4fv(program.uColor, col4);
  gl.drawArrays(gl.TRIANGLES, 0, coneBuffer.numItems);
}

function drawPlane(color, orientation) {
  const col4 = normalizeColorToVec4(color);
  const model = mat4.create();
  if (orientation === "XZ") {
    mat4.rotateX(model, model, -Math.PI / 2);
    mat4.rotateZ(model, model, -Math.PI / 2);
  } else if (orientation === "YZ") {
    mat4.rotateX(model, model, Math.PI / 2);
    mat4.rotateY(model, model, Math.PI / 2);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, planeBuffer);
  gl.vertexAttribPointer(program.aPosition, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(program.aPosition);

  gl.uniformMatrix4fv(uModel, false, model);
  gl.uniform4fv(program.uColor, col4);
  gl.drawArrays(gl.TRIANGLES, 0, planeBuffer.numItems);
}

function render() {
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  // slerp animation toward targetQ
  const tStep = 0.02;
  if (quat.getAngle(rotationQ, targetQ) > 0.001) {
    quat.slerp(rotationQ, rotationQ, targetQ, tStep);
  }
  mat4.fromQuat(rotationMatrix, rotationQ);

  gl.useProgram(program);
  updateProjection();
  const view = getViewMatrix();
  gl.uniformMatrix4fv(uView, false, view);
  gl.uniformMatrix4fv(uProj, false, projMatrix);

  // Identity planes
  drawPlane([1.0, 0.0, 0.0, 0.3], "YZ"); // r
  drawPlane([0.0, 1.0, 0.0, 0.3], "XZ"); // g
  drawPlane([0.0, 0.0, 1.0, 0.3], "XY"); // b

  // Identity axes
  drawAxisWithArrow([0.7, 0.2, 0.2], 0, mat4.create()); // r
  drawAxisWithArrow([0.2, 0.7, 0.2], 1, mat4.create()); // g
  drawAxisWithArrow([0.2, 0.2, 0.7], 2, mat4.create()); // b

  // Rotated axes
  drawAxisWithArrow([1, 0, 0], 0, rotationMatrix);
  drawAxisWithArrow([0, 1, 0], 1, rotationMatrix);
  drawAxisWithArrow([0, 0, 1], 2, rotationMatrix);

  requestAnimationFrame(render);
}
