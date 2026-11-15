import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateLathe } from "@babylonjs/core/Meshes/Builders/latheBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { createCapeTexture, createFaceTexture, createShadowTexture } from "./agentTextures";
import { smoothstep } from "./noise";

/**
 * Agent Jones — the hooded wanderer from the reference image, built entirely
 * from smooth procedural geometry (lathe torso, capsules, sculpted sphere
 * shells for hood/wrap/face) with canvas-painted textures. He stands at the
 * world centre facing the default camera, breathing and looking around while
 * the wind tugs at his cape.
 *
 * Conventions: he faces -Z (theta = 180°), his right hand side is +X.
 * Total height ~1.8 units, realistic 8-head proportions, lean build.
 */

const DEG = Math.PI / 180;
const HEAD_Y = 1.69;

// Palette from the reference image.
const SKIN = "#E8C4A8";
const HOOD = "#A9825F";
const WRAP = "#B08A64";
const SLEEVE = "#F2F0EA";
const TEE = "#EFEDE6";
const PANTS = "#6B675F";
const CUFF = "#5F5B54";
const SHOE = "#D9D4C8";
const SOLE = "#B8B2A4";

const matte = (name: string, hex: string, scene: Scene): StandardMaterial => {
    const material = new StandardMaterial(name, scene);
    material.diffuseColor = Color3.FromHexString(hex);
    material.specularColor = Color3.Black();
    return material;
};

/** Fabric material: double-sided with corrected back-face lighting. */
const fabric = (name: string, hex: string, scene: Scene): StandardMaterial => {
    const material = matte(name, hex, scene);
    material.backFaceCulling = false;
    material.twoSidedLighting = true;
    return material;
};

interface ShellOptions {
    radius: number;
    phiStart: number;   // degrees from the top pole
    phiEnd: number;
    thetaStart: number; // degrees, 0 = +Z (his back), 180 = -Z (his face)
    thetaEnd: number;
    centerY: number;
    cx?: number;
    cz?: number;
    scaleY?: number;
    rows?: number;
    cols?: number;
}

/**
 * Sphere-shell segment as a custom mesh — used for the hood, the face wrap
 * and the painted face overlay. Unlike CreateSphere's slice, the opening
 * direction is exactly controlled.
 */
const createShell = (name: string, o: ShellOptions, scene: Scene): Mesh => {
    const rows = o.rows ?? 10;
    const cols = o.cols ?? 12;
    const scaleY = o.scaleY ?? 1;
    const cx = o.cx ?? 0;
    const cz = o.cz ?? 0;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= rows; i++) {
        const phi = (o.phiStart + ((o.phiEnd - o.phiStart) * i) / rows) * DEG;
        const cosPhi = Math.cos(phi);
        const sinPhi = Math.sin(phi);
        for (let j = 0; j <= cols; j++) {
            const theta = (o.thetaStart + ((o.thetaEnd - o.thetaStart) * j) / cols) * DEG;
            positions.push(
                cx + o.radius * sinPhi * Math.sin(theta),
                o.centerY + o.radius * scaleY * cosPhi,
                cz + o.radius * sinPhi * Math.cos(theta),
            );
            uvs.push(j / cols, 1 - i / rows);
        }
    }
    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            const a = i * (cols + 1) + j;
            const b = a + 1;
            const c = a + cols + 1;
            const d = c + 1;
            indices.push(a, b, d, a, d, c);
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
    vertexData.applyToMesh(mesh, true);
    return mesh;
};

