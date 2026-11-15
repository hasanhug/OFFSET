import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { createCapeTexture, createShadowTexture } from "./agentTextures";
import { smoothstep } from "./noise";
import {
    BodyBase,
    angGauss,
    bell,
    buildParamMesh,
    buildTorso,
    createBodyBase,
    profileAt,
} from "./agentBody";

/**
 * Agent Jones — the body from "Human body shape.jpg" (built in agentBody.ts)
 * dressed in the Agent Jones reference outfit: white tee under a hooded
 * cape with a diagonal chest panel, face wrap, white sleeves with skin
 * hands, cargo pants with pockets and knee pads, and sneakers. The face is
 * fully geometric (eyes, brows, nose, curly fringe).
 *
 * Press B to strip him to the raw base body and back, to compare the sculpt
 * against the reference sheet.
 */

const DEG = Math.PI / 180;

// Clothing palette from the Agent Jones image.
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

/** Sphere-shell segment with an exactly-controlled opening direction. */
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
    const body: BodyBase = createBodyBase(scene);
    const clothing: Mesh[] = []; // everything the B-key strips off

    // ---- materials -----------------------------------------------------
    const sleeveMat = matte("cSleeve", SLEEVE, scene);
    const teeMat = matte("cTee", TEE, scene);
    const pantsMat = matte("cPants", PANTS, scene);
    const cuffMat = matte("cCuff", CUFF, scene);
    const shoeMat = matte("cShoe", SHOE, scene);
    const soleMat = matte("cSole", SOLE, scene);
    const scleraMat = matte("cSclera", SCLERA, scene);
    const irisMat = matte("cIris", IRIS, scene);
    const pupilMat = matte("cPupil", PUPIL, scene);
    const lidMat = matte("cLid", LID, scene);
    const browMat = matte("cBrow", BROW, scene);
    const beltMat = matte("cBelt", BELT, scene);
    const brassMat = matte("cBrass", BRASS, scene);
    const pocketMat = matte("cPocket", POCKET, scene);
    const flapMat = matte("cFlap", FLAP, scene);
    const laceMat = matte("cLace", LACE, scene);
    const toeMat = matte("cToe", TOE, scene);
    const wristMat = matte("cWrist", WRIST, scene);
    const curlMats = CURLS.map((hex, i) => matte(`cCurl${i}`, hex, scene));

    const hoodMat = fabric("cHood", HOOD, scene);
    const wrapMat = fabric("cWrap", WRAP, scene);
    const capeMat = fabric("cCape", "#9C7A55", scene);
    capeMat.diffuseTexture = createCapeTexture(scene);

    // ---- torso clothing: fitted tee hugging the sculpt --------------------
    // Same loft as the body torso, inflated slightly, plus a chest V panel.
    const tee = buildTorso(scene, 1.055);
    tee.material = teeMat;
    clothing.push(tee);

    const teePanel = CreateSphere("teePanel", { diameter: 0.11, segments: 16 }, scene);
    teePanel.scaling.set(1.7, 2.0, 0.3);
    teePanel.position.set(0, 1.36, -0.155);
    teePanel.material = teeMat;
    clothing.push(teePanel);

    // Belt with a brass buckle.
    const belt = CreateTorus("belt", { diameter: 0.292, thickness: 0.06, tessellation: 32 }, scene);
    belt.position.y = 1.05;
    belt.material = beltMat;
    clothing.push(belt);

    const buckle = CreateBox("buckle", { width: 0.055, height: 0.04, depth: 0.016 }, scene);
    buckle.position.set(0, 1.05, -0.145);
    buckle.material = brassMat;
    clothing.push(buckle);

    // ---- leg clothing: cargo pants over the thigh/calf lofts ---------------
    const hipWrap = CreateSphere("hipWrap", { diameter: 0.30, segments: 16 }, scene);
    hipWrap.scaling.set(1.02, 0.80, 1.25);
    hipWrap.position.set(0, 0.95, -0.01);
    hipWrap.material = pantsMat;
    clothing.push(hipWrap);

    for (const side of [-1, 1]) {
        // Baggy pant thighs (body lofts inflated).
        const thighPant = buildParamMesh("thighPant", 12, 20, (v, theta) => {
            const y = 0.93 - 0.51 * v;
            const deg = theta / DEG;
            let r = profileAt([[0, 0.105], [0.35, 0.096], [0.75, 0.077], [1, 0.057]], v) * 1.16;
            r += 0.014 * bell(y, 0.70, 0.14) * angGauss(deg, 0, 55) * 1.16;
            const cx = side * (0.115 - 0.012 * v);
            return new Vector3(cx + Math.sin(theta) * r, y, -Math.cos(theta) * r);
        }, scene);
        thighPant.material = pantsMat;
        clothing.push(thighPant);

        // Calf pants down to the rolled cuff.
        const calfPant = buildParamMesh("calfPant", 10, 20, (v, theta) => {
            const vv = v * 0.87; // stop at y = 0.12
            const y = 0.42 - 0.345 * vv;
            const r = profileAt([[0, 0.060], [0.35, 0.070], [0.68, 0.055], [1, 0.040]], vv) * 1.18;
            const cx = side * (0.105 + 0.010 * vv);
            return new Vector3(cx + Math.sin(theta) * r, y, -0.006 * vv - Math.cos(theta) * r);
        }, scene);
        calfPant.material = pantsMat;
        clothing.push(calfPant);

        const cuff = CreateTorus("cuff", { diameter: 0.135, thickness: 0.03, tessellation: 24 }, scene);
        cuff.position.set(side * 0.115, 0.125, 0);
        cuff.material = cuffMat;
        clothing.push(cuff);

        // Cargo pocket with flap on the front of the thigh.
        const pocket = CreateBox("pocket", { width: 0.09, height: 0.11, depth: 0.04 }, scene);
        pocket.position.set(side * 0.125, 0.66, -0.098);
        pocket.rotation.y = -side * 0.22;
        pocket.material = pocketMat;
        clothing.push(pocket);

        const flap = CreateBox("pocketFlap", { width: 0.095, height: 0.028, depth: 0.045 }, scene);
        flap.position.set(side * 0.125, 0.72, -0.10);
        flap.rotation.y = -side * 0.22;
        flap.material = flapMat;
        clothing.push(flap);

        // Knee pad.
        const kneePad = CreateSphere("kneePad", { diameter: 0.125, segments: 12 }, scene);
        kneePad.scaling.set(0.9, 1.05, 0.7);
        kneePad.position.set(side * 0.108, 0.40, -0.052);
        kneePad.material = flapMat;
        clothing.push(kneePad);

        // Sneakers: body, sole, toe cap, lace strip.
        const shoe = CreateSphere("shoe", { diameter: 0.21, segments: 16 }, scene);
        shoe.scaling.set(0.78, 0.5, 1.5);
        shoe.position.set(side * 0.115, 0.05, -0.035);
        shoe.rotation.y = -side * 0.2;
        shoe.material = shoeMat;
        clothing.push(shoe);

        const soleMesh = CreateSphere("sole", { diameter: 0.22, segments: 16 }, scene);
        soleMesh.scaling.set(0.8, 0.28, 1.55);
        soleMesh.position.set(side * 0.115, 0.018, -0.035);
        soleMesh.rotation.y = -side * 0.2;
        soleMesh.material = soleMat;
        clothing.push(soleMesh);

        const toeCap = CreateSphere("toeCap", { diameter: 0.17, segments: 12 }, scene);
        toeCap.scaling.set(0.76, 0.44, 0.75);
        toeCap.position.set(side * 0.115, 0.034, -0.10);
        toeCap.rotation.y = -side * 0.2;
        toeCap.material = toeMat;
        clothing.push(toeCap);

        const lace = CreateBox("lace", { width: 0.075, height: 0.012, depth: 0.055 }, scene);
        lace.position.set(side * 0.115, 0.09, -0.05);
        lace.rotation.x = -0.35;
        lace.rotation.y = -side * 0.2;
        lace.material = laceMat;
        clothing.push(lace);
    }

    // ---- arm clothing: white sleeves over the arm lofts, skin hands --------
    for (const side of [-1, 1]) {
        const pivot = body.armPivots[side === -1 ? 0 : 1];

        const upperSleeve = buildParamMesh("upperSleeve", 10, 16, (v, theta) => {
            const y = -0.005 - 0.35 * v;
            const deg = theta / DEG;
            let r = profileAt([[0, 0.058], [0.4, 0.055], [1, 0.046]], v) * 1.13;
            r += 0.013 * bell(y, -0.14, 0.09) * angGauss(deg, 0, 45) * 1.13;
            r += 0.010 * bell(y, -0.17, 0.10) * angGauss(deg, 180, 45) * 1.13;
            const cx = side * 0.012;
            return new Vector3(cx + Math.sin(theta) * r, y, -Math.cos(theta) * r);
        }, scene);
        upperSleeve.material = sleeveMat;
        upperSleeve.parent = pivot;
        clothing.push(upperSleeve);

        const foreSleeve = buildParamMesh("foreSleeve", 10, 16, (v, theta) => {
            const vv = v * 0.85; // stop just above the wrist cuff
            const y = -0.345 - 0.255 * vv;
            const r = profileAt([[0, 0.047], [0.3, 0.051], [0.7, 0.042], [1, 0.032]], vv) * 1.14;
            const cx = side * 0.012;
            return new Vector3(cx + Math.sin(theta) * r, y, -Math.cos(theta) * r);
        }, scene);
        foreSleeve.material = sleeveMat;
        foreSleeve.parent = pivot;
        clothing.push(foreSleeve);

        // Shoulder cap blending sleeve into the tee.
        const cap = CreateSphere("shoulderCap", { diameter: 0.15, segments: 14 }, scene);
        cap.scaling.set(1, 1.15, 1.05);
        cap.position.set(side * 0.183, 1.452, 0);
        cap.material = sleeveMat;
        clothing.push(cap);

        const wristCuff = CreateTorus("wristCuff", { diameter: 0.11, thickness: 0.03, tessellation: 20 }, scene);
        wristCuff.position.set(side * 0.012, -0.585, 0);
        wristCuff.rotation.x = Math.PI / 2;
        wristCuff.parent = pivot;
        wristCuff.material = wristMat;
        clothing.push(wristCuff);
    }

    // ---- face (geometry, always visible) ------------------------------------
    const headPivot = body.headPivot;

    for (const side of [-1, 1]) {
        const eyeball = CreateSphere("eyeball", { diameter: 0.034, segments: 12 }, scene);
        eyeball.position.set(side * 0.036, 0.131, -0.108);

        const iris = CreateDisc("iris", { radius: 0.0085, tessellation: 16 }, scene);
        iris.rotation.y = Math.PI;
        iris.position.set(side * 0.036, 0.131, -0.1248);

        const pupil = CreateDisc("pupil", { radius: 0.0045, tessellation: 12 }, scene);
        pupil.rotation.y = Math.PI;
        pupil.position.set(side * 0.036, 0.131, -0.1251);

        const glint = CreateSphere("glint", { diameter: 0.0036, segments: 8 }, scene);
        glint.position.set(side * 0.036 + 0.004, 0.135, -0.1244);

        const lid = CreateBox("lid", { width: 0.042, height: 0.005, depth: 0.01 }, scene);
        lid.position.set(side * 0.036, 0.146, -0.1175);
        lid.rotation.x = -0.15;

        const brow = CreateBox("brow", { width: 0.052, height: 0.009, depth: 0.013 }, scene);
        brow.position.set(side * 0.038, 0.159, -0.112);
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

    const noseBridge = CreateSphere("noseBridge", { diameter: 0.033, segments: 12 }, scene);
    noseBridge.scaling.set(0.85, 1.0, 0.55);
    noseBridge.position.set(0, 0.109, -0.1175);
    noseBridge.rotation.x = -0.2;

    const noseTip = CreateSphere("noseTip", { diameter: 0.03, segments: 12 }, scene);
    noseTip.scaling.set(1, 0.9, 0.9);
    noseTip.position.set(0, 0.091, -0.1275);

    noseBridge.material = body.skin;
    noseTip.material = body.skin;
    noseBridge.parent = headPivot;
    noseTip.parent = headPivot;

    // Curly blond fringe peeking from under the hood.
    const curlSeeded = (seed: number): () => number => {
        let a = seed >>> 0;
        return () => {
            a |= 0;
            a = (a + 0x6d2b79f5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };
    const rng = curlSeeded(2024);
    for (let i = 0; i < 15; i++) {
        const curl = CreateSphere(`curl${i}`, { diameter: 0.028 + rng() * 0.02, segments: 10 }, scene);
        const phi = (50 + rng() * 14) * DEG;
        const theta = (148 + rng() * 64) * DEG;
        const radius = 0.121 + rng() * 0.004;
        curl.position.set(
            radius * Math.sin(phi) * Math.sin(theta),
            0.123 + radius * Math.cos(phi),
            radius * Math.sin(phi) * Math.cos(theta),
        );
        curl.scaling.y = 0.85;
        curl.material = curlMats[(rng() * curlMats.length) | 0];
        curl.parent = headPivot;
    }
    for (const side of [-1, 1]) {
        const curl = CreateSphere(`curlSide${side}`, { diameter: 0.034, segments: 10 }, scene);
        curl.position.set(side * 0.093, 0.168, -0.078);
        curl.scaling.y = 1.3;
        curl.material = curlMats[1];
        curl.parent = headPivot;
    }

    // ---- head clothing: wrap, hood, peak, drape ------------------------------
    const wrap = createShell("faceWrap", {
        radius: 0.127,
        phiStart: 94, phiEnd: 150,
        thetaStart: 95, thetaEnd: 265,
        centerY: 0.123,
        rows: 8, cols: 14,
    }, scene);
    wrap.material = wrapMat;
    wrap.parent = headPivot;
    clothing.push(wrap);

    const hood = createShell("hood", {
        radius: 0.148,
        phiStart: 6, phiEnd: 118,
        thetaStart: 245, thetaEnd: 475, // 130° opening centred on the face
        centerY: 0.135,
        cz: 0.012,
        scaleY: 1.08,
        rows: 10, cols: 16,
    }, scene);
    hood.material = hoodMat;
    hood.parent = headPivot;
    clothing.push(hood);

    const peak = CreateCylinder("hoodPeak", { diameterBottom: 0.10, diameterTop: 0.004, height: 0.14, tessellation: 12 }, scene);
    peak.position.set(0, 0.238, 0.115);
    peak.rotation.x = 0.55;
    peak.material = hoodMat;
    peak.parent = headPivot;
    clothing.push(peak);

    const hoodDrape = createShell("hoodDrape", {
        radius: 0.140,
        phiStart: 112, phiEnd: 154,
        thetaStart: 250, thetaEnd: 470,
        centerY: 0.123,
        cz: 0.012,
        scaleY: 1.08,
        rows: 6, cols: 14,
    }, scene);
    hoodDrape.material = hoodMat;
    hoodDrape.parent = headPivot;
    clothing.push(hoodDrape);

    // ---- cape rig ---------------------------------------------------------------
    const collar = CreateTorus("collar", { diameter: 0.27, thickness: 0.072, tessellation: 32 }, scene);
    collar.position.y = 1.53;
    collar.material = matte("cCapeTrim", "#9C7A55", scene);
    clothing.push(collar);

    const mantle = createShell("mantle", {
        radius: 0.245,
        phiStart: 80, phiEnd: 102,
        thetaStart: 245, thetaEnd: 475,
        centerY: 1.47,
        rows: 5, cols: 16,
    }, scene);
    mantle.material = capeMat;
    clothing.push(mantle);

    const clasp = CreateCylinder("clasp", { diameter: 0.044, height: 0.014, tessellation: 12 }, scene);
    clasp.rotation.x = Math.PI / 2;
    clasp.position.set(0.02, 1.38, -0.152);
    clasp.material = brassMat;
    clothing.push(clasp);

    const capeSheet = buildCapeSheet(scene);
    capeSheet.material = capeMat;
    clothing.push(capeSheet);

    const chestPanel = buildChestPanel(scene);
    chestPanel.material = capeMat;
    clothing.push(chestPanel);

    // ---- soft blob shadow ----------------------------------------------------------
    const shadow = CreateDisc("agentShadow", { radius: 0.45, tessellation: 32 }, scene);
    shadow.rotation.x = Math.PI / 2;
    shadow.position.y = 0.012;
    const shadowMat = new StandardMaterial("cShadowMat", scene);
    shadowMat.diffuseTexture = createShadowTexture(scene);
    shadowMat.diffuseTexture.hasAlpha = true;
    shadowMat.useAlphaFromDiffuseTexture = true;
    shadowMat.disableLighting = true;
    shadowMat.specularColor = Color3.Black();
    shadow.material = shadowMat;

    // ---- B-key: strip to the raw body / dress again --------------------------------
    let clothesOn = true;
    window.addEventListener("keydown", (event) => {
        if (event.key.toLowerCase() === "b") {
            clothesOn = !clothesOn;
            for (const mesh of clothing) mesh.isVisible = clothesOn;
        }
    });

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
        body.torso.scaling.x = breathe;
        body.torso.scaling.z = breathe;
        tee.scaling.x = 1.055 * breathe;
        tee.scaling.z = 1.055 * breathe;
        chestPanel.scaling.x = 1 + (breathe - 1) * 0.5;
        chestPanel.scaling.z = 1 + (breathe - 1) * 0.5;
        collar.scaling.x = 1 + (breathe - 1) * 0.5;
        collar.scaling.z = 1 + (breathe - 1) * 0.5;

        // Slow look-around with an occasional tilt.
        headPivot.rotation.y = 0.35 * Math.sin(t * 0.21) + 0.15 * Math.sin(t * 0.09 + 2.0);
        headPivot.rotation.z = 0.05 * Math.sin(t * 0.15 + 1.0);

        // Arm micro-sway on top of the A-pose.
        body.armPivots[0].rotation.z = -0.10 - 0.02 * Math.sin(t * 0.6);
        body.armPivots[1].rotation.z = 0.10 + 0.02 * Math.sin(t * 0.6 + 0.5);
        body.armPivots[0].rotation.x = 0.03 * Math.sin(t * 0.8);
        body.armPivots[1].rotation.x = 0.03 * Math.sin(t * 0.8 + 1.3);

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
    const TOP_Y = 1.45;
    const R_TOP = 0.25;
    const FLARE = 0.10;

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
            const yLine = 1.43 + (1.02 - 1.41) * frac;
            const across = (j / cols - 0.5) * 0.28;      // band width
            const radius = 0.168 + 0.018 * Math.sin(Math.PI * (j / cols));
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
            const c = a + (cols + 1) + j;
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
