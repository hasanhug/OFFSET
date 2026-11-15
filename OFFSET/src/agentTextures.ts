import { Scene } from "@babylonjs/core/scene";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { fbmTile } from "./noise";

/**
 * Canvas-painted textures for Agent Jones — face, cape fabric, and the soft
 * blob shadow that grounds him on the terrain. All procedural, no image
 * files, same noise family as the rest of the project.
 */

/**
 * The visible face: skin with soft shading, blue-grey eyes with pupils,
 * light brows, a curly blond fringe across the forehead, and the tan face
 * wrap covering everything below the nose. Painted for the face shell's UVs
 * (canvas top = hairline region, canvas bottom = under the chin).
 */
export const createFaceTexture = (scene: Scene): DynamicTexture => {
    const S = 256;
    const texture = new DynamicTexture("agentFaceTexture", { width: S, height: S }, scene, true);
    const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;

    // Skin base + soft edge shading towards the sides of the face.
    ctx.fillStyle = "#E8C4A8";
    ctx.fillRect(0, 0, S, S);
    const edgeShade = ctx.createRadialGradient(S / 2, S * 0.45, S * 0.14, S / 2, S * 0.45, S * 0.55);
    edgeShade.addColorStop(0, "rgba(0,0,0,0)");
    edgeShade.addColorStop(1, "rgba(139,94,60,0.30)");
    ctx.fillStyle = edgeShade;
    ctx.fillRect(0, 0, S, S);

    // Subtle nose shadow running down to the wrap.
    ctx.strokeStyle = "rgba(160,110,80,0.45)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(S * 0.5, S * 0.44);
    ctx.lineTo(S * 0.5, S * 0.61);
    ctx.stroke();

    // Eyes: sclera, blue-grey iris, pupil, highlight, upper lid line.
    const eyeY = S * 0.4125;
    for (const ex of [S * 0.233, S * 0.767]) {
        ctx.fillStyle = "#F4F1EC";
        ctx.beginPath();
        ctx.ellipse(ex, eyeY, 11, 6.5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#7A93A0";
        ctx.beginPath();
        ctx.arc(ex, eyeY + 0.5, 4.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#232B30";
        ctx.beginPath();
        ctx.arc(ex, eyeY + 0.5, 2.1, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.arc(ex + 1.4, eyeY - 1.4, 1.1, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "rgba(110,78,56,0.55)";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(ex, eyeY - 1, 11, 6.5, 0, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
    }

    // Eyebrows: light brown, slightly tilted.
    ctx.fillStyle = "rgba(176,138,72,0.9)";
    for (const [bx, tilt] of [[S * 0.233, -0.14], [S * 0.767, 0.14]] as const) {
        ctx.beginPath();
        ctx.ellipse(bx, S * 0.352, 13, 3.2, tilt, 0, Math.PI * 2);
        ctx.fill();
    }

    // Curly blond fringe: an organic scalloped band across the top.
    ctx.fillStyle = "#C9A266";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let x = 0; x <= S; x += 4) {
        const u = x / S;
        const depth = S * (0.10
            + 0.05 * fbmTile(u, 0.25, 4, 2, 55)
            + 0.035 * Math.abs(Math.sin(x * 0.11)));
        ctx.lineTo(x, depth);
    }
    ctx.lineTo(S, 0);
    ctx.closePath();
    ctx.fill();

    // A few darker curl strands inside the fringe.
    ctx.strokeStyle = "rgba(168,132,78,0.55)";
    ctx.lineWidth = 2.5;
    for (let k = 0; k < 6; k++) {
        const x0 = S * (0.12 + 0.15 * k);
        ctx.beginPath();
        ctx.moveTo(x0, 0);
        ctx.quadraticCurveTo(x0 + 6, S * 0.09, x0 - 4, S * 0.16);
        ctx.stroke();
    }

    // Face wrap from just below the nose downwards.
    ctx.fillStyle = "#B08A64";
    ctx.beginPath();
    ctx.moveTo(0, S);
    for (let x = 0; x <= S; x += 4) {
        const u = x / S;
        const top = S * (0.615 + 0.03 * fbmTile(u, 0.7, 3, 2, 77));
        ctx.lineTo(x, top);
    }
    ctx.lineTo(S, S);
    ctx.closePath();
    ctx.fill();

    // Shadow line where the wrap meets the skin, plus soft folds.
    ctx.strokeStyle = "rgba(70,48,30,0.45)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x <= S; x += 4) {
        const u = x / S;
        const top = S * (0.615 + 0.03 * fbmTile(u, 0.7, 3, 2, 77));
        if (x === 0) ctx.moveTo(x, top);
        else ctx.lineTo(x, top);
    }
    ctx.stroke();

    ctx.strokeStyle = "rgba(120,88,58,0.5)";
    ctx.lineWidth = 4;
    for (const fx of [0.22, 0.38, 0.52, 0.66, 0.8]) {
        ctx.beginPath();
        ctx.moveTo(S * fx, S * 0.66);
        ctx.quadraticCurveTo(S * fx + 5, S * 0.8, S * fx - 3, S * 0.98);
        ctx.stroke();
    }

    texture.update();
    texture.hasAlpha = true;
    return texture;
};

/**
 * Brown linen for the cape: vertical fold bands with noise-wobbled phases,
 * fine weave grain, and a slightly darkened hem. Tileable so it wraps the
 * cape sheet without seams.
 */
export const createCapeTexture = (scene: Scene): DynamicTexture => {
    const S = 256;
    const texture = new DynamicTexture("agentCapeTexture", { width: S, height: S }, scene, true);
    const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;

    const image = ctx.createImageData(S, S);
    const data = image.data;
    for (let py = 0; py < S; py++) {
        const v = py / S;
        for (let px = 0; px < S; px++) {
            const u = px / S;
            const wobble = fbmTile(u, v, 6, 3, 900) * 6;
            const folds = Math.sin(u * Math.PI * 2 * 6 + wobble + v * 1.5);
            const broad = Math.sin(u * Math.PI * 2 * 2.2 + 2 + wobble * 0.7);
            const grain = fbmTile(u, v, 48, 2, 901);
            let shade = 1 + folds * 0.07 + broad * 0.04 + (grain - 0.5) * 0.10;

            // Canvas bottom = cape hem (texture v = 0 = mesh bottom row).
            const t = Math.max(0, Math.min(1, (v - 0.86) / 0.14));
            shade *= 1 - 0.12 * (t * t * (3 - 2 * t));
            shade *= 1 + 0.03 * (1 - v); // a touch lighter at the shoulder line

            const i = (py * S + px) * 4;
            data[i] = Math.min(255, Math.max(0, 156 * shade));
            data[i + 1] = Math.min(255, Math.max(0, 122 * shade));
            data[i + 2] = Math.min(255, Math.max(0, 85 * shade));
            data[i + 3] = 255;
        }
    }
    ctx.putImageData(image, 0, 0);
    texture.update();
    texture.wrapU = 1; // wrap
    texture.wrapV = 1;
    return texture;
};

/** Soft radial blob shadow under the character's feet. */
export const createShadowTexture = (scene: Scene): DynamicTexture => {
    const S = 128;
    const texture = new DynamicTexture("agentShadowTexture", { width: S, height: S }, scene, true);
    const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, S, S);
    const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.05, S / 2, S / 2, S * 0.5);
    g.addColorStop(0, "rgba(18,24,14,0.5)");
    g.addColorStop(0.6, "rgba(18,24,14,0.28)");
    g.addColorStop(1, "rgba(18,24,14,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    texture.update();
    texture.hasAlpha = true;
    return texture;
};
