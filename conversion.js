"use strict";

// out is a vec3 to receive the result
// quat is a quat [x, y, z, w]
// degOrRad is "deg" or "rad"
// defaulting to zyx order
// TODO: support different Tait-Bryan orders
function quaternionToEuler(out, quat, degOrRad, order = "ZYX") {
  const [x, y, z, w] = quat;
  // NOTE: alpha, beta, gamma here are not used in the same order as in Euler angle input,
  // which follows the intrinsic Tait-Bryan order

  // alpha (X-axis rotation)
  const sinr_cosp = 2 * (w * x + y * z);
  const cosr_cosp = 1 - 2 * (x * x + y * y);
  const alpha = Math.atan2(sinr_cosp, cosr_cosp);
  // beta (Y-axis rotation)
  const sinp = 2 * (w * y - z * x);
  let beta;
  if (Math.abs(sinp) >= 1) {
    beta = Math.sign(sinp) * (Math.PI / 2); // clamp
  } else {
    beta = Math.asin(sinp);
  }
  // gamma (Z-axis rotation)
  const siny_cosp = 2 * (w * z + x * y);
  const cosy_cosp = 1 - 2 * (y * y + z * z);
  const gamma = Math.atan2(siny_cosp, cosy_cosp);

  if (degOrRad === "deg") {
    out[0] = glm.toDegree(gamma);
    out[1] = glm.toDegree(beta);
    out[2] = glm.toDegree(alpha);
  } else if (degOrRad === "rad") {
    out[0] = gamma;
    out[1] = beta;
    out[2] = alpha;
  }
  return out;
}

function quaternionToAxisAngle(out, q, degOrRad) {
  quat.normalize(q, q);
  const angle = quat.getAxisAngle(out, q);
  if (degOrRad === "deg") {
    out[3] = glm.toDegree(angle);
  } else if (degOrRad === "rad") {
    out[3] = angle;
  } else {
    throw new Error('quaternionToAxisAngle: degOrRad must be "deg" or "rad"');
  }
  return out;
}

function quaternionToMatrix(q) {
  if (q[0] === q[1] && q[1] === q[2] && q[2] === 0) {
    return mat3.create();
  }
  quat.normalize(q, q);
  const mat = mat3.create();
  mat3.fromQuat(mat, q);
  return mat;
}

function axisAngleToQuaternion(x, y, z, angle, degOrRad) {
  const axis = vec3.fromValues(x, y, z);
  vec3.normalize(axis, axis);
  const quatOut = quat.create();
  if (degOrRad === "deg") {
    quat.setAxisAngle(quatOut, axis, glm.toRadian(angle));
  } else if (degOrRad === "rad") {
    quat.setAxisAngle(quatOut, axis, angle);
  } else {
    throw new Error('axisAngleToQuaternion: degOrRad must be "deg" or "rad"');
  }
  quat.normalize(quatOut, quatOut);
  return quatOut;
}

function eulerToQuaternion(alpha, beta, gamma, degOrRad, order = "zyx") {
  const q = quat.create();
  if (degOrRad === "deg") {
    quat.fromEuler(q, gamma, beta, alpha, "zyx"); // TODO: support order
  } else if (degOrRad === "rad") {
    const aDeg = glm.toDegree(alpha);
    const bDeg = glm.toDegree(beta);
    const gDeg = glm.toDegree(gamma);
    quat.fromEuler(q, gDeg, bDeg, aDeg, "zyx");
  } else {
    throw new Error('eulerToQuaternion: degOrRad must be "deg" or "rad"');
  }
  quat.normalize(q, q);
  return q;
}

function matrixToQuaternion(m) {
  const quatOut = quat.create();
  quat.fromMat3(quatOut, m);
  quat.normalize(quatOut, quatOut);
  return quatOut;
}

// direct conversion, not using quaternion as intermediate
// out is a vec4 to receive the result
// m is a mat3
function matrixToAxisAngle(out, m, degOrRad) {
  const trace = m[0] + m[4] + m[8];
  const angle = Math.acos(Math.min(Math.max((trace - 1) / 2, -1), 1)); // clamp to [-1, 1]

  let x, y, z;
  if (Math.abs(angle) < 1e-6) {
    // If angle is close to 0, axis is arbitrary
    x = 1;
    y = 0;
    z = 0;
  } else if (Math.abs(Math.PI - angle) < 1e-6) {
    // If angle is close to 180°
    if (m[0] >= m[4] && m[0] >= m[8]) {
      // m[0] is the largest diagonal term
      x = Math.sqrt((m[0] + 1) / 2);
      y = m[3] / (2 * x);
      z = m[6] / (2 * x);
    } else if (m[4] >= m[0] && m[4] >= m[8]) {
      // m[4] is the largest diagonal term
      y = Math.sqrt((m[4] + 1) / 2);
      x = m[3] / (2 * y);
      z = m[7] / (2 * y);
    } else {
      // m[8] is the largest diagonal term
      z = Math.sqrt((m[8] + 1) / 2);
      x = m[6] / (2 * z);
      y = m[7] / (2 * z);
    }
  } else {
    const s = 2 * Math.sin(angle);
    x = (m[5] - m[7]) / s;
    y = (m[6] - m[2]) / s;
    z = (m[1] - m[3]) / s;
  }
  out[0] = x;
  out[1] = y;
  out[2] = z;
  if (degOrRad === "deg") {
    out[3] = glm.toDegree(angle);
  } else if (degOrRad === "rad") {
    out[3] = angle;
  } else {
    throw new Error('matrixToAxisAngle: degOrRad must be "deg" or "rad"');
  }

  return out;
}
