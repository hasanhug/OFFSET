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
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { createCapeTexture, createShadowTexture } from "./agentTextures";
import { mulberry32, smoothstep } from "./noise";

/**
 * Agent Jones — the hooded wanderer from the reference image, in a
 * Fortnite-style build: layered gear over an athletic procedural body and a
 * fully geometric face (no texture tricks to misplace — every feature is a
 * mesh you can see). All procedural, no model files.
 *
 * Conventions: he faces -Z (theta = 180°), his right hand side is +X.
 * Height ~1.83 units, ~7.5-head stylized-hero proportions.
 */

const DEG = Math.PI / 180;

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
const SCLERA = "#F4F2ED";
const IRIS = "#7A93A0";
const PUPIL = "#1E2427";
const BROW = "#B08A48";
const LID = "#7A5B43";
const BELT = "#6B4F38";
const BRASS = "#B08D57";
const POCKET = "#757166";
const FLAP = "#615C54";
const LACE = "#CFC9BB";
const TOE = "#E8E4DA";
const WRIST = "#E2DFD6";
const CURLS = ["#C9A266", "#BE9757", "#D3AC72"];

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
 * Sphere-shell segment as a custom mesh — hoods, wraps, mantles. Unlike
 * CreateSphere's slice, the opening direction is exactly controlled.
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
    const skinMat = matte("aSkin", SKIN, scene);
    const sleeveMat = matte("aSleeve", SLEEVE, scene);
    const teeMat = matte("aTee", TEE, scene);
    const pantsMat = matte("aPants", PANTS, scene);
    const cuffMat = matte("aCuff", CUFF, scene);
    const shoeMat = matte("aShoe", SHOE, scene);
    const soleMat = matte("aSole", SOLE, scene);
    const scleraMat = matte("aSclera", SCLERA, scene);
    const irisMat = matte("aIris", IRIS, scene);
    const pupilMat = matte("aPupil", PUPIL, scene);
    const lidMat = matte("aLid", LID, scene);
    const browMat = matte("aBrow", BROW, scene);
    const beltMat = matte("aBelt", BELT, scene);
    const brassMat = matte("aBrass", BRASS, scene);
    const pocketMat = matte("aPocket", POCKET, scene);
    const flapMat = matte("aFlap", FLAP, scene);
    const laceMat = matte("aLace", LACE, scene);
    const toeMat = matte("aToe", TOE, scene);
    const wristMat = matte("aWrist", WRIST, scene);
    const curlMats = CURLS.map((hex, i) => matte(`aCurl${i}`, hex, scene));

    const hoodMat = fabric("aHood", HOOD, scene);
    const wrapMat = fabric("aWrap", WRAP, scene);
    const capeMat = fabric("aCape", "#9C7A55", scene);
    capeMat.diffuseTexture = createCapeTexture(scene);

    // ---- legs & feet ------------------------------------------------------
    for (const side of [-1, 1]) {
        const thigh = CreateCapsule("thigh", { radius: 0.078, height: 0.46 }, scene);
        thigh.position.set(side * 0.12, 0.70, 0);

        const calf = CreateCapsule("calf", { radius: 0.058, height: 0.42 }, scene);
        calf.position.set(side * 0.12, 0.31, 0);

        const cuff = CreateTorus("cuff", { diameter: 0.125, thickness: 0.028, tessellation: 24 }, scene);
        cuff.position.set(side * 0.12, 0.135, 0);

        // Cargo pocket with flap, on the front of each thigh.
        const pocket = CreateBox("pocket", { width: 0.085, height: 0.10, depth: 0.035 }, scene);
        pocket.position.set(side * 0.10, 0.64, -0.062);
        pocket.rotation.y = -side * 0.18;

        const flap = CreateBox("pocketFlap", { width: 0.09, height: 0.028, depth: 0.04 }, scene);
        flap.position.set(side * 0.10, 0.70, -0.064);
        flap.rotation.y = -side * 0.18;

        // Knee pad.
        const knee = CreateSphere("kneePad", { diameter: 0.11, segments: 12 }, scene);
        knee.scaling.set(0.85, 1.05, 0.65);
        knee.position.set(side * 0.12, 0.50, -0.045);

        // Sneakers: body, sole, toe cap and a lace strip.
        const shoe = CreateSphere("shoe", { diameter: 0.19, segments: 16 }, scene);
        shoe.scaling.set(0.75, 0.5, 1.5);
        shoe.position.set(side * 0.12, 0.048, -0.03);
        shoe.rotation.y = -side * 0.12;

        const soleMesh = CreateSphere("sole", { diameter: 0.20, segments: 16 }, scene);
        soleMesh.scaling.set(0.78, 0.28, 1.55);
        soleMesh.position.set(side * 0.12, 0.016, -0.03);
        soleMesh.rotation.y = shoe.rotation.y;

        const toeCap = CreateSphere("toeCap", { diameter: 0.155, segments: 12 }, scene);
        toeCap.scaling.set(0.74, 0.44, 0.75);
        toeCap.position.set(side * 0.12, 0.032, -0.092);
        toeCap.rotation.y = shoe.rotation.y;

        const lace = CreateBox("lace", { width: 0.07, height: 0.012, depth: 0.055 }, scene);
        lace.position.set(side * 0.12, 0.085, -0.048);
        lace.rotation.x = -0.35;

        thigh.material = pantsMat;
        calf.material = pantsMat;
        cuff.material = cuffMat;
        pocket.material = pocketMat;
        flap.material = flapMat;
        knee.material = flapMat;
        shoe.material = shoeMat;
        soleMesh.material = soleMat;
        toeCap.material = toeMat;
        lace.material = laceMat;
    }

    // ---- hips, belt, torso -------------------------------------------------
    const hips = CreateSphere("hips", { diameter: 0.29, segments: 24 }, scene);
    hips.scaling.set(1, 0.72, 0.85);
    hips.position.y = 0.93;
    hips.material = pantsMat;

    // Belt with a brass buckle at the front.
    const belt = CreateTorus("belt", { diameter: 0.245, thickness: 0.038, tessellation: 32 }, scene);
    belt.position.y = 1.03;
    belt.material = beltMat;

    const buckle = CreateBox("buckle", { width: 0.055, height: 0.04, depth: 0.016 }, scene);
    buckle.position.set(0, 1.03, -0.132);
    buckle.material = brassMat;

    // Athletic torso: broad chest, tapered waist.
    const torso = CreateLathe("torso", {
        tessellation: 48,
        shape: [
            new Vector3(0.02, 0.92),
            new Vector3(0.13, 0.96),
            new Vector3(0.108, 1.08),
            new Vector3(0.132, 1.20),
            new Vector3(0.152, 1.32),
            new Vector3(0.155, 1.42),
            new Vector3(0.098, 1.48),
            new Vector3(0.054, 1.51),
            new Vector3(0.02, 1.53),
        ],
    }, scene);
    torso.material = teeMat;

    // White tee panel showing at the chest between collar and cape sash.
    const teePanel = CreateSphere("teePanel", { diameter: 0.11, segments: 16 }, scene);
    teePanel.scaling.set(1.6, 1.9, 0.22);
    teePanel.position.set(0, 1.36, -0.141);
    teePanel.material = teeMat;

    // Shoulder caps blend the white sleeves into the torso.
    for (const side of [-1, 1]) {
        const cap = CreateSphere("shoulderCap", { diameter: 0.09, segments: 12 }, scene);
        cap.position.set(side * 0.145, 1.435, 0);
        cap.material = sleeveMat;
    }

    // ---- arms: white sleeves, wrist cuffs, hands with thumbs ----------------
    const armPivots: TransformNode[] = [];
    for (const side of [-1, 1]) {
        const pivot = new TransformNode(`armPivot${side}`, scene);
        pivot.position.set(side * 0.19, 1.44, 0);
        pivot.rotation.z = side * 0.14; // relaxed A-pose, slightly out

        const upper = CreateCapsule("upperArm", { radius: 0.048, height: 0.32 }, scene);
        upper.position.set(side * 0.01, -0.17, 0);

        const fore = CreateCapsule("foreArm", { radius: 0.043, height: 0.30 }, scene);
        fore.position.set(side * 0.03, -0.46, 0);

        const wrist = CreateTorus("wristCuff", { diameter: 0.105, thickness: 0.028, tessellation: 20 }, scene);
        wrist.position.set(side * 0.03, -0.60, 0);
        wrist.rotation.x = Math.PI / 2;

        const hand = CreateSphere("hand", { diameter: 0.096, segments: 12 }, scene);
        hand.scaling.set(0.85, 1.15, 0.8);
        hand.position.set(side * 0.036, -0.675, 0);

        const thumb = CreateCapsule("thumb", { radius: 0.016, height: 0.05 }, scene);
        thumb.position.set(side * 0.012, -0.66, -0.012);
        thumb.rotation.z = side * 0.5;

        upper.material = sleeveMat;
        fore.material = sleeveMat;
        wrist.material = wristMat;
        hand.material = skinMat;
        thumb.material = skinMat;
        for (const mesh of [upper, fore, wrist, hand, thumb]) mesh.parent = pivot;
        armPivots.push(pivot);
    }

    // Neck.
    const neck = CreateCapsule("neck", { radius: 0.048, height: 0.14 }, scene);
    neck.position.y = 1.53;
    neck.material = skinMat;

    // ---- head group ----------------------------------------------------------
    const headPivot = new TransformNode("headPivot", scene);
    headPivot.position.set(0, 1.58, 0);

    const head = CreateSphere("head", { diameter: 0.25, segments: 24 }, scene);
    head.position.y = 0.12;
    head.material = skinMat;
    head.parent = headPivot;

    // Jaw: narrows the ball into a chin.
    const jaw = CreateSphere("jaw", { diameter: 0.25, segments: 16 }, scene);
    jaw.scaling.set(0.85, 0.62, 0.92);
    jaw.position.set(0, 0.075, 0.004);
    jaw.material = skinMat;
    jaw.parent = headPivot;

    // Eyes: white spheres set into the face, iris and pupil discs on top,
    // catchlight, upper lid line and eyebrows. All real geometry.
    for (const side of [-1, 1]) {
        const eyeball = CreateSphere("eyeball", { diameter: 0.034, segments: 12 }, scene);
        eyeball.position.set(side * 0.036, 0.128, -0.108);

        const iris = CreateDisc("iris", { radius: 0.0085, tessellation: 16 }, scene);
        iris.rotation.y = Math.PI;
        iris.position.set(side * 0.036, 0.128, -0.1248);

        const pupil = CreateDisc("pupil", { radius: 0.0045, tessellation: 12 }, scene);
        pupil.rotation.y = Math.PI;
        pupil.position.set(side * 0.036, 0.128, -0.1251);

        const glint = CreateSphere("glint", { diameter: 0.0036, segments: 8 }, scene);
        glint.position.set(side * 0.036 + 0.004, 0.132, -0.1244);

        const lid = CreateBox("lid", { width: 0.042, height: 0.005, depth: 0.01 }, scene);
        lid.position.set(side * 0.036, 0.143, -0.1175);
        lid.rotation.x = -0.15;

        const brow = CreateBox("brow", { width: 0.052, height: 0.009, depth: 0.013 }, scene);
        brow.position.set(side * 0.038, 0.156, -0.112);
        brow.rotation.z = -side * 0.10;
        brow.rotation.x = -0.30;

        eyeball.material = scleraMat;
        iris.material = irisMat;
        pupil.material = pupilMat;
        glint.material = scleraMat;
        lid.material = lidMat;
        brow.material = browMat;
        for (const mesh of [eyeball, iris, pupil, glint, lid, brow]) mesh.parent = headPivot;
    }

    // Nose: ridge plus a rounded tip, poking past the wrap.
    const noseBridge = CreateSphere("noseBridge", { diameter: 0.033, segments: 12 }, scene);
    noseBridge.scaling.set(0.85, 1.0, 0.55);
    noseBridge.position.set(0, 0.106, -0.1175);
    noseBridge.rotation.x = -0.2;

    const noseTip = CreateSphere("noseTip", { diameter: 0.03, segments: 12 }, scene);
    noseTip.scaling.set(1, 0.9, 0.9);
    noseTip.position.set(0, 0.088, -0.1275);

    noseBridge.material = skinMat;
    noseTip.material = skinMat;
    noseBridge.parent = headPivot;
    noseTip.parent = headPivot;

    // Curly blond fringe: a scatter of small spheres along the hairline,
    // peeking out from under the hood.
    const rng = mulberry32(2024);
    for (let i = 0; i < 15; i++) {
        const curl = CreateSphere(`curl${i}`, { diameter: 0.028 + rng() * 0.02, segments: 10 }, scene);
        const phi = (50 + rng() * 14) * DEG;
        const theta = (148 + rng() * 64) * DEG;
        const radius = 0.121 + rng() * 0.004;
        curl.position.set(
            radius * Math.sin(phi) * Math.sin(theta),
            0.12 + radius * Math.cos(phi),
            radius * Math.sin(phi) * Math.cos(theta),
        );
        curl.scaling.y = 0.85;
        curl.material = curlMats[(rng() * curlMats.length) | 0];
        curl.parent = headPivot;
    }
    // One longer curl at each temple.
    for (const side of [-1, 1]) {
        const curl = CreateSphere(`curlSide${side}`, { diameter: 0.034, segments: 10 }, scene);
        curl.position.set(side * 0.093, 0.165, -0.078);
        curl.scaling.y = 1.3;
        curl.material = curlMats[1];
        curl.parent = headPivot;
    }

    // Face wrap: fabric shell from just under the nose down over the chin
    // and the upper neck (strictly outside the head sphere).
    const wrap = createShell("faceWrap", {
        radius: 0.127,
        phiStart: 94, phiEnd: 150,
        thetaStart: 95, thetaEnd: 265,
        centerY: 0.12,
        rows: 8, cols: 14,
    }, scene);
    wrap.material = wrapMat;
    wrap.parent = headPivot;

    // Hood: cowl over crown/back/sides, opening facing -Z, plus a back peak
    // and a drape behind the neck.
    const hood = createShell("hood", {
        radius: 0.148,
        phiStart: 6, phiEnd: 118,
        thetaStart: 245, thetaEnd: 475, // 130° opening centred on the face
        centerY: 0.132,
        cz: 0.012,
        scaleY: 1.08,
        rows: 10, cols: 16,
    }, scene);
    hood.material = hoodMat;
    hood.parent = headPivot;

    const peak = CreateCylinder("hoodPeak", { diameterBottom: 0.10, diameterTop: 0.004, height: 0.14, tessellation: 12 }, scene);
    peak.position.set(0, 0.235, 0.115);
    peak.rotation.x = 0.55;
    peak.material = hoodMat;
    peak.parent = headPivot;

    const hoodDrape = createShell("hoodDrape", {
        radius: 0.140,
        phiStart: 112, phiEnd: 154,
        thetaStart: 250, thetaEnd: 470,
        centerY: 0.12,
        cz: 0.012,
        scaleY: 1.08,
        rows: 6, cols: 14,
    }, scene);
    hoodDrape.material = hoodMat;
    hoodDrape.parent = headPivot;

    // ---- cape ------------------------------------------------------------------
    const collar = CreateTorus("collar", { diameter: 0.22, thickness: 0.07, tessellation: 32 }, scene);
    collar.position.y = 1.52;
    collar.material = matte("aCapeTrim", "#9C7A55", scene);

    // Shoulder mantle: a cape yoke band over the shoulders.
    const mantle = createShell("mantle", {
        radius: 0.20,
        phiStart: 80, phiEnd: 102,
        thetaStart: 245, thetaEnd: 475,
        centerY: 1.47,
        rows: 5, cols: 16,
    }, scene);
    mantle.material = capeMat;

    // Clasp where the sash meets the collar.
    const clasp = CreateCylinder("clasp", { diameter: 0.044, height: 0.014, tessellation: 12 }, scene);
    clasp.rotation.x = Math.PI / 2;
    clasp.position.set(0.02, 1.38, -0.152);
    clasp.material = brassMat;

    const capeSheet = buildCapeSheet(scene);
    capeSheet.material = capeMat;

    const chestPanel = buildChestPanel(scene);
    chestPanel.material = capeMat;

    // ---- soft blob shadow --------------------------------------------------------
    const shadow = CreateDisc("agentShadow", { radius: 0.42, tessellation: 32 }, scene);
    shadow.rotation.x = Math.PI / 2;
    shadow.position.y = 0.012;
    const shadowMat = new StandardMaterial("aShadowMat", scene);
    shadowMat.diffuseTexture = createShadowTexture(scene);
    shadowMat.diffuseTexture.hasAlpha = true;
    shadowMat.useAlphaFromDiffuseTexture = true;
    shadowMat.disableLighting = true;
    shadowMat.specularColor = Color3.Black();
    shadow.material = shadowMat;

    // ---- idle animation ------------------------------------------------------------
    const swayMeshes = [capeSheet, chestPanel].map((mesh) => ({
        mesh,
        base: (mesh.getVerticesData(VertexBuffer.PositionKind) as Float32Array).slice(),
        work: (mesh.getVerticesData(VertexBuffer.PositionKind) as Float32Array).slice(),
        normals: new Float32Array((mesh.getVerticesData(VertexBuffer.PositionKind) as Float32Array).length),
        indices: mesh.getIndices()!,
    }));

    scene.onBeforeRenderObservable.add(() => {
        const t = performance.now() * 0.001;

        // Breathing.
        const breathe = 1 + 0.012 * Math.sin(t * 1.5);
        torso.scaling.x = breathe;
        torso.scaling.z = breathe;
        teePanel.scaling.x = 1.6 * (1 + (breathe - 1) * 1.5);
        chestPanel.scaling.x = 1 + (breathe - 1) * 0.5;
        chestPanel.scaling.z = 1 + (breathe - 1) * 0.5;
        collar.scaling.x = 1 + (breathe - 1) * 0.5;
        collar.scaling.z = 1 + (breathe - 1) * 0.5;

        // Slow look-around with an occasional tilt.
        headPivot.rotation.y = 0.35 * Math.sin(t * 0.21) + 0.15 * Math.sin(t * 0.09 + 2.0);
        headPivot.rotation.z = 0.05 * Math.sin(t * 0.15 + 1.0);

        // Arm micro-sway on top of the A-pose.
        armPivots[0].rotation.z = -0.14 - 0.02 * Math.sin(t * 0.6);
        armPivots[1].rotation.z = 0.14 + 0.02 * Math.sin(t * 0.6 + 0.5);
        armPivots[0].rotation.x = 0.03 * Math.sin(t * 0.8);
        armPivots[1].rotation.x = 0.03 * Math.sin(t * 0.8 + 1.3);

        // Wind through the hanging fabric.
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

/** The hanging cape sheet. Convention: theta 245..475, back centre = 360. */
const buildCapeSheet = (scene: Scene): Mesh => {
    const rows = 12;
    const cols = 16;
    const TOP_Y = 1.44;
    const R_TOP = 0.215;
    const FLARE = 0.12;

    const hemY = (thetaDeg: number): number => {
        const t = ((thetaDeg - 360 + 540) % 360) - 180; // -180..180, 0 = back
        const rise = smoothstep(55, 115, Math.abs(t));
        let y = 0.80 + 0.14 * rise;
        if (t > 30) {
            y -= 0.30 * smoothstep(30, 60, t) * (1 - smoothstep(105, 115, t)); // long right-side tail
        }
        return y;
    };

    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= rows; i++) {
        for (let j = 0; j <= cols; j++) {
            const thetaDeg = 245 + ((475 - 245) * j) / cols;
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