export const createAgent = (scene: Scene): void => {
    // ---- materials -----------------------------------------------------
    const skinMat = matte("agentSkin", SKIN, scene);
    const sleeveMat = matte("agentSleeve", SLEEVE, scene);
    const teeMat = matte("agentTee", TEE, scene);
    const pantsMat = matte("agentPants", PANTS, scene);
    const cuffMat = matte("agentCuff", CUFF, scene);
    const shoeMat = matte("agentShoe", SHOE, scene);
    const soleMat = matte("agentSole", SOLE, scene);
    const hoodMat = fabric("agentHood", HOOD, scene);
    const wrapMat = fabric("agentWrap", WRAP, scene);

    const capeMat = fabric("agentCape", "#9C7A55", scene);
    capeMat.diffuseTexture = createCapeTexture(scene);

    const faceMat = fabric("agentFace", "#FFFFFF", scene);
    faceMat.diffuseTexture = createFaceTexture(scene);
    faceMat.diffuseTexture.hasAlpha = true;
    faceMat.useAlphaFromDiffuseTexture = true;

    // ---- body ----------------------------------------------------------
    // Legs: thigh + calf capsules overlapping at the knee, cargo pants.
    for (const side of [-1, 1]) {
        const thigh = CreateCapsule("thigh", { radius: 0.075, height: 0.46 }, scene);
        thigh.position.set(side * 0.11, 0.70, 0);

        const calf = CreateCapsule("calf", { radius: 0.055, height: 0.42 }, scene);
        calf.position.set(side * 0.11, 0.31, 0);

        const cuff = CreateTorus("cuff", { diameter: 0.115, thickness: 0.026, tessellation: 24 }, scene);
        cuff.position.set(side * 0.11, 0.135, 0);

        const shoe = CreateSphere("shoe", { diameter: 0.19, segments: 16 }, scene);
        shoe.scaling.set(0.75, 0.5, 1.5);
        shoe.position.set(side * 0.11, 0.048, -0.03);
        shoe.rotation.y = -side * 0.12; // slight toe-out

        const sole = CreateSphere("sole", { diameter: 0.20, segments: 16 }, scene);
        sole.scaling.set(0.78, 0.28, 1.55);
        sole.position.set(side * 0.11, 0.016, -0.03);
        sole.rotation.y = shoe.rotation.y;

        thigh.material = pantsMat;
        calf.material = pantsMat;
        cuff.material = cuffMat;
        shoe.material = shoeMat;
        sole.material = soleMat;
    }

    // Hips + torso: smooth lathe silhouette from hips to the neck base.
    const hips = CreateSphere("hips", { diameter: 0.28, segments: 24 }, scene);
    hips.scaling.set(1, 0.72, 0.85);
    hips.position.y = 0.93;
    hips.material = pantsMat;

    const torso = CreateLathe("torso", {
        tessellation: 48,
        shape: [
            new Vector3(0.02, 0.90),
            new Vector3(0.125, 0.94),
            new Vector3(0.108, 1.06),
            new Vector3(0.130, 1.18),
            new Vector3(0.148, 1.30),
            new Vector3(0.150, 1.40),
            new Vector3(0.095, 1.47),
            new Vector3(0.052, 1.50),
            new Vector3(0.02, 1.52),
        ],
    }, scene);
    torso.material = teeMat;

    // Shoulder caps blend the (visible) white sleeves into the torso.
    for (const side of [-1, 1]) {
        const cap = CreateSphere("shoulderCap", { diameter: 0.10, segments: 16 }, scene);
        cap.position.set(side * 0.155, 1.435, 0);
        cap.material = sleeveMat;
    }

    // Arms hang at the sides in white sleeves, skin hands; pivots at the
    // shoulders so they can micro-sway.
    const armPivots: TransformNode[] = [];
    for (const side of [-1, 1]) {
        const pivot = new TransformNode(`armPivot${side}`, scene);
        pivot.position.set(side * 0.175, 1.44, 0);

        const upper = CreateCapsule("upperArm", { radius: 0.047, height: 0.32 }, scene);
        upper.position.set(side * 0.012, -0.17, 0);

        const fore = CreateCapsule("foreArm", { radius: 0.042, height: 0.30 }, scene);
        fore.position.set(side * 0.03, -0.46, 0);

        const hand = CreateSphere("hand", { diameter: 0.085, segments: 16 }, scene);
        hand.position.set(side * 0.033, -0.63, 0);

        upper.material = sleeveMat;
        fore.material = sleeveMat;
        hand.material = skinMat;
        for (const mesh of [upper, fore, hand]) mesh.parent = pivot;
        armPivots.push(pivot);
    }

    // Neck (mostly hidden by the wrap and collar).
    const neck = CreateCapsule("neck", { radius: 0.045, height: 0.14 }, scene);
    neck.position.y = 1.53;
    neck.material = skinMat;

    // ---- head group ------------------------------------------------------
    // Everything face-related hangs off one pivot at the neck so he can
    // slowly look around.
    const headPivot = new TransformNode("headPivot", scene);
    headPivot.position.set(0, 1.575, 0);

    const head = CreateSphere("head", { diameter: 0.23, segments: 24 }, scene);
    head.position.y = HEAD_Y - 1.575;
    head.material = skinMat;
    head.parent = headPivot;

    // Painted face overlay: a shell hugging the front of the head.
    const face = createShell("faceOverlay", {
        radius: 0.1165,
        phiStart: 55, phiEnd: 135,     // hairline down past the chin
        thetaStart: 150, thetaEnd: 210, // centred on his face (-Z)
        centerY: head.position.y,
        cz: 0.004,
        rows: 12, cols: 10,
    }, scene);
    face.material = faceMat;
    face.parent = headPivot;

    // Face wrap: fabric shell over nose, mouth, chin and upper neck.
    const wrap = createShell("faceWrap", {
        radius: 0.118,
        phiStart: 62, phiEnd: 150,
        thetaStart: 110, thetaEnd: 250,
        centerY: head.position.y,
        cz: 0.004,
        rows: 10, cols: 14,
    }, scene);
    wrap.material = wrapMat;
    wrap.parent = headPivot;

    // Hood: cowl over crown/back/sides with the opening facing -Z, plus a
    // drape behind the neck down towards the collar.
    const hood = createShell("hood", {
        radius: 0.140,
        phiStart: 8, phiEnd: 118,
        thetaStart: 235, thetaEnd: 485, // 250° coverage, opening centred on the face
        centerY: head.position.y + 0.012,
        cz: 0.01,
        scaleY: 1.12,
        rows: 10, cols: 16,
    }, scene);
    hood.material = hoodMat;
    hood.parent = headPivot;

    const hoodDrape = createShell("hoodDrape", {
        radius: 0.135,
        phiStart: 112, phiEnd: 156,
        thetaStart: 250, thetaEnd: 470,
        centerY: head.position.y + 0.012,
        cz: 0.01,
        scaleY: 1.12,
        rows: 6, cols: 14,
    }, scene);
    hoodDrape.material = hoodMat;
    hoodDrape.parent = headPivot;

    // ---- cape --------------------------------------------------------------
    // Cape collar ring where hood, cape and neck meet.
    const collar = CreateTorus("collar", { diameter: 0.22, thickness: 0.07, tessellation: 32 }, scene);
    collar.position.y = 1.52;
    collar.material = matte("agentCapeTrim", "#9C7A55", scene);

    // Back sheet: hangs from the shoulder line, wrapping ~250° around the
    // body, open at the front. Hem rises towards the front edges and drops
    // into a long tail on his right side (like the reference).
    const capeSheet = buildCapeSheet(scene);
    capeSheet.material = capeMat;

    // Chest panel: the diagonal drape crossing from his right shoulder to
    // his left waist.
    const chestPanel = buildChestPanel(scene);
    chestPanel.material = capeMat;

    // ---- soft blob shadow ------------------------------------------------
    const shadow = CreateDisc("agentShadow", { radius: 0.36, tessellation: 32 }, scene);
    shadow.rotation.x = Math.PI / 2;
    shadow.position.y = 0.012;
    const shadowMat = new StandardMaterial("agentShadowMat", scene);
    shadowMat.diffuseTexture = createShadowTexture(scene);
    shadowMat.diffuseTexture.hasAlpha = true;
    shadowMat.useAlphaFromDiffuseTexture = true;
    shadowMat.disableLighting = true;
    shadowMat.specularColor = Color3.Black();
    shadow.material = shadowMat;

    // ---- idle animation ----------------------------------------------------
    // Wind-affected meshes keep their rest pose so the sway can be applied
    // on top every frame.
    const swayMeshes = [capeSheet, chestPanel].map((mesh) => ({
        mesh,
        base: (mesh.getVerticesData(VertexBuffer.PositionKind) as Float32Array).slice(),
        work: (mesh.getVerticesData(VertexBuffer.PositionKind) as Float32Array).slice(),
        normals: new Float32Array((mesh.getVerticesData(VertexBuffer.PositionKind) as Float32Array).length),
        indices: mesh.getIndices()!,
    }));

    scene.onBeforeRenderObservable.add(() => {
        const t = performance.now() * 0.001;

        // Breathing: gentle chest swell.
        const breathe = 1 + 0.012 * Math.sin(t * 1.5);
        torso.scaling.x = breathe;
        torso.scaling.z = breathe;
        chestPanel.scaling.x = 1 + (breathe - 1) * 0.5;
        chestPanel.scaling.z = 1 + (breathe - 1) * 0.5;
        collar.scaling.x = 1 + (breathe - 1) * 0.5;
        collar.scaling.z = 1 + (breathe - 1) * 0.5;

        // Slow look-around with an occasional tilt.
        headPivot.rotation.y = 0.35 * Math.sin(t * 0.21) + 0.15 * Math.sin(t * 0.09 + 2.0);
        headPivot.rotation.z = 0.05 * Math.sin(t * 0.15 + 1.0);

        // Arm micro-sway.
        armPivots[0].rotation.x = 0.03 * Math.sin(t * 0.8);
        armPivots[1].rotation.x = 0.03 * Math.sin(t * 0.8 + 1.3);
        armPivots[0].rotation.z = -0.02 * Math.sin(t * 0.6);
        armPivots[1].rotation.z = 0.02 * Math.sin(t * 0.6 + 0.5);

        // Wind: traveling waves through the hanging fabric, strongest at
        // the hem, calm at the shoulders. Direction roughly matches the
        // cloud drift (+X with a little +Z).
        for (const entry of swayMeshes) {
            const amp = entry.mesh === capeSheet ? 0.035 : 0.008;
            const { base, work, normals, indices } = entry;
            for (let i = 0; i < base.length; i += 3) {
                const y = base[i + 1];
                const hemWeight = Math.min(1, Math.max(0, (1.5 - y) / 0.95));
                const phase = t * 1.9 + y * 5.0 + base[i] * 2.0;
                const sway = (Math.sin(phase) * 0.6 + Math.sin(phase * 0.53 + 1.7) * 0.4) * amp * hemWeight;
                work[i] = base[i] + sway;
                work[i + 1] = y - Math.abs(sway) * 0.15;
                work[i + 2] = base[i + 2] + sway * 0.35;
            }
            VertexData.ComputeNormals(work, indices, normals);
            entry.mesh.updateVerticesData(VertexBuffer.PositionKind, work);
            entry.mesh.updateVerticesData(VertexBuffer.NormalKind, normals);
        }
    });
};

