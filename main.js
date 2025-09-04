"use strict";

document.addEventListener("DOMContentLoaded", function () {
  const errorDiv = document.getElementById("error-message");
  const inputs = document.querySelectorAll("#controls input");
  inputs.forEach((input) => {
    input.addEventListener("input", () => {
      errorDiv.textContent = "";
    });
    // set default value if empty
    input.addEventListener("blur", () => {
      if (input.value === "") {
        input.value = input.getAttribute("value");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
  });

  function parseInput(id) {
    const raw = document.getElementById(id).value.trim();
    try {
      return math.evaluate(raw);
    } catch (e) {
      throw new Error(`Invalid input for ${id}: ${raw}`);
    }
  }

  function getAxisAngleInputs() {
    const x = parseInput("axisX");
    const y = parseInput("axisY");
    const z = parseInput("axisZ");
    const angle = parseInput("angle");
    if (x === 0 && y === 0 && z === 0) {
      throw new Error("Invalid axis: zero vector");
    }
    return { x, y, z, angle };
  }
  function getEulerInputs() {
    return {
      alpha: parseInput("alpha"),
      beta: parseInput("beta"),
      gamma: parseInput("gamma"),
    };
  }
  function getQuaternionFromInputs() {
    const qx = parseInput("qx");
    const qy = parseInput("qy");
    const qz = parseInput("qz");
    const qw = parseInput("qw");
    const q = quat.fromValues(qx, qy, qz, qw);
    try {
      quat.normalize(q, q);
    } catch (e) {
      throw new Error("Invalid quaternion: " + e.message);
    }
    return q;
  }

  function isValidRotationMatrix(r) {
    // R^T * R = I and det(R) = +1
    const identity = mat3.create();
    const rt = mat3.create();
    mat3.transpose(rt, r);
    const result = mat3.create();
    mat3.multiply(result, rt, r);
    const det = mat3.determinant(r);
    if (!mat3.equals(result, identity) || det < 0.999 || det > 1.001) {
      return false;
    }
    return true;
  }

  function getMatrixFromInputs() {
    // Read 3x3 matrix from inputs in column-major order, as used by mat3
    let m = [];
    for (let j = 0; j < 3; ++j) {
      for (let i = 0; i < 3; ++i) {
        m.push(parseInput(`m${i}${j}`));
      }
    }
    let rot = mat3.fromValues(...m);
    if (!isValidRotationMatrix(rot)) {
      throw new Error("Invalid rotation matrix");
    }
    return m;
  }

  const rotationType = document.getElementById("rotationType");
  const groups = {
    "axis-angle": document.getElementById("axis-angle-group"),
    euler: document.getElementById("euler-group"),
    quaternion: document.getElementById("quaternion-group"),
    matrix: document.getElementById("matrix-group"),
  };
  const DEFAULTS = {
    axisAngle: [1, 0, 0, 0], // axis z, angle 0
    euler: [0, 0, 0],
    quat: [0, 0, 0, 1],
    matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  };
  const outputGroups = {
    "axis-angle": document.getElementById("axis-angle-output-group"),
    euler: document.getElementById("euler-output-group"),
    quaternion: document.getElementById("quaternion-output-group"),
    matrix: document.getElementById("matrix-output-group"),
  };

  // helpers for formatting output
  // arr is an array-like object of numbers
  // digits can be a number or an array of per-element decimal places
  function formatVec(arr, digits = 4, sep = "\t") {
    if (Array.isArray(digits)) {
      return Array.from(arr)
        .map((v, i) => {
          const d = digits[i] !== undefined ? digits[i] : 4;
          return v.toFixed(d);
        })
        .join(sep);
    } else {
      return Array.from(arr)
        .map((v) => v.toFixed(digits))
        .join(sep);
    }
  }

  function formatMatrix(mat, digits = 4) {
    return (
      mat[0].toFixed(digits) +
      "  " +
      mat[3].toFixed(digits) +
      "  " +
      mat[6].toFixed(digits) +
      "\n" +
      mat[1].toFixed(digits) +
      "  " +
      mat[4].toFixed(digits) +
      "  " +
      mat[7].toFixed(digits) +
      "\n" +
      mat[2].toFixed(digits) +
      "  " +
      mat[5].toFixed(digits) +
      "  " +
      mat[8].toFixed(digits)
    );
  }
  function setOutputsToDefault() {
    document.getElementById("axisAngleOut").textContent = formatVec(
      DEFAULTS.axisAngle
    );
    document.getElementById("eulerOut").textContent = formatVec(DEFAULTS.euler);
    document.getElementById("quatOut").textContent = formatVec(DEFAULTS.quat);
    document.getElementById("matOut").textContent = formatMatrix(
      DEFAULTS.matrix
    );
  }

  // Helper to set input fields readonly or editable
  function setInputsEditable(groupId, editable) {
    const inputs = groups[groupId].querySelectorAll("input");
    inputs.forEach((input) => {
      input.readOnly = !editable;
      input.style.background = editable ? "" : "#eee";
    });
  }

  function updateGroups() {
    // Only selected input group is editable
    Object.keys(groups).forEach((key) => {
      groups[key].style.display = "none";
      setInputsEditable(key, false);
    });
    const selected = rotationType.value;
    groups[selected].style.display = "";
    setInputsEditable(selected, true);
    updateEquivalents(selected);

    // Hide selected output, show others
    Object.keys(outputGroups).forEach((key) => {
      outputGroups[key].style.display = key === selected ? "none" : "";
    });
  }

  function updateEquivalents(selected) {
    if (selected === "axis-angle") {
      let x, y, z, angle;
      try {
        ({ x, y, z, angle } = getAxisAngleInputs());
      } catch (e) {
        errorDiv.textContent = e.message;
        setOutputsToDefault();
        return;
      }
      const axisAngleDegOrRad =
        document.getElementById("axis-angle-degRad").value;
      const q = axisAngleToQuaternion(x, y, z, angle, axisAngleDegOrRad);

      const mat = mat3.create();
      mat3.fromQuat(mat, q);

      const eulerDegOrRad = document.getElementById(
        "euler-output-degRad"
      ).value;
      const euler = vec3.create();
      quaternionToEuler(euler, q, eulerDegOrRad);

      document.getElementById("quatOut").textContent = formatVec(q);
      document.getElementById("matOut").textContent = formatMatrix(mat);
      let digits = 4;
      if (eulerDegOrRad === "deg") digits = 2;
      document.getElementById("eulerOut").textContent = formatVec(
        euler,
        digits
      );

      setTargetRotation(q);
    } else if (selected === "euler") {
      const { alpha, beta, gamma } = getEulerInputs(); // TODO: support order

      const eulerdegOrRad = document.getElementById("euler-degRad").value;
      const q = eulerToQuaternion(alpha, beta, gamma, eulerdegOrRad);
      const mat = quaternionToMatrix(q);

      const axisAngleDegOrRad = document.getElementById(
        "axis-angle-output-degRad"
      ).value;
      const axisAngle = vec4.create();
      quaternionToAxisAngle(axisAngle, q, axisAngleDegOrRad);

      document.getElementById("quatOut").textContent = formatVec(q);
      document.getElementById("matOut").textContent = formatMatrix(mat);
      if (axisAngleDegOrRad === "deg") {
        document.getElementById("axisAngleOut").textContent = formatVec(
          axisAngle,
          [4, 4, 4, 2]
        );
      } else {
        document.getElementById("axisAngleOut").textContent =
          formatVec(axisAngle);
      }

      setTargetRotation(q);
    } else if (selected === "quaternion") {
      let q;
      try {
        q = getQuaternionFromInputs();
      } catch (e) {
        errorDiv.textContent = e.message;
        setOutputsToDefault();
        return;
      }
      const mat = quaternionToMatrix(q);

      const axisAngleDegOrRad = document.getElementById(
        "axis-angle-output-degRad"
      ).value;
      const axisAngle = vec4.create();
      quaternionToAxisAngle(axisAngle, q, axisAngleDegOrRad);
      const eulerDegOrRad = document.getElementById(
        "euler-output-degRad"
      ).value;
      const euler = vec3.create();
      quaternionToEuler(euler, q, eulerDegOrRad);
      document.getElementById("matOut").textContent = formatMatrix(mat);
      if (axisAngleDegOrRad === "deg") {
        document.getElementById("axisAngleOut").textContent = formatVec(
          axisAngle,
          [4, 4, 4, 2]
        );
      } else {
        document.getElementById("axisAngleOut").textContent =
          formatVec(axisAngle);
      }
      let digits = 4;
      if (eulerDegOrRad === "deg") digits = 2;
      document.getElementById("eulerOut").textContent = formatVec(
        euler,
        digits
      );

      setTargetRotation(q);
    } else if (selected === "matrix") {
      let m;
      try {
        m = getMatrixFromInputs();
      } catch (e) {
        errorDiv.textContent = e.message;
        setOutputsToDefault();
        return;
      }
      const q = matrixToQuaternion(m);

      const axisAngleDegOrRad = document.getElementById(
        "axis-angle-output-degRad"
      ).value;
      const axisAngle = vec4.create();
      matrixToAxisAngle(axisAngle, m, axisAngleDegOrRad);

      const eulerDegOrRad = document.getElementById(
        "euler-output-degRad"
      ).value;
      const euler = vec3.create();
      quaternionToEuler(euler, q, eulerDegOrRad);

      document.getElementById("quatOut").textContent = formatVec(q);
      if (axisAngleDegOrRad === "deg") {
        document.getElementById("axisAngleOut").textContent = formatVec(
          axisAngle,
          [4, 4, 4, 2]
        );
      } else {
        document.getElementById("axisAngleOut").textContent =
          formatVec(axisAngle);
      }
      let digits = 4;
      if (eulerDegOrRad === "deg") digits = 2;
      document.getElementById("eulerOut").textContent = formatVec(
        euler,
        digits
      );

      setTargetRotation(q);
    }
  }

  // Listen for changes
  rotationType.addEventListener("change", updateGroups);

  // Listen for input changes in all groups to update equivalents
  Object.values(groups).forEach((group) => {
    group.addEventListener("input", () => updateGroups());
  });

  // Listen for changes in deg/rad selectors to update equivalents
  // Relevant only for axis-angle and euler representations
  const axisAngleOutputDegOrRad = document.getElementById(
    "axis-angle-output-degRad"
  );
  axisAngleOutputDegOrRad.addEventListener("change", () => {
    const selected = rotationType.value;
    if (selected !== "axis-angle") {
      const unit = axisAngleOutputDegOrRad.value;
      const axisAngleOut = document.getElementById("axisAngleOut");
      const parts = axisAngleOut.textContent.trim().split(/\s+/);
      if (parts.length === 4) {
        let angle = parseFloat(parts[3]);
        if (unit === "deg") {
          angle = glm.toDegree(angle);
          parts[3] = angle.toFixed(2);
        } else {
          angle = glm.toRadian(angle);
          parts[3] = angle.toFixed(4);
        }
        axisAngleOut.textContent = parts.join("\t");
      }
    }
  });
  const eulerOutputDegOrRad = document.getElementById("euler-output-degRad");
  eulerOutputDegOrRad.addEventListener("change", () => {
    const selected = rotationType.value;
    if (selected !== "euler") {
      const unit = eulerOutputDegOrRad.value;
      const eulerOut = document.getElementById("eulerOut");
      const parts = eulerOut.textContent.trim().split(/\s+/);
      if (parts.length === 3) {
        for (let i = 0; i < 3; ++i) {
          let angle = parseFloat(parts[i]);
          if (unit === "deg") {
            angle = glm.toDegree(angle);
            parts[i] = angle.toFixed(2);
          } else {
            angle = glm.toRadian(angle);
            parts[i] = angle.toFixed(4);
          }
        }
        eulerOut.textContent = parts.join("\t");
      }
    }
  });

  updateGroups();
});
