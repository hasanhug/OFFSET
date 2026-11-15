import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Scene } from "@babylonjs/core/scene";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { mulberry32 } from "./noise";
import { terrainHeight } from "./terrain";

/**
 * Sparse clumps of dry grass — the defining feature of the reference
 * photo. Each clump is three crossed quads with a hand-painted (procedural
 * canvas) wispy-blade texture, scattered as thin instances so ~800 tufts
 * render in a single draw call.
 */

const TUFT_WIDTH = 0.9;
const TUFT_HEIGHT = 0.7;
const TUFT_COUNT = 800;

export const createGrass = (scene: Scene): Mesh => {
    // One master clump: three quads crossing at 60°, baked so their base
    // sits at y = 0.
    const quads: Mesh[] = [];
    for (let i = 0; i < 3; i++) {
        const quad = CreatePlane(`tuftQuad${i}`, { width: TUFT_WIDTH, height: TUFT_HEIGHT }, scene);
        quad.bakeTransformIntoVertices(Matrix.Translation(0, TUFT_HEIGHT / 2, 0));
        quad.rotation.y = (i * Math.PI) / 3;
        quads.push(quad);
    }
    const master = Mesh.MergeMeshes(quads, true)!;
    master.isPickable = false;
    master.alwaysSelectAsActiveMesh = true; // instances span the whole plain
    master.material = createGrassMaterial(scene);

    // Scatter the clumps: irregular spacing with bare gaps between them,
    // thinning out towards the far plain, never on steep hill slopes.
    const rng = mulberry32(777);
    const matrices = new Float32Array(TUFT_COUNT * 16);
    const tints = new Float32Array(TUFT_COUNT * 4);
    const minRadius = 5;   // keep the cube/sphere patch clear
    const maxRadius = 110;

    let placed = 0;
    let attempts = 0;
    while (placed < TUFT_COUNT && attempts++ < TUFT_COUNT * 30) {
        const angle = rng() * Math.PI * 2;
        const r = Math.sqrt(minRadius * minRadius
            + (maxRadius * maxRadius - minRadius * minRadius) * rng());
        if (rng() < 0.55 * (r - minRadius) / (maxRadius - minRadius)) continue; // thin out far away

        const x = Math.cos(angle) * r + (rng() - 0.5) * 2.5;
        const z = Math.sin(angle) * r + (rng() - 0.5) * 2.5;
        const y = terrainHeight(x, z);

        // Skip steep spots — grass only grows on the plain and lower slopes.
        const slope = Math.max(
            Math.abs(terrainHeight(x + 1.5, z) - y),
            Math.abs(terrainHeight(x, z + 1.5) - y),
        );
        if (slope > 1.1) continue;

        const scale = 0.7 + rng() * 0.6;
        const matrix = Matrix.Compose(
            new Vector3(scale * (0.8 + rng() * 0.4), scale, scale * (0.8 + rng() * 0.4)),
            Quaternion.RotationAxis(Vector3.Up(), rng() * Math.PI * 2),
            new Vector3(x, y, z),
        );
        matrix.copyToArray(matrices, placed * 16);

        // Slight per-clump tint variation: some clumps paler, some warmer.
        const tint = 0.8 + rng() * 0.25;
        tints[placed * 4] = tint;
        tints[placed * 4 + 1] = tint * (0.96 + rng() * 0.05);
        tints[placed * 4 + 2] = tint * 0.88;
        tints[placed * 4 + 3] = 1;

        placed++;
    }

    master.thinInstanceSetBuffer("matrix", matrices.subarray(0, placed * 16), 16, true);
    master.thinInstanceSetBuffer("color", tints.subarray(0, placed * 4), 4, true);
    return master;
};

/** Wispy dry-grass blades painted onto a small transparent canvas. */
const createGrassMaterial = (scene: Scene): StandardMaterial => {
    const size = 128;
    const texture = new DynamicTexture("grassTexture", { width: size, height: size }, scene, true);
    const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
    const rng = mulberry32(4242);

    ctx.clearRect(0, 0, size, size);
    ctx.lineCap = "round";

    // Wispy blades curving up from the bottom edge; darker base clump first,
    // then straw-coloured blades on top.
    const strokeBlades = (count: number, color: () => string, maxLength: number, width: number) => {
        for (let i = 0; i < count; i++) {
            ctx.strokeStyle = color();
            const x0 = 12 + rng() * (size - 24);
            const x1 = x0 + (rng() - 0.5) * 38;
            const top = size - maxLength * (0.6 + rng() * 0.4);
            ctx.globalAlpha = 0.7 + rng() * 0.3;
            ctx.lineWidth = width * (0.7 + rng() * 0.6);
            ctx.beginPath();
            ctx.moveTo(x0, size);
            ctx.quadraticCurveTo((x0 + x1) / 2 + (rng() - 0.5) * 12, size * 0.45, x1, top);
            ctx.stroke();
        }
    };

    const strawColors = ["#C9A05C", "#D9B878", "#E3CFA0", "#B08F55"];
    strokeBlades(26, () => "#8A6B45", size * 0.5, 2.6); // darker base clump
    strokeBlades(34, () => strawColors[(rng() * strawColors.length) | 0], size * 0.95, 2.0);

    ctx.globalAlpha = 1;
    texture.update();
    texture.hasAlpha = true;

    const material = new StandardMaterial("grassMaterial", scene);
    material.diffuseTexture = texture;
    material.useAlphaFromDiffuseTexture = true;
    material.specularColor = Color3.Black();
    material.backFaceCulling = false; // visible from both sides
    return material;
};