/** The hanging cape sheet. Convention: theta 235..485, back centre = 360. */
const buildCapeSheet = (scene: Scene): Mesh => {
    const rows = 12;
    const cols = 16;
    const TOP_Y = 1.46;
    const R_TOP = 0.20;
    const FLARE = 0.18;

    const hemY = (thetaDeg: number): number => {
        const t = ((thetaDeg - 360 + 540) % 360) - 180; // -180..180, 0 = back
        const rise = smoothstep(60, 125, Math.abs(t));
        let y = 0.80 + 0.14 * rise;
        if (t > 30) {
            y -= 0.30 * smoothstep(30, 60, t) * (1 - smoothstep(115, 125, t));
        }
        return y;
    };

    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= rows; i++) {
        for (let j = 0; j <= cols; j++) {
            const thetaDeg = 235 + ((485 - 235) * j) / cols;
            const theta = thetaDeg * DEG;
            const hem = hemY(thetaDeg);
            const y = TOP_Y + (hem - TOP_Y) * (i / rows);
            const radius = R_TOP + (TOP_Y - y) * FLARE
                + 0.012 * Math.sin(thetaDeg * DEG * 5 + y * 6); // baked folds
            positions.push(Math.sin(theta) * radius, y, Math.cos(theta) * radius);
            uvs.push(j / cols, 1 - i / rows);
        }
    }
    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            const a = i * (cols + 1) + j;
            const b = a + 1;
            const c = a + cols + 1;
            const d = c + 1;
            indices.push(a, b, d, a, d, c);
        }
    }
    return finishCustomMesh("capeSheet", positions, uvs, indices, scene);
};

