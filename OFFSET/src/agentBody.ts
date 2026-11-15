import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";

/**
 * The raw human base mesh, copied from "Human body shape.jpg": a muscular
 * superhero-style figure built from parametric lofts whose radius varies
 * with height AND angle, so real muscle groups emerge — pecs, lats, spinal
 * groove, quads, diamond calves, biceps — plus trapezius wedges, deltoid
 * caps, glutes, and fingered hands.
 *
 * Proportions locked to the reference sheet (7.5 heads, 1.83 units tall):
 * chest line 1.34, navel 1.10, crotch 0.85, knees 0.37; shoulders ≈ 2.3
 * head-widths, hips ≈ 1.65; A-pose arms hanging slightly out; feet
 * hip-width apart, toes out ~12°.
 */

const DEG = Math.PI / 180;

export const SKIN = "#E8C4A8";

/** Gaussian bump centred at c with width s. */
export const bell = (x: number, c: number, s: number): number =>
    Math.exp(-((x - c) / s) * ((x - c) / s));

/** Gaussian over the wrapped angle difference (degrees). */
export const angGauss = (thetaDeg: number, centerDeg: number, sigmaDeg: number): number => {
    const d = (((thetaDeg - centerDeg + 180) % 360) + 360) % 360 - 180;
    return Math.exp(-(d / sigmaDeg) * (d / sigmaDeg));
};

/** Smoothstep interpolation through control points [key, value]. */
export const profileAt = (points: [number, number][], key: number): number => {
    if (key <= points[0][0]) return points[0][1];
    for (let k = 0; k < points.length - 1; k++) {
        const [k0, v0] = points[k];
        const [k1, v1] = points[k + 1];
        if (key <= k1) {
            const t = (key - k0) / (k1 - k0);
            const s = t * t * (3 - 2 * t);
            return v0 + (v1 - v0) * s;
        }
    }
    return points[points.length - 1][1];
};

/**
 * Generic closed loft: fn(v, theta) with v in 0..1 along the mesh and theta
 * wrapping 0..360°. The last column wraps onto the first (no UV seam).
 */
export const buildParamMesh = (
    name: string,
    rows: number,
    cols: number,
    fn: (v: number, theta: number) => Vector3,
    scene: Scene,
): Mesh => {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= rows; i++) {
        const v = i / rows;
        for (let j = 0; j < cols; j++) {
            const theta = (j / cols) * Math.PI * 2;
            const p = fn(v, theta);
            positions.push(p.x, p.y, p.z);
            uvs.push(j / cols, v);
        }
    }
    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            const a = i * cols + j;
            const b = i * cols + ((j + 1) % cols);
            const c = (i + 1) * cols + j;
            const d = (i + 1) * cols + ((j + 1) % cols);
            indices.push(a, c, d, a, d, b);
        }
    }
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    const mesh = new Mesh(name, scene);
    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.uvs = uvs;
    vertexData.indices = indices;
    vertexData.normals = normals;
    vertexData.applyToMesh(mesh);
    return mesh;
};

/**
 * The torso loft: elliptical cross-sections from crotch to neck base, with
 * angular muscle bumps. `scale` inflates x/z (used for the tee shirt that
 * hugs this shape). Theta: 0° = front (-Z), 90° = his right (+X),
 * 180° = back (+Z).
 */
export const buildTorso = (scene: Scene, scale = 1): Mesh => {
    const WIDTHS: [number, number][] = [
        [0.85, 0.128], [0.98, 0.148], [1.10, 0.140], [1.22, 0.152],
        [1.34, 0.175], [1.45, 0.175], [1.50, 0.085],
    ];
    const DEPTHS: [number, number][] = [
        [0.85, 0.098], [0.98, 0.110], [1.10, 0.104], [1.22, 0.112],
        [1.34, 0.127], [1.45, 0.124], [1.50, 0.075],
    ];
    return buildParamMesh("torsoBody", 24, 28, (v, theta) => {
        const y = 0.85 + 0.65 * v;
        const wx = profileAt(WIDTHS, y);
        const wz = profileAt(DEPTHS, y);
        const deg = theta / DEG;

        let bump = 0;
        // Pectorals: two lobes either side of the chest centre.
        bump += 0.030 * bell(y, 1.33, 0.075) * (angGauss(deg, 22, 20) + angGauss(deg, -22, 20));
        // Abdominal ridge.
        bump += 0.008 * bell(y, 1.12, 0.09) * angGauss(deg, 0, 14);
        // Lat flare at the sides/back.
        bump += 0.016 * bell(y, 1.27, 0.10) * (angGauss(deg, 95, 30) + angGauss(deg, 265, 30));
        // Spinal groove.
        bump -= 0.012 * bell(y, 1.18, 0.22) * angGauss(deg, 180, 10);

        const b = bump * scale;
        return new Vector3(
            Math.sin(theta) * (wx + b) * scale,
            y,
            -Math.cos(theta) * (wz + b) * scale,
        );
    }, scene);
};