/** The diagonal front panel from his right shoulder to his left waist. */
const buildChestPanel = (scene: Scene): Mesh => {
    const rows = 8;
    const cols = 4;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= rows; i++) {
        for (let j = 0; j <= cols; j++) {
            const frac = i / rows;                       // 0 = right shoulder
            const thetaDeg = 130 + 100 * frac;           // ...to left waist
            const theta = thetaDeg * DEG;
            const yLine = 1.43 + (1.02 - 1.43) * frac;
            const across = (j / cols - 0.5) * 0.26;      // band width
            const radius = 0.155 + 0.015 * Math.sin(Math.PI * (j / cols));
            positions.push(
                Math.sin(theta) * radius,
                yLine + across,
                Math.cos(theta) * radius,
            );
            uvs.push(j / cols, 1 - frac);
        }
    }
    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            const a = i * (cols + 1) + j;
            const b = a + 1;
            const c = a + cols + 1;
            const d = c + 1;
            indices.push(a, b, d, a, d, c);
        }
    }
    return finishCustomMesh("chestPanel", positions, uvs, indices, scene);
};

const finishCustomMesh = (name: string, positions: number[], uvs: number[], indices: number[], scene: Scene): Mesh => {
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    const mesh = new Mesh(name, scene);
    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.uvs = uvs;
    vertexData.indices = indices;
    vertexData.normals = normals;
    vertexData.applyToMesh(mesh, true);
    return mesh;
};