export interface BodyBase {
    skin: StandardMaterial;
    torso: Mesh;
    armPivots: TransformNode[];
    headPivot: TransformNode;
}

/**
 * Builds the full unclothed body and returns the handles the clothing and
 * animation need. Everything is skin material, always visible.
 */
export const createBodyBase = (scene: Scene): BodyBase => {
    const skin = new StandardMaterial("bodySkin", scene);
    skin.diffuseColor = Color3.FromHexString(SKIN);
    skin.specularColor = Color3.Black();
    skin.backFaceCulling = false; // insurance for loft winding
    skin.twoSidedLighting = true;

    // Torso.
    const torso = buildTorso(scene, 1);
    torso.material = skin;

    // Trapezius wedges sloping from the thick neck out to the shoulders.
    for (const side of [-1, 1]) {
        const trap = CreateSphere("trap", { diameter: 0.13, segments: 12 }, scene);
        trap.scaling.set(1.3, 0.75, 1.15);
        trap.position.set(side * 0.085, 1.505, -0.005);
        trap.rotation.z = -side * 0.30;
        trap.rotation.x = 0.10;
        trap.material = skin;
    }

    // Deltoid caps on the broad shelf shoulders.
    for (const side of [-1, 1]) {
        const delt = CreateSphere("deltoid", { diameter: 0.125, segments: 14 }, scene);
        delt.scaling.set(1.0, 1.2, 1.05);
        delt.position.set(side * 0.183, 1.452, 0);
        delt.material = skin;
    }

    // Pelvis + glutes.
    const pelvis = CreateSphere("pelvis", { diameter: 0.27, segments: 16 }, scene);
    pelvis.scaling.set(1.05, 0.85, 0.88);
    pelvis.position.set(0, 0.96, 0);
    pelvis.material = skin;

    for (const side of [-1, 1]) {
        const glute = CreateSphere("glute", { diameter: 0.21, segments: 14 }, scene);
        glute.scaling.set(0.95, 0.85, 0.9);
        glute.position.set(side * 0.063, 0.945, 0.078);
        glute.material = skin;
    }

    // Thick neck (mostly hidden by traps/collar later).
    const neck = CreateCapsule("neck", { radius: 0.052, height: 0.18 }, scene);
    neck.position.y = 1.555;
    neck.material = skin;

    // ---- legs: quad-bulged thighs, diamond calves ------------------------
    for (const side of [-1, 1]) {
        const thigh = buildParamMesh("thighBody", 14, 20, (v, theta) => {
            const y = 0.93 - 0.51 * v;
            const deg = theta / DEG;
            let r = profileAt([[0, 0.105], [0.35, 0.096], [0.75, 0.077], [1, 0.057]], v);
            r += 0.014 * bell(y, 0.70, 0.14) * angGauss(deg, 0, 55);     // quadriceps
            r += 0.010 * bell(y, 0.64, 0.12) * angGauss(deg, 180, 50);   // hamstrings
            const cx = side * (0.115 - 0.012 * v);
            return new Vector3(cx + Math.sin(theta) * r, y, -Math.cos(theta) * r);
        }, scene);
        thigh.material = skin;

        const knee = CreateSphere("kneeBody", { diameter: 0.115, segments: 12 }, scene);
        knee.scaling.set(1, 1.1, 1.05);
        knee.position.set(side * 0.108, 0.40, -0.005);
        knee.material = skin;

        const calf = buildParamMesh("calfBody", 14, 20, (v, theta) => {
            const y = 0.42 - 0.345 * v;
            const deg = theta / DEG;
            let r = profileAt([[0, 0.060], [0.35, 0.070], [0.68, 0.055], [1, 0.040]], v);
            r += 0.018 * bell(y, 0.29, 0.075) * angGauss(deg, 180, 40);  // gastrocnemius
            r += 0.008 * bell(y, 0.30, 0.07) * (angGauss(deg, 150, 35) + angGauss(deg, 210, 35));
            r += 0.006 * bell(y, 0.22, 0.10) * angGauss(deg, 0, 35);     // shin
            const cx = side * (0.105 + 0.010 * v);
            return new Vector3(cx + Math.sin(theta) * r, y, -0.006 * v - Math.cos(theta) * r);
        }, scene);
        calf.material = skin;

        // Bare foot (the sneakers are clothing).
        const foot = CreateSphere("footBody", { diameter: 0.19, segments: 12 }, scene);
        foot.scaling.set(0.75, 0.42, 1.45);
        foot.position.set(side * 0.115, 0.045, -0.05);
        foot.rotation.y = -side * 0.2;
        foot.material = skin;
    }

    // ---- arms: biceps/triceps mass tapering to narrow wrists --------------
    // Nearly straight, hanging slightly away from the body (A-pose).
    const armPivots: TransformNode[] = [];
    for (const side of [-1, 1]) {
        const pivot = new TransformNode(`armPivotBody${side}`, scene);
        pivot.position.set(side * 0.205, 1.455, 0);
        pivot.rotation.z = side * 0.10;

        const upper = buildParamMesh("upperArmBody", 10, 16, (v, theta) => {
            const y = -0.005 - 0.35 * v;
            const deg = theta / DEG;
            let r = profileAt([[0, 0.058], [0.4, 0.055], [1, 0.046]], v);
            r += 0.013 * bell(y, -0.14, 0.09) * angGauss(deg, 0, 45);    // biceps
            r += 0.010 * bell(y, -0.17, 0.10) * angGauss(deg, 180, 45);  // triceps
            r += 0.008 * bell(y, -0.02, 0.05);                            // delt tie-in
            const cx = side * 0.012;
            return new Vector3(cx + Math.sin(theta) * r, y, -Math.cos(theta) * r);
        }, scene);
        upper.material = skin;
        upper.parent = pivot;

        const elbow = CreateSphere("elbowBody", { diameter: 0.092, segments: 12 }, scene);
        elbow.position.set(side * 0.012, -0.35, 0);
        elbow.material = skin;
        elbow.parent = pivot;

        const fore = buildParamMesh("foreArmBody", 10, 16, (v, theta) => {
            const y = -0.345 - 0.255 * v;
            const r = profileAt([[0, 0.047], [0.3, 0.051], [0.7, 0.042], [1, 0.032]], v);
            const cx = side * 0.012;
            return new Vector3(cx + Math.sin(theta) * r, y, -Math.cos(theta) * r);
        }, scene);
        fore.material = skin;
        fore.parent = pivot;

        // ---- fingered hand: palm, four curled fingers, thumb ----------------
        const palm = CreateSphere("palm", { diameter: 0.1, segments: 12 }, scene);
        palm.scaling.set(0.72, 1.15, 0.42);
        palm.position.set(side * 0.012, -0.655, -0.005);
        palm.material = skin;
        palm.parent = pivot;

        const fingerSpecs: [number, number][] = [
            [-0.027, 0.062], [-0.009, 0.068], [0.009, 0.063], [0.027, 0.050], // [x, length]
        ];
        for (let f = 0; f < fingerSpecs.length; f++) {
            const [fx, len] = fingerSpecs[f];
            const finger = CreateCapsule(`finger${f}`, { radius: 0.0105, height: len }, scene);
            finger.position.set(
                side * 0.012 + fx,
                -0.712 - (len / 2) * Math.cos(0.3),
                -0.005 - (len / 2) * Math.sin(0.3),
            );
            finger.rotation.x = 0.3; // relaxed curl toward the palm front
            finger.rotation.y = (f - 1.5) * 0.06; // natural splay
            finger.material = skin;
            finger.parent = pivot;
        }

        const thumb = CreateCapsule("thumb", { radius: 0.0125, height: 0.055 }, scene);
        thumb.position.set(side * 0.042, -0.665, -0.015);
        thumb.rotation.z = side * 0.55;
        thumb.rotation.x = 0.25;
        thumb.material = skin;
        thumb.parent = pivot;

        armPivots.push(pivot);
    }

    // ---- head group ---------------------------------------------------------
    const headPivot = new TransformNode("headPivotBody", scene);
    headPivot.position.set(0, 1.585, 0);

    const head = CreateSphere("headBody", { diameter: 0.25, segments: 24 }, scene);
    head.position.y = 0.123;
    head.material = skin;
    head.parent = headPivot;

    const jaw = CreateSphere("jawBody", { diameter: 0.25, segments: 16 }, scene);
    jaw.scaling.set(0.85, 0.62, 0.92);
    jaw.position.set(0, 0.078, 0.004);
    jaw.material = skin;
    jaw.parent = headPivot;

    // Ears (visible when the hood is toggled off).
    for (const side of [-1, 1]) {
        const ear = CreateSphere("ear", { diameter: 0.045, segments: 8 }, scene);
        ear.scaling.set(0.5, 0.8, 0.7);
        ear.position.set(side * 0.118, 0.128, 0.012);
        ear.material = skin;
        ear.parent = headPivot;
    }

    return { skin, torso, armPivots, headPivot };
};
