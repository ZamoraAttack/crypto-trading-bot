"use client";

import { useRef, useMemo, useState, type ReactNode } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { Stars, Html, Billboard } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { useRouter } from "next/navigation";
import * as THREE from "three";
import PlanetInfoCard from "./PlanetInfoCard";
import { useZamoAssistant, type ZamoStatus } from "@/components/ZamoAssistantProvider";

// Shared ZAMO status → Core tint, per the Communications Layer's 6-state vocabulary. idle has
// mix 0 (bit-for-bit the locked look); every other state blends in a restrained, low-mix tint —
// never a full color swap, per the "no excessive glow, stay restrained" brief the Core itself
// was locked under. notification/urgent aren't wired to a live trigger yet (no Agents/
// Automation exist to raise them) — the mapping exists so those phases have something to plug
// into, not because anything sets these today.
// Mix values tuned up from an initial 0.14-0.24 pass, which turned out visually undetectable —
// the plasma layers' own colors are already bright/near-blown-out (values >1.0 pre-clamp for the
// ignition points), so a subtle tint washes out completely against them. Confirmed the wiring
// itself was correct via an extreme diagnostic value before retuning these — the fix was
// magnitude, not a bug.
const STATUS_TINTS: Record<ZamoStatus, { color: string; mix: number }> = {
  idle:         { color: "#000000", mix: 0 },
  listening:    { color: "#67e8f9", mix: 0.3 },
  thinking:     { color: "#a78bfa", mix: 0.3 },
  working:      { color: "#fbbf24", mix: 0.32 },
  notification: { color: "#67e8f9", mix: 0.36 },
  urgent:       { color: "#ef4444", mix: 0.42 },
};

export interface ZamoNodeConfig {
  id:     string;
  label:  string;
  value:  string;
  icon:   ReactNode;
  color:  string;
  href?:  string;
}

// Radius hierarchy measured directly off the actual Higgsfield reference pixels (nucleus core
// ~275px, rings ~415px, node ring ~490px in the source image) — a tight 1 : 1.51 : 1.78 cluster,
// NOT the widely-separated zones used in earlier rounds (which were tuned from a drifted text
// description of the reference, never the image itself, and came out ~3x too spread out).
// SYSTEM_SCALE shrinks the whole cluster uniformly (art-direction pass: nucleus read too large,
// composition too tight against the surrounding UI) without touching the ratio between zones —
// same camera, so the smaller system also opens up more negative space around it for free.
// further reduced (0.87 → 0.76, ~13%) per feedback that the nucleus dominated the frame at the
// expense of the orbiting nodes/labels — same ratio between zones, same camera, just a smaller
// overall cluster opening up more negative space, same technique as the original 0.87 pass.
const SYSTEM_SCALE = 0.76;
const NUCLEUS_RADIUS   = 1.0 * SYSTEM_SCALE;
const RING_RADIUS      = 1.51 * SYSTEM_SCALE;
const RING_TUBE        = 0.11 * SYSTEM_SCALE;
const NODE_RING_RADIUS = 1.78 * SYSTEM_SCALE;
const NODE_RING_TILT: [number, number, number] = [0.18, 0, -0.05];

// Dedicated nucleus shader — woven, flowing plasma filaments (domain-warped noise banding).
// uStatusColor/uStatusMix (added for the Communications Layer's shared ZAMO status) blend in as
// the very last step, after every locked visual decision — at uStatusMix=0 (idle) the output is
// bit-for-bit the locked look; the tint only appears when the shared status actually changes.
function createNucleusMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uStatusColor: { value: new THREE.Color("#000000") }, uStatusMix: { value: 0 } },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vObjectNormal;
      varying vec3 vViewDir;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vObjectNormal = normalize(normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uStatusColor;
      uniform float uStatusMix;
      varying vec3 vNormal;
      varying vec3 vObjectNormal;
      varying vec3 vViewDir;

      float hash(vec3 p) {
        p = fract(p * vec3(0.1031, 0.1030, 0.0973));
        p += dot(p, p.yxz + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
          f.z);
      }
      vec3 warp(vec3 p) {
        float wx = noise(p + vec3(0.0, 0.0, 0.0));
        float wy = noise(p + vec3(5.2, 1.3, 2.8));
        float wz = noise(p + vec3(9.1, 7.4, 4.6));
        return vec3(wx, wy, wz) - 0.5;
      }

      void main() {
        // anisotropic axis scale — perfectly uniform vObjectNormal*constant sampling is what
        // makes noise-on-a-sphere read as "designed" (identical statistics at every latitude/
        // longitude); stretching the sampling axes unevenly breaks that even distribution
        vec3 p = vObjectNormal * vec3(2.3, 3.1, 2.5);
        vec3 flow = vec3(uTime * 0.06, uTime * 0.04, uTime * 0.05);

        // domain-warped flow field — two warp passes turn plain noise into woven,
        // ribbon-like streaks instead of a blotchy cloud
        vec3 warped = p + warp(p + flow) * 1.4;
        warped += warp(warped * 1.7 - flow * 1.3) * 0.9;

        // layered sine projections along the warped coordinate read as flowing ribbon bands
        float band1 = sin(dot(warped, vec3(1.0, 0.6, 0.3)) * 3.2);
        float band2 = sin(dot(warped, vec3(0.4, 1.0, 0.7)) * 4.7 + 1.3);
        float ribbon = clamp((band1 * 0.6 + band2 * 0.4) * 0.5 + 0.5, 0.0, 1.0);

        // second, coarser warp pass at a different scale/flow rate — reads as broad convection
        // cells (like solar granulation) sitting underneath the fine ribbon streaks, so the
        // surface has two distinct scales of structure instead of one uniform pattern
        vec3 cellP = vObjectNormal * 1.1;
        vec3 cellFlow = vec3(uTime * -0.025, uTime * 0.018, uTime * -0.02);
        vec3 cellWarped = cellP + warp(cellP + cellFlow) * 1.8;
        float cell = noise(cellWarped * 1.6);

        // large-scale, near-static asymmetry field — one broad region of the sphere runs hotter/
        // busier than the rest, the other calmer. Real contained energy isn't evenly distributed;
        // a perfectly even turbulence field is itself a tell that it's procedural
        float macro = noise(vObjectNormal * 0.55 + vec3(1.7, 0.3, 4.1) + uTime * 0.01);

        // combined structure field — convection cells gate where ribbons are even allowed to
        // shine, carving genuine dark pockets between them rather than everywhere staying lit,
        // scaled again by the macro field so activity itself is unevenly distributed
        float structure = ribbon * smoothstep(0.15, 0.65, cell) * mix(0.5, 1.2, macro);

        // contained-energy palette — a near-black void base with energy reading as veins glowing
        // through pockets of real darkness, not a uniformly-lit surface. Dark floor pushed much
        // closer to true black so the bright veins read as structure, not just a tinted surface.
        vec3 cVoid     = vec3(0.004, 0.01, 0.025);
        vec3 cDark     = vec3(0.02, 0.05, 0.11);
        vec3 cCyan     = vec3(0.13, 0.68, 0.82);
        vec3 cMint     = vec3(0.62, 0.92, 0.88);
        vec3 cWhite    = vec3(1.2, 1.25, 1.35);
        vec3 cLavender = vec3(0.68, 0.64, 0.9);
        vec3 color = mix(cVoid, cDark, smoothstep(0.0, 0.1, cell));
        color = mix(color, cCyan, smoothstep(0.12, 0.34, structure));
        color = mix(color, cMint, smoothstep(0.36, 0.54, structure));
        color = mix(color, cWhite, smoothstep(0.56, 0.72, structure));
        color = mix(color, cLavender, smoothstep(0.74, 0.9, structure));

        // true fusion-white ignition points — blown-out past 1.0 so bloom turns these into real
        // hot sparks within the flowing plasma, not just a bright band. Sparse (only the
        // structure field's very peak triggers it) so it reads as active fusion, not an evenly
        // lit surface.
        vec3 cIgnition = vec3(2.1, 2.15, 2.2);
        float ignite = smoothstep(0.78, 0.97, structure);
        color = mix(color, cIgnition, ignite * 0.8);

        // faint engineered filament grid — thin lat/long-style lines in object space, broken up
        // by the same noise field so only scattered fragments survive (circuitry glimpsed through
        // the plasma, not a uniform wireframe sphere). Very low contribution: invisible from a
        // normal viewing distance, a delicate "this is computation, not magic" detail up close.
        vec2 gridUv = vec2(atan(vObjectNormal.z, vObjectNormal.x), acos(clamp(vObjectNormal.y, -1.0, 1.0))) * vec2(10.0, 7.0);
        vec2 gv = fract(gridUv) - 0.5;
        float gridLine = max(smoothstep(0.46, 0.5, abs(gv.x)), smoothstep(0.46, 0.5, abs(gv.y)));
        float gridVisible = smoothstep(0.5, 0.75, noise(vObjectNormal * 5.0 + flow * 0.3));
        // a faint highlight travels along the grid's long axis over time — reads as data moving
        // through the lattice rather than a static etched pattern, visible only up close
        float dataTravel = 0.5 + 0.5 * sin(gridUv.x * 0.25 - uTime * 0.35);
        color += vec3(0.55, 0.85, 1.0) * gridLine * gridVisible * (0.07 + dataTravel * 0.11);

        // alpha now follows the structure field, not just the rim — dark pockets go
        // semi-transparent, letting whatever sits behind (the deeper inner core, or void) show
        // through the gaps. This is what turns a flat lit sphere into something with real depth:
        // you're looking into layered energy, not at a painted surface.
        float depthAlpha = clamp(0.32 + structure * 0.8 + ignite * 0.3, 0.0, 1.0);

        // soft dissolve toward the rim, perturbed by the same noise field driving the ribbons —
        // pushed a bit further than before so the silhouette reads as energy escaping containment
        // rather than a clean sphere edge, reinforcing the "core," not "planet," read
        float fresnel = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0), 1.6);
        float edgeNoise = noise(vObjectNormal * 4.0 + flow * 0.5);
        float wispy = fresnel * (0.55 + edgeNoise * 0.85);
        float alpha = clamp(depthAlpha * (1.0 - wispy * 0.65), 0.0, 1.0);

        // gentle whole-core breathing, plus a small irregular flicker on top of the smooth
        // pulse — perfectly periodic motion is what reads as "simulated," a touch of real
        // instability is what reads as "contained energy under pressure"
        float flicker = noise(vec3(uTime * 1.7, 0.4, 0.9)) * 0.07;
        float breathe = 0.9 + 0.08 * sin(uTime * 0.55) + flicker;

        // ~15% overall brightness reduction — contrast against the dark background should read
        // as intensity, not raw luminosity; ignition points still clear the bloom threshold since
        // they were pushed well past 1.0 to begin with
        vec3 finalColor = color * breathe * 0.85;
        // shared-status tint, blended in last — zero effect at rest (uStatusMix starts at 0)
        finalColor = mix(finalColor, uStatusColor, uStatusMix);
        gl_FragColor = vec4(finalColor, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    // depth IS written here (unusual for a transparent/additive material) specifically so the
    // orbital threads — drawn after this via renderOrder — get correctly hidden by the GPU's own
    // depth test wherever they pass behind the nucleus's silhouette, instead of always drawing on
    // top regardless of position. The inner core layer below is unaffected: it draws BEFORE this
    // (renderOrder 0 vs 1) and never depth-tests against anything, so its own additive contribution
    // to the framebuffer is already locked in by the time this shell writes depth.
    depthWrite: true,
  });
}

// A second, deeper glow layer — smaller radius, faster/tighter turbulence, always additively
// present. Because blending is additive, "layering" here doesn't need any depth trickery: this
// simply draws first (renderOrder 0) and adds its glow to the framebuffer; the outer shell then
// draws on top, adding comparatively less color in its own dark/low-alpha pockets — which is what
// makes this deeper layer read clearly through the gaps, real parallax depth from two independently
// animated turbulence fields rather than a single flat shell.
function createInnerCoreMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uStatusColor: { value: new THREE.Color("#000000") }, uStatusMix: { value: 0 } },
    vertexShader: `
      varying vec3 vObjectNormal;
      void main() {
        vObjectNormal = normalize(normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uStatusColor;
      uniform float uStatusMix;
      varying vec3 vObjectNormal;

      float hash(vec3 p) {
        p = fract(p * vec3(0.1031, 0.1030, 0.0973));
        p += dot(p, p.yxz + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
          f.z);
      }

      void main() {
        vec3 p = vObjectNormal * 3.2;
        vec3 flow = vec3(uTime * 0.22, uTime * 0.17, uTime * 0.13);
        float n1 = noise(p + flow);
        float n2 = noise(p * 2.1 - flow * 1.4);
        float glow = clamp(n1 * 0.6 + n2 * 0.4, 0.0, 1.0);

        vec3 cDeep = vec3(0.08, 0.45, 0.7);
        vec3 cHot  = vec3(1.5, 1.6, 1.8);
        vec3 color = mix(cDeep, cHot, smoothstep(0.35, 0.85, glow));

        float pulse = 0.85 + 0.15 * sin(uTime * 1.3);
        vec3 finalColor = mix(color * pulse * 0.85, uStatusColor, uStatusMix);
        gl_FragColor = vec4(finalColor, 0.65);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

function InnerCore() {
  const material = useMemo(() => createInnerCoreMaterial(), []);
  const { status } = useZamoAssistant();
  const statusColorRef = useRef(new THREE.Color("#000000"));
  const statusMixRef = useRef(0);
  useFrame((state, delta) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
    const target = STATUS_TINTS[status];
    // smoothed, not snapped — responsive enough to feel connected to the status change
    // (~1s) without the jarring instant pop a direct assignment would give
    statusColorRef.current.lerp(new THREE.Color(target.color), Math.min(delta * 2.5, 1));
    statusMixRef.current += (target.mix - statusMixRef.current) * Math.min(delta * 2.5, 1);
    material.uniforms.uStatusColor.value.copy(statusColorRef.current);
    material.uniforms.uStatusMix.value = statusMixRef.current;
  });
  return (
    <mesh material={material} renderOrder={0}>
      <sphereGeometry args={[NUCLEUS_RADIUS * 0.6, 32, 32]} />
    </mesh>
  );
}

// A third, explicit shell between the inner ignition point and the outer plasma surface — its
// own turbulence pattern rotating at a distinct speed/axis, so the core reads as several nested
// layers with real parallax between them (ignition → this plasma layer → outer shell →
// containment → orbital structures), not just two.
function createMidPlasmaMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vObjectNormal;
      void main() {
        vObjectNormal = normalize(normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vObjectNormal;

      float hash(vec3 p) {
        p = fract(p * vec3(0.1031, 0.1030, 0.0973));
        p += dot(p, p.yxz + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
          f.z);
      }

      void main() {
        vec3 p = vObjectNormal * vec3(1.8, 2.4, 2.0);
        vec3 flow = vec3(uTime * -0.09, uTime * 0.07, uTime * -0.05);
        float n1 = noise(p + flow);
        float n2 = noise(p * 1.6 - flow * 1.3);
        float mixed = clamp(n1 * 0.55 + n2 * 0.45, 0.0, 1.0);

        vec3 cLow  = vec3(0.03, 0.14, 0.22);
        vec3 cMid  = vec3(0.2, 0.55, 0.68);
        vec3 cHigh = vec3(0.75, 1.0, 1.05);
        vec3 color = mix(cLow, cMid, smoothstep(0.3, 0.6, mixed));
        color = mix(color, cHigh, smoothstep(0.65, 0.88, mixed));

        float alpha = clamp(0.18 + mixed * 0.35, 0.0, 0.55);
        gl_FragColor = vec4(color * 0.85, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

function MidPlasmaLayer() {
  const meshRef = useRef<THREE.Mesh>(null);
  const material = useMemo(() => createMidPlasmaMaterial(), []);
  const rot = useRef({ x: 0, y: 0 });
  useFrame((state, delta) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
    if (meshRef.current) {
      // deliberately different speed/axis from the outer shell's own rotation — this mismatch is
      // what reads as two independent layers rather than one shell duplicated
      rot.current.y += delta * 0.09;
      rot.current.x += delta * 0.035;
      meshRef.current.rotation.y = rot.current.y;
      meshRef.current.rotation.x = rot.current.x;
    }
  });
  return (
    <mesh ref={meshRef} material={material} renderOrder={0}>
      <sphereGeometry args={[NUCLEUS_RADIUS * 0.8, 40, 40]} />
    </mesh>
  );
}

// Shared glass-hybrid shader for the rings and nodes. Pixel inspection of the actual reference
// shows real transmission (background/nucleus glow faintly visible through the rings, tinted)
// and a small bright specular hotspot on every node from a consistent light direction — neither
// of which a pure fresnel-additive glow (prior round) or a flat uniform emissive (round before
// that) can produce. This combines three terms: fresnel rim, a fixed-direction Blinn-Phong
// specular highlight, and real alpha transparency (normal blending, not additive) with a base
// transmission floor so it never goes fully invisible face-on. The light direction is hardcoded
// in view space rather than driven by a real THREE.js light or Environment map — the camera in
// this scene never moves, so a fixed view-space direction stays consistent, and it sidesteps the
// Environment/Suspense Fast-Refresh issue that broke an earlier physically-based-glass attempt.
// specPower/specStrength/fresnelPow let a caller soften the same material family without a
// second shader — used to make the rings read as hazy framing (soft, broad highlight) while
// keeping the nodes' crisper glass-orb hotspot (already confirmed against the reference) intact.
function createGlassMaterial(
  color: string,
  baseIntensity: number,
  opts: { specPower?: number; specStrength?: number; fresnelPow?: number } = {}
) {
  const { specPower = 40, specStrength = 0.8, fresnelPow = 2.0 } = opts;
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime:          { value: 0 },
      uColor:         { value: new THREE.Color(color) },
      uIntensity:     { value: baseIntensity },
      uSpecPower:     { value: specPower },
      uSpecStrength:  { value: specStrength },
      uFresnelPow:    { value: fresnelPow },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uIntensity;
      uniform float uSpecPower;
      uniform float uSpecStrength;
      uniform float uFresnelPow;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(vViewDir);
        // fixed view-space light direction, upper-right — matches the corner flare's position
        vec3 L = normalize(vec3(0.55, 0.65, 0.9));

        float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), uFresnelPow);

        vec3 H = normalize(L + V);
        float spec = pow(max(dot(N, H), 0.0), uSpecPower);

        float shimmer = 0.95 + 0.05 * sin(uTime * 0.6);

        float alpha = (0.12 + fresnel * 0.55) * uIntensity * shimmer;
        alpha = clamp(alpha + spec * uSpecStrength, 0.0, 1.0);

        vec3 color = uColor * (0.7 + fresnel * 0.8) + vec3(1.0) * spec * uSpecStrength * 1.125;

        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

// Bespoke satellite material — same glass family (fresnel rim + fixed-direction specular) as
// createGlassMaterial, but the fill is no longer a flat uColor: a small-scale, slow internal
// noise field mixes between a dark and bright variant of the node's own color, so each satellite
// reads as a tiny living system with its own internal current rather than a uniformly-lit orb.
// Kept intentionally simple (one noise octave, no domain warping) — at this screen size the extra
// detail the Core's shader has would be invisible and wasted cost.
function createSatelliteMaterial(colorDark: string, colorBright: string, baseIntensity: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime:         { value: 0 },
      uColorDark:    { value: new THREE.Color(colorDark) },
      uColorBright:  { value: new THREE.Color(colorBright) },
      uIntensity:    { value: baseIntensity },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vObjectNormal;
      varying vec3 vViewDir;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vObjectNormal = normalize(normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColorDark;
      uniform vec3 uColorBright;
      uniform float uTime;
      uniform float uIntensity;
      varying vec3 vNormal;
      varying vec3 vObjectNormal;
      varying vec3 vViewDir;

      float hash(vec3 p) {
        p = fract(p * vec3(0.1031, 0.1030, 0.0973));
        p += dot(p, p.yxz + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
          f.z);
      }

      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(vViewDir);
        vec3 L = normalize(vec3(0.55, 0.65, 0.9));

        float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.0);
        vec3 H = normalize(L + V);
        float spec = pow(max(dot(N, H), 0.0), 40.0);

        // slow internal current — small scale, single octave, so it reads as a subtle glimmer
        // moving through the sphere rather than visible turbulence at this size
        float n = noise(vObjectNormal * 2.4 + vec3(uTime * 0.07, uTime * 0.055, uTime * 0.045));
        vec3 base = mix(uColorDark, uColorBright, smoothstep(0.25, 0.75, n));

        float shimmer = 0.95 + 0.05 * sin(uTime * 0.6);
        float alpha = (0.16 + fresnel * 0.5) * uIntensity * shimmer;
        alpha = clamp(alpha + spec * 0.8, 0.0, 1.0);

        vec3 color = base * (0.75 + fresnel * 0.6) + vec3(1.0) * spec * 0.9;

        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

const DUST_COUNT = 70;

const DUST_VERTEX_SHADER = `
  uniform float uTime;
  attribute float aSize;
  attribute float aPhase;
  varying float vAlpha;
  void main() {
    float twinkle = 0.55 + 0.45 * sin(uTime * 1.3 + aPhase);
    vAlpha = twinkle;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * twinkle * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;
const DUST_FRAGMENT_SHADER = `
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.0, d) * vAlpha;
    gl_FragColor = vec4(0.85, 0.95, 1.0, alpha * 0.8);
  }
`;

// fine sparkle right at the nucleus's core/haze boundary — sparse (70 points, not the old
// 600-particle shell that read as a sprawling gas cloud), GPU-only twinkle via uTime so there's
// no per-frame CPU buffer write, matching the fine dust visible right at the reference's rim
function NucleusDust() {
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: DUST_VERTEX_SHADER,
    fragmentShader: DUST_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }), []);

  const { positions, sizes, phases } = useMemo(() => {
    const positions = new Float32Array(DUST_COUNT * 3);
    const sizes     = new Float32Array(DUST_COUNT);
    const phases    = new Float32Array(DUST_COUNT);
    for (let i = 0; i < DUST_COUNT; i++) {
      const r     = NUCLEUS_RADIUS * (1.0 + Math.random() * 0.35);
      const theta = Math.acos(2 * Math.random() - 1);
      const phi   = Math.random() * Math.PI * 2;
      const sinTheta = Math.sin(theta);
      positions[i * 3 + 0] = r * sinTheta * Math.cos(phi);
      positions[i * 3 + 1] = r * Math.cos(theta);
      positions[i * 3 + 2] = r * sinTheta * Math.sin(phi);
      sizes[i]  = 0.02 + Math.random() * 0.03;
      phases[i] = Math.random() * Math.PI * 2;
    }
    return { positions, sizes, phases };
  }, []);

  useFrame((state) => { material.uniforms.uTime.value = state.clock.elapsedTime; });

  return (
    <points material={material} renderOrder={2}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={DUST_COUNT} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-aSize" count={DUST_COUNT} array={sizes} itemSize={1} />
        <bufferAttribute attach="attributes-aPhase" count={DUST_COUNT} array={phases} itemSize={1} />
      </bufferGeometry>
    </points>
  );
}

const MICRO_COUNT = 220;

// Extremely fine, dense speckle right at the plasma surface — distinct from NucleusDust's
// sparser, slightly-further-out sparkle. This is the "microscopic computational detail" layer:
// individually near-invisible, only reading as a fine grain texture in aggregate, and only up
// close (the macro/circuitry counterpart to the filament grid baked into the shell shader).
function SurfaceParticles() {
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: DUST_VERTEX_SHADER,
    fragmentShader: DUST_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }), []);

  const { positions, sizes, phases } = useMemo(() => {
    const positions = new Float32Array(MICRO_COUNT * 3);
    const sizes     = new Float32Array(MICRO_COUNT);
    const phases    = new Float32Array(MICRO_COUNT);
    for (let i = 0; i < MICRO_COUNT; i++) {
      const r     = NUCLEUS_RADIUS * (1.0 + Math.random() * 0.06);
      const theta = Math.acos(2 * Math.random() - 1);
      const phi   = Math.random() * Math.PI * 2;
      const sinTheta = Math.sin(theta);
      positions[i * 3 + 0] = r * sinTheta * Math.cos(phi);
      positions[i * 3 + 1] = r * Math.cos(theta);
      positions[i * 3 + 2] = r * sinTheta * Math.sin(phi);
      sizes[i]  = 0.006 + Math.random() * 0.01;
      phases[i] = Math.random() * Math.PI * 2;
    }
    return { positions, sizes, phases };
  }, []);

  // faster twinkle than NucleusDust — reads as fine, busy computation rather than slow ambient
  // sparkle, without needing a second shader just to change the rate
  useFrame((state) => { material.uniforms.uTime.value = state.clock.elapsedTime * 2.2; });

  return (
    <points material={material} renderOrder={1}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={MICRO_COUNT} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-aSize" count={MICRO_COUNT} array={sizes} itemSize={1} />
        <bufferAttribute attach="attributes-aPhase" count={MICRO_COUNT} array={phases} itemSize={1} />
      </bufferGeometry>
    </points>
  );
}

// A bespoke shell material, not the shared createGlassMaterial (that stays uniform for the
// threads/nodes) — the containment field needed to specifically NOT read as a clean, uniform
// glass marble: a noise-driven patch field makes some regions thin/nearly-invisible and others
// thicker/more present, and the same noise perturbs the fresnel rim so the bright edge isn't a
// perfect circle. Radius bumped further out from the plasma (1.2x → 1.34x) for more visible
// separation between "the energy" and "the field containing it."
function createContainmentShellMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime:  { value: 0 },
      uColor: { value: new THREE.Color("#dbeafe") },
      uStatusColor: { value: new THREE.Color("#000000") },
      uStatusMix:   { value: 0 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vObjectNormal;
      varying vec3 vViewDir;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vObjectNormal = normalize(normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      uniform vec3 uStatusColor;
      uniform float uStatusMix;
      varying vec3 vNormal;
      varying vec3 vObjectNormal;
      varying vec3 vViewDir;

      float hash(vec3 p) {
        p = fract(p * vec3(0.1031, 0.1030, 0.0973));
        p += dot(p, p.yxz + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
          f.z);
      }

      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(vViewDir);

        // higher frequency than the first attempt (2.2 → 4.0) so variation actually shows up
        // within the narrow visible annulus, and a much lower floor (0.35 → 0.08) so low-patch
        // regions genuinely fade toward invisible instead of just dimming — that's what breaks
        // "uniform ring" into "thinner here, thicker there"
        float patchField = noise(vObjectNormal * 4.0 + vec3(uTime * 0.015, -uTime * 0.01, uTime * 0.008));
        patchField = smoothstep(0.2, 0.8, patchField);

        // stronger distortion amplitude (0.18 → 0.35) and higher-frequency noise so the bright
        // rim visibly wobbles rather than tracing a near-perfect circle
        float edgeNoise = noise(vObjectNormal * 5.0 - vec3(uTime * 0.02));
        float fresnelBase = clamp(dot(N, V) + (edgeNoise - 0.5) * 0.35, 0.0, 1.0);
        float fresnel = pow(1.0 - fresnelBase, 1.8 + edgeNoise * 1.2);

        vec3 L = normalize(vec3(0.55, 0.65, 0.9));
        vec3 H = normalize(L + V);
        float spec = pow(max(dot(N, H), 0.0), 55.0) * patchField;

        float alpha = clamp((0.03 + fresnel * 0.42) * (0.08 + patchField * 0.92) + spec * 0.3, 0.0, 1.0);
        vec3 color = uColor * (0.55 + fresnel * 0.75) + vec3(1.0) * spec * 0.4;
        // this layer is the most visually dominant part of the Core (the big outer ring), so the
        // shared-status tint is most visible here — a stronger multiplier (1.8x) than the plasma
        // layers, whose brightness is already closer to blown-out and dilutes any tint applied
        color = mix(color, uStatusColor, clamp(uStatusMix * 1.8, 0.0, 0.5));

        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function ContainmentShell() {
  const material = useMemo(() => createContainmentShellMaterial(), []);
  const { status } = useZamoAssistant();
  const statusColorRef = useRef(new THREE.Color("#000000"));
  const statusMixRef = useRef(0);
  useFrame((state, delta) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
    const target = STATUS_TINTS[status];
    statusColorRef.current.lerp(new THREE.Color(target.color), Math.min(delta * 2.5, 1));
    statusMixRef.current += (target.mix - statusMixRef.current) * Math.min(delta * 2.5, 1);
    material.uniforms.uStatusColor.value.copy(statusColorRef.current);
    material.uniforms.uStatusMix.value = statusMixRef.current;
  });
  return (
    <mesh material={material} renderOrder={2}>
      {/* pulled back in from 1.34x after the core-scale reduction made it crowd the node labels
          — 1.24x still keeps more absolute separation from the plasma than the original 1.2x */}
      <sphereGeometry args={[NUCLEUS_RADIUS * 1.24, 44, 44]} />
    </mesh>
  );
}

function Core() {
  const innerRef   = useRef<THREE.Mesh>(null);
  const nucleusRot = useRef({ x: 0, y: 0, z: 0 });

  const material = useMemo(() => createNucleusMaterial(), []);
  const { status } = useZamoAssistant();
  const statusColorRef = useRef(new THREE.Color("#000000"));
  const statusMixRef = useRef(0);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;

    material.uniforms.uTime.value = t;

    const target = STATUS_TINTS[status];
    statusColorRef.current.lerp(new THREE.Color(target.color), Math.min(delta * 2.5, 1));
    statusMixRef.current += (target.mix - statusMixRef.current) * Math.min(delta * 2.5, 1);
    material.uniforms.uStatusColor.value.copy(statusColorRef.current);
    material.uniforms.uStatusMix.value = statusMixRef.current;

    if (innerRef.current) {
      // the nucleus is the one place motion stays genuinely alive — everything else in the
      // scene is near-frozen so this internal flow is what reads as "living"
      const speedY = 0.15 + Math.sin(t * 0.023) * 0.06;
      const speedX = 0.06 + Math.sin(t * 0.017 + 1.4) * 0.03;
      const speedZ = 0.02 + Math.sin(t * 0.011 + 3.2) * 0.015;
      nucleusRot.current.y += speedY * delta;
      nucleusRot.current.x += speedX * delta;
      nucleusRot.current.z += speedZ * delta;
      innerRef.current.rotation.y = nucleusRot.current.y;
      innerRef.current.rotation.x = nucleusRot.current.x;
      innerRef.current.rotation.z = nucleusRot.current.z;

      const pulse = Math.sin(t * 2.1) * 0.05 + Math.sin(t * 5.3) * 0.015 + Math.sin(t * 0.87 + 2.0) * 0.02;
      innerRef.current.scale.setScalar(1 + pulse);
    }
  });

  return (
    <group>
      {/* renderOrder is explicit and deliberate here, not left to automatic distance sorting:
          inner core must draw first (pure additive contribution, nothing depends on its depth),
          the outer shell next (writes real depth for the threads to test against), containment/
          dust after that. See createNucleusMaterial's depthWrite comment for why this matters. */}
      <InnerCore />
      <MidPlasmaLayer />
      {/* small, dense power core — the source, not the centerpiece. Its intensity comes from
          brightness/contrast against the black background, not from filling the frame. */}
      <mesh ref={innerRef} material={material} renderOrder={1}>
        <sphereGeometry args={[NUCLEUS_RADIUS, 48, 48]} />
      </mesh>
      <NucleusDust />
      <SurfaceParticles />
      <ContainmentShell />
    </group>
  );
}

interface NodeMeshProps {
  config:      ZamoNodeConfig;
  index:       number;
  count:       number;
  onNavigate:  (href: string) => void;
  registerRef: (el: THREE.Group | null) => void;
}

function NodeMesh({ config, index, count, onNavigate, registerRef }: NodeMeshProps) {
  const nodeRef  = useRef<THREE.Mesh>(null);
  const bobRef   = useRef<THREE.Group>(null);
  const orbitRef = useRef<THREE.Group | null>(null);
  const [hovered, setHovered]       = useState(false);
  const [navigating, setNavigating] = useState(false);

  // internal energy signature per satellite — a dark and a bright variant of the same identity
  // color, mixed by the slow noise current inside createSatelliteMaterial. Dark stays close to
  // true color (20% toward black) so the current reads as real color, not washed out; bright
  // leans further toward white (55%) for a believable "hot spot" without needing a second hue.
  const material = useMemo(() => {
    const base = new THREE.Color(config.color);
    const dark   = "#" + base.clone().lerp(new THREE.Color("#000000"), 0.2).getHexString();
    const bright = "#" + base.clone().lerp(new THREE.Color("#ffffff"), 0.55).getHexString();
    return createSatelliteMaterial(dark, bright, 0.46);
  }, [config.color]);

  // evenly spaced around the shared ring — start at the top, go clockwise
  const angle = -Math.PI / 2 + index * ((Math.PI * 2) / count);
  // per-node variation comes from a seed derived from index, not a hand-tuned config field
  const seed = index * 1.7 + 0.4;

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    material.uniforms.uTime.value = t;

    // gently brighten/dim rather than snap — "no flashing" per the brief
    const targetGlow = hovered || navigating ? 0.95 : 0.46;
    material.uniforms.uIntensity.value += (targetGlow - material.uniforms.uIntensity.value) * Math.min(delta * 4, 1);

    // angular sway around the node's anchor point, dialed back from the previous round — per
    // feedback, internal life (the satellite material's own current, above) should read as the
    // primary motion now, with this external drift as a barely-there secondary cue rather than
    // competing with it
    if (orbitRef.current) {
      const sway = Math.sin(t * 0.045 + seed) * 0.025 + Math.sin(t * 0.017 + seed * 2.3) * 0.012;
      const a = angle + sway;
      orbitRef.current.position.x = Math.cos(a) * NODE_RING_RADIUS;
      orbitRef.current.position.y = Math.sin(a) * NODE_RING_RADIUS;
    }

    // near-frozen per the reference — almost all visible motion in the scene should live in
    // the nucleus and the threads, not here. What's left is barely perceptible.
    if (bobRef.current) {
      const bob = Math.sin(t * 0.9 + seed) * 0.7 + Math.sin(t * 0.31 + seed * 1.7) * 0.3;
      bobRef.current.position.z = bob * 0.015;
      // slow breathing scale, independent of the hover-scale group below (they compose) — a
      // long, gentle period so it never reads as animated-for-attention
      const breathe = 1 + Math.sin(t * 0.35 + seed * 1.9) * 0.05;
      bobRef.current.scale.setScalar(breathe);
    }
    if (nodeRef.current) {
      const spinRate = 0.02 + Math.sin(t * 0.05 + seed) * 0.006;
      nodeRef.current.rotation.y += spinRate * delta;
      nodeRef.current.rotation.x += spinRate * 0.5 * delta;
    }
  });

  function handlePointerOver(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation();
    setHovered(true);
    document.body.style.cursor = config.href ? "pointer" : "default";
  }
  function handlePointerOut(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation();
    setHovered(false);
    document.body.style.cursor = "default";
  }
  function handleClick(e: ThreeEvent<MouseEvent>) {
    e.stopPropagation();
    if (!config.href || navigating) return;
    setNavigating(true);
    document.body.style.cursor = "default";
    setTimeout(() => onNavigate(config.href!), 450);
  }

  const scale = navigating ? 1.22 : hovered ? 1.15 : 1;
  const initialPosition: [number, number, number] = [
    Math.cos(angle) * NODE_RING_RADIUS,
    Math.sin(angle) * NODE_RING_RADIUS,
    0,
  ];

  return (
    <group
      ref={(el) => { orbitRef.current = el; registerRef(el); }}
      position={initialPosition}
    >
      <group ref={bobRef}>
        <mesh
          onPointerOver={handlePointerOver}
          onPointerOut={handlePointerOut}
          onClick={handleClick}
          visible={false}
        >
          <sphereGeometry args={[0.35, 8, 8]} />
        </mesh>

        <group scale={scale}>
          {/* small glass orb — same glass-hybrid material family as the two large rings, not a
              separate halo ring — reference nodes carry a visible specular hotspot and a real,
              if faint, tint of their own color, not a near-colorless rim-only glow */}
          <mesh ref={nodeRef} material={material}>
            <sphereGeometry args={[0.13, 32, 32]} />
          </mesh>
        </group>

        {/* nudged slightly further from the node (was 0.24) to reduce label/arc collisions per
            feedback — still clearly attached to its node, just with a touch more breathing room */}
        <Html center distanceFactor={9} position={[0, 0.3, 0]}>
          <PlanetInfoCard icon={config.icon} label={config.label} value={config.value} highlighted={hovered || navigating} />
        </Html>
      </group>
    </group>
  );
}

interface ConnectionStreamProps {
  getNodeGroup: () => THREE.Group | null;
  color: string;
}

const THREADS_PER_NODE   = 3;
const CORE_SPREAD_RADIUS = 0.19;

// deterministic pseudo-random offset near the core — stable across renders (not Math.random()
// at render time), so each thread in the fan has a fixed, distinct origin point
function seededOffset(seed: number): THREE.Vector3 {
  const a = Math.sin(seed * 12.9898) * 43758.5453;
  const b = Math.sin(seed * 78.233) * 12543.634;
  const c = Math.sin(seed * 37.719) * 98765.123;
  const rx = (a - Math.floor(a)) * 2 - 1;
  const ry = (b - Math.floor(b)) * 2 - 1;
  const rz = (c - Math.floor(c)) * 2 - 1;
  return new THREE.Vector3(rx, ry, rz).normalize().multiplyScalar(CORE_SPREAD_RADIUS);
}

interface ThreadProps {
  getNodeGroup: () => THREE.Group | null;
  color: THREE.Color;
  pulseColor: THREE.Color;
  seed: number;
}

// one hair-thin strand in the fan — its own origin offset, its own flow speed/phase, so the
// whole fan never moves in lockstep ("different speeds, different densities, never repetitive")
function Thread({ getNodeGroup, color, pulseColor, seed }: ThreadProps) {
  const origin = useMemo(() => seededOffset(seed), [seed]);
  const lineGeometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    return g;
  }, []);
  // roughly halved — connector lines should read as much fainter than the label text they lead
  // to, not compete with it
  const lineMaterial = useMemo(
    () => new THREE.LineBasicMaterial({
      color, transparent: true, opacity: 0.035 + (seed % 1) * 0.025,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
    [color, seed]
  );

  const particleRef = useRef<THREE.Mesh>(null);
  const speed = useMemo(() => 0.12 + Math.abs(Math.sin(seed * 3.1)) * 0.18, [seed]);
  const tRef = useRef((seed * 0.37) % 1);

  useFrame((state, delta) => {
    const group = getNodeGroup();
    if (!group) return;
    const target = new THREE.Vector3();
    group.getWorldPosition(target);

    const posAttr = lineGeometry.attributes.position as THREE.BufferAttribute;
    posAttr.setXYZ(0, target.x, target.y, target.z);
    posAttr.setXYZ(1, origin.x, origin.y, origin.z);
    posAttr.needsUpdate = true;

    const rate = speed * (1 + Math.sin(state.clock.elapsedTime * 0.05 + seed) * 0.35);
    tRef.current = (tRef.current + delta * rate) % 1;

    if (particleRef.current) {
      particleRef.current.position.lerpVectors(target, origin, tRef.current);
      const mat = particleRef.current.material as THREE.MeshBasicMaterial;
      // slightly higher peak than before (0.45 → 0.55) so the pulse itself is clearly visible
      // even though the line it travels along stays hair-thin — "an occasional tiny pulse," not
      // a bright beam
      mat.opacity = Math.sin(tRef.current * Math.PI) * 0.55;
    }
  });

  return (
    <>
      <primitive object={new THREE.Line(lineGeometry, lineMaterial)} />
      <mesh ref={particleRef}>
        <sphereGeometry args={[0.02, 6, 6]} />
        {/* the pulse itself carries more of the node's real color than the line does — this is
            what gives each satellite its "restrained identity" (amber/emerald/violet/cyan)
            without tinting the faint connector line itself */}
        <meshBasicMaterial color={pulseColor} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </>
  );
}

function ConnectionStream({ getNodeGroup, color }: ConnectionStreamProps) {
  // hair-thin, pale threads — mostly white with only a faint tint of the node's own color,
  // matching the fine fiber-like connections from reference rather than a bold colored beam
  const threadColor = useMemo(() => new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.75), [color]);
  // the traveling pulse keeps much more of the real color — restrained identity per satellite
  const pulseColor = useMemo(() => new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.3), [color]);
  return (
    <>
      {Array.from({ length: THREADS_PER_NODE }).map((_, i) => (
        <Thread key={i} getNodeGroup={getNodeGroup} color={threadColor} pulseColor={pulseColor} seed={i * 7.3 + 1.1} />
      ))}
    </>
  );
}

// Open, gently-warped arcs instead of closed tori — modeled on the black-hole reference's bent
// photon-ring threads rather than a clean armillary-sphere loop. Each arc only spans a fraction
// of a full circle and fades to a hair-thin trail at both ends (see the material's vUv.x length
// fade), so it reads as a fragment of a much larger lensed structure wrapping the core, not a
// closed geometric ring. A slow radius wobble (bendAmount/bendFreq) breaks the perfect-circle
// primitive read the same way the rings' faceted cross-section used to.
function buildOrbitalThreadCurve(radius: number, archFraction: number, bendAmount: number, bendFreq: number, phase: number) {
  const segments = 96;
  const totalAngle = Math.PI * 2 * archFraction;
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = t * totalAngle;
    // two-harmonic wobble (a second, off-frequency sine layered on the first) instead of one
    // clean sine — a single harmonic still reads as "a perfect circle with a wave applied,"
    // which is still a primitive; two incommensurate frequencies break that regularity the same
    // way real gravitational lensing looks irregular rather than a smooth mathematical bend
    const wobble = 1 + bendAmount * (
      Math.sin(angle * bendFreq + phase) +
      0.45 * Math.sin(angle * bendFreq * 2.3 + phase * 1.7)
    );
    const r = radius * wobble;
    points.push(new THREE.Vector3(
      Math.cos(angle) * r,
      Math.sin(angle) * r,
      Math.sin(angle * 0.5 + phase) * radius * 0.05,
    ));
  }
  return new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.15);
}

// Replicates THREE.TubeGeometry's own algorithm (Frenet frames along the curve) but accepts a
// per-length radius function instead of a constant radius — needed so each thread can taper from
// a bright, fuller mid-section down to a hairline at both trailing ends, like a beam of light
// converging/diverging under lensing rather than a uniform architectural rail.
function buildVariableRadiusTube(
  curve: THREE.Curve<THREE.Vector3>,
  tubularSegments: number,
  radialSegments: number,
  radiusFn: (t: number) => number,
) {
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments;
    const pt = curve.getPointAt(t);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    const r = radiusFn(t);
    for (let j = 0; j <= radialSegments; j++) {
      const v = (j / radialSegments) * Math.PI * 2;
      const sin = Math.sin(v);
      const cos = -Math.cos(v);
      const nx = cos * N.x + sin * B.x;
      const ny = cos * N.y + sin * B.y;
      const nz = cos * N.z + sin * B.z;
      positions.push(pt.x + r * nx, pt.y + r * ny, pt.z + r * nz);
      normals.push(nx, ny, nz);
      uvs.push(t, j / radialSegments);
    }
  }

  for (let j = 1; j <= tubularSegments; j++) {
    for (let i = 1; i <= radialSegments; i++) {
      const a = (radialSegments + 1) * (j - 1) + (i - 1);
      const b = (radialSegments + 1) * j + (i - 1);
      const c = (radialSegments + 1) * j + i;
      const d = (radialSegments + 1) * (j - 1) + i;
      indices.push(a, b, d, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}

function createOrbitalThreadMaterial(color: string) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime:  { value: 0 },
      uColor: { value: new THREE.Color(color) },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec2 vUv;
      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(vViewDir);
        float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 1.5);

        // fade both ends of the open arc to a hair-thin trail — the thing that actually sells
        // "fragment of a lensed structure" instead of "ring primitive with the seam hidden"
        float lengthFade = smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.84, vUv.x);

        // 3 bright data-pulses travel the thread's length at different speeds/phases — reads as
        // information moving through a holographic conduit, ties into "transmitting information"
        float pulse = 0.0;
        for (int i = 0; i < 3; i++) {
          float speed = 0.045 + float(i) * 0.02;
          float phase = float(i) * 0.41;
          float pos = fract(uTime * speed + phase);
          pulse += smoothstep(0.06, 0.0, abs(vUv.x - pos));
        }

        float base = (0.08 + fresnel * 0.24) * lengthFade;
        float alpha = clamp(base + pulse * 0.4 * lengthFade, 0.0, 1.0);

        vec3 color = uColor * (0.6 + fresnel * 0.35) + vec3(1.0) * pulse * 0.5;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

interface OrbitalThreadProps {
  radius: number;
  rotation: [number, number, number];
  color: string;
  archFraction: number;
  bendAmount: number;
  bendFreq: number;
  phase: number;
  tubeRadius: number;
}

function OrbitalThread({ radius, rotation, color, archFraction, bendAmount, bendFreq, phase, tubeRadius }: OrbitalThreadProps) {
  const material = useMemo(() => createOrbitalThreadMaterial(color), [color]);
  useFrame((state) => { material.uniforms.uTime.value = state.clock.elapsedTime; });

  const geometry = useMemo(() => {
    const curve = buildOrbitalThreadCurve(radius, archFraction, bendAmount, bendFreq, phase);
    // taper thin → thick → thin along the length (a converging/diverging beam, not a uniform
    // architectural rail) — same silhouette the length-fade alpha already implies, now backed by
    // real geometry instead of alpha alone
    const radiusFn = (t: number) => tubeRadius * (0.12 + 0.88 * Math.pow(Math.sin(Math.PI * t), 0.7));
    return buildVariableRadiusTube(curve, 128, 8, radiusFn);
  }, [radius, archFraction, bendAmount, bendFreq, phase, tubeRadius]);

  // renderOrder 3: drawn after the outer nucleus shell (renderOrder 1), which writes real depth —
  // this is what makes threads correctly disappear behind the core and reappear on the far side
  // instead of always rendering on top regardless of position.
  return <mesh rotation={rotation} material={material} geometry={geometry} renderOrder={3} />;
}

const FLARE_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const FLARE_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float dist = length(vUv - 0.5) * 2.0;
    float alpha = pow(smoothstep(1.0, 0.0, dist), 2.2);
    gl_FragColor = vec4(uColor, alpha * 0.3);
  }
`;

// soft corner light flare — the reference's only hint of an external light source, a gentle
// glow rather than a hard directional highlight. Purely decorative, no scene lighting involved.
function CornerFlare() {
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color("#c7d2fe") } },
    vertexShader: FLARE_VERTEX_SHADER,
    fragmentShader: FLARE_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }), []);
  return (
    <Billboard position={[2.9, 2.2, -2.3]}>
      <mesh material={material}>
        <planeGeometry args={[3.6, 3.6]} />
      </mesh>
    </Billboard>
  );
}

const SPACE_DUST_COUNT = 90;

const SPACE_DUST_VERTEX_SHADER = `
  uniform float uTime;
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aDrift;
  varying float vAlpha;
  void main() {
    // slow bounded back-and-forth drift (not one-directional travel + wrap) — reads as debris
    // loosely floating in place rather than particles streaming past on rails
    vec3 pos = position + aDrift * sin(uTime * 0.05 + aPhase);
    float twinkle = 0.4 + 0.4 * sin(uTime * 0.6 + aPhase * 1.7);
    vAlpha = twinkle;
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = aSize * (280.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;
const SPACE_DUST_FRAGMENT_SHADER = `
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.0, d) * vAlpha;
    gl_FragColor = vec4(0.75, 0.85, 1.0, alpha * 0.35);
  }
`;

// Scene-scale drifting debris — distinct from NucleusDust/SurfaceParticles (which hug the core):
// scattered through the whole scene volume, well outside the orbital-thread radius, so the scene
// reads as existing inside a vast computational universe rather than a bounded diorama. Kept
// sparse and dim per the brief ("understated, never distract from the interface").
function SpaceDust() {
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: SPACE_DUST_VERTEX_SHADER,
    fragmentShader: SPACE_DUST_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }), []);

  const { positions, sizes, phases, drifts } = useMemo(() => {
    const positions = new Float32Array(SPACE_DUST_COUNT * 3);
    const sizes     = new Float32Array(SPACE_DUST_COUNT);
    const phases    = new Float32Array(SPACE_DUST_COUNT);
    const drifts    = new Float32Array(SPACE_DUST_COUNT * 3);
    for (let i = 0; i < SPACE_DUST_COUNT; i++) {
      const radius = 2.6 + Math.random() * 5.5;
      const theta = Math.acos(2 * Math.random() - 1);
      // ~60% of particles cluster toward one side (left/back) rather than a uniform phi spread
      // across the whole sphere — "uneven atmospheric density," not perfect radial symmetry
      const phi = Math.random() < 0.6
        ? Math.PI * 0.85 + (Math.random() - 0.5) * Math.PI * 1.1
        : Math.random() * Math.PI * 2;
      const sinTheta = Math.sin(theta);
      positions[i * 3 + 0] = radius * sinTheta * Math.cos(phi);
      // flattened vertically and biased behind the core cluster — reads as a loose field around
      // the scene rather than a perfect sphere shell centered on it
      positions[i * 3 + 1] = radius * Math.cos(theta) * 0.6;
      positions[i * 3 + 2] = radius * sinTheta * Math.sin(phi) - 2.0;
      sizes[i]  = 0.02 + Math.random() * 0.035;
      phases[i] = Math.random() * Math.PI * 2;
      drifts[i * 3 + 0] = (Math.random() - 0.5) * 0.6;
      drifts[i * 3 + 1] = (Math.random() - 0.5) * 0.6;
      drifts[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
    }
    return { positions, sizes, phases, drifts };
  }, []);

  useFrame((state) => { material.uniforms.uTime.value = state.clock.elapsedTime; });

  return (
    <points material={material}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={SPACE_DUST_COUNT} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-aSize" count={SPACE_DUST_COUNT} array={sizes} itemSize={1} />
        <bufferAttribute attach="attributes-aPhase" count={SPACE_DUST_COUNT} array={phases} itemSize={1} />
        <bufferAttribute attach="attributes-aDrift" count={SPACE_DUST_COUNT} array={drifts} itemSize={3} />
      </bufferGeometry>
    </points>
  );
}

const NEBULA_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const NEBULA_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }

  void main() {
    vec2 uv = vUv - 0.5;
    float dist = length(uv) * 2.0;
    float radial = pow(smoothstep(1.0, 0.0, dist), 2.0);

    // very slow drift so the wisps shift almost imperceptibly over minutes, not animate visibly
    vec2 drift = vec2(uTime * 0.004, uTime * -0.003);
    float n1 = noise(uv * 3.0 + drift);
    float n2 = noise(uv * 6.0 - drift * 1.5);
    float wisp = n1 * 0.6 + n2 * 0.4;

    float alpha = radial * smoothstep(0.25, 0.85, wisp) * 0.2 * uIntensity;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

// Soft, wispy, slowly-drifting background glow — the nebula reference's filament haze read as an
// unrecognizable procedural texture rather than a literal shape, kept dim enough to never compete
// with the core or UI. Two instances at different depths/positions give a faint layered-depth cue
// even with a static camera; deliberately unequal intensity between them (see uIntensity) so the
// atmosphere itself is asymmetric rather than a mirrored pair.
function NebulaHaze({ position, color, scale, intensity = 1 }: { position: [number, number, number]; color: string; scale: number; intensity?: number }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uIntensity: { value: intensity } },
    vertexShader: NEBULA_VERTEX_SHADER,
    fragmentShader: NEBULA_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }), [color, intensity]);
  useFrame((state) => { material.uniforms.uTime.value = state.clock.elapsedTime; });
  return (
    <Billboard position={position}>
      <mesh material={material}>
        <planeGeometry args={[scale, scale]} />
      </mesh>
    </Billboard>
  );
}

// Rewritten per feedback that the original read as an even sunburst/logo rather than light
// scattering off irregular structure. Three changes: (1) angle is curved as a function of radius
// (sin-offset) instead of perfectly radial, (2) the circle is split into sectors and roughly half
// are randomly dropped, each survivor getting its own random width/length/opacity, instead of a
// clean repeating fan, (3) a soft non-directional haze fills the gaps where rays were dropped —
// "replace some rays with volumetric haze" without needing a separate mesh.
const LIGHT_RAYS_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform vec3 uColor;
  varying vec2 vUv;

  float hash1(float n) { return fract(sin(n) * 43758.5453123); }

  void main() {
    vec2 uv = vUv - 0.5;
    float dist = length(uv) * 2.0;

    float baseAngle = atan(uv.y, uv.x);
    // rays bend rather than radiate perfectly straight — a slow drift too, so the curve itself
    // isn't frozen
    float angle = baseAngle + sin(dist * 2.3 + baseAngle * 1.5 + uTime * 0.015) * 0.12;

    float sectors = 10.0;
    float sectorF = (angle / 6.28318530718 + 0.5) * sectors;
    float sectorId = floor(sectorF);
    float sectorLocal = fract(sectorF);

    float exists = step(0.52, hash1(sectorId * 12.9898));
    float width   = 0.16 + hash1(sectorId * 3.71 + 4.0) * 0.22;
    float reach   = 0.45 + hash1(sectorId * 7.13 + 8.0) * 0.55;
    float op      = 0.3 + hash1(sectorId * 5.19 + 2.0) * 0.7;

    float ray = smoothstep(width, 0.0, abs(sectorLocal - 0.5)) * exists * op;
    float lengthFalloff = smoothstep(reach, reach * 0.25, dist);
    float radialFalloff = smoothstep(0.0, 0.22, dist);
    float rays = ray * lengthFalloff * radialFalloff;

    // fills gaps left by dropped rays — soft, non-directional, no sector structure
    float haze = smoothstep(1.0, 0.0, dist) * smoothstep(0.0, 0.3, dist) * 0.35;

    // ~40% dimmer overall than the original pass (was *0.1, now *0.06)
    float alpha = (rays * 0.6 + haze * 0.4) * 0.06;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

// Faint volumetric-light-ray suggestion, centered on the Core — light emitted primarily from the
// nucleus per the brief, rather than a generic ambient scene light. Deliberately subtle so it
// reads as atmosphere, not a lens-flare/logo effect competing with the plasma.
function CoreLightRays() {
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color("#bfdbfe") } },
    vertexShader: FLARE_VERTEX_SHADER,
    fragmentShader: LIGHT_RAYS_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }), []);
  useFrame((state) => { material.uniforms.uTime.value = state.clock.elapsedTime; });
  return (
    <Billboard position={[0, 0, 0]}>
      <mesh material={material} renderOrder={2}>
        <planeGeometry args={[7, 7]} />
      </mesh>
    </Billboard>
  );
}

const NEAR_CORE_HAZE_COUNT = 45;

// Sparse filament dust filling the gap between the containment shell and the scene-scale
// SpaceDust field — literally "replace some rays with volumetric haze and filament dust" rather
// than relying on the ray shader alone to fill that space.
function NearCoreHaze() {
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: DUST_VERTEX_SHADER,
    fragmentShader: DUST_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }), []);

  const { positions, sizes, phases } = useMemo(() => {
    const positions = new Float32Array(NEAR_CORE_HAZE_COUNT * 3);
    const sizes     = new Float32Array(NEAR_CORE_HAZE_COUNT);
    const phases    = new Float32Array(NEAR_CORE_HAZE_COUNT);
    for (let i = 0; i < NEAR_CORE_HAZE_COUNT; i++) {
      const r = NUCLEUS_RADIUS * (1.6 + Math.random() * 1.6);
      const theta = Math.acos(2 * Math.random() - 1);
      const phi = Math.random() * Math.PI * 2;
      const sinTheta = Math.sin(theta);
      positions[i * 3 + 0] = r * sinTheta * Math.cos(phi);
      positions[i * 3 + 1] = r * Math.cos(theta) * 0.7;
      positions[i * 3 + 2] = r * sinTheta * Math.sin(phi);
      sizes[i]  = 0.012 + Math.random() * 0.02;
      phases[i] = Math.random() * Math.PI * 2;
    }
    return { positions, sizes, phases };
  }, []);

  useFrame((state) => { material.uniforms.uTime.value = state.clock.elapsedTime * 0.6; });

  return (
    <points material={material}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={NEAR_CORE_HAZE_COUNT} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-aSize" count={NEAR_CORE_HAZE_COUNT} array={sizes} itemSize={1} />
        <bufferAttribute attach="attributes-aPhase" count={NEAR_CORE_HAZE_COUNT} array={phases} itemSize={1} />
      </bufferGeometry>
    </points>
  );
}

function SceneContents({ nodes, onNavigate }: { nodes: ZamoNodeConfig[]; onNavigate: (href: string) => void }) {
  const nodeRefs = useRef<Record<string, THREE.Group | null>>({});

  return (
    <>
      {/* No scene lights — every material here is a custom shader with its own self-contained
          lighting math (fresnel/specular baked into the shader itself), so THREE's lit-material
          lights (ambient/point/directional) would render nothing. */}
      <Core />
      <CoreLightRays />
      <NearCoreHaze />

      {/* Four thin, partial, gently-warped orbital threads at varied radii/tilts — modeled on the
          black-hole reference's bent, lensed photon-ring fragments rather than closed rings, so
          the composition reads as "intricate holographic orbital structures" instead of a clean
          armillary-sphere gyroscope. */}
      <OrbitalThread radius={RING_RADIUS * 0.96} rotation={[0.55, 0.3, 0]} color="#3b82f6" archFraction={0.42} bendAmount={0.05} bendFreq={2} phase={0} tubeRadius={RING_TUBE * 0.45} />
      <OrbitalThread radius={RING_RADIUS * 1.05} rotation={[-0.45, 0.9, 0.15]} color="#22d3ee" archFraction={0.36} bendAmount={0.07} bendFreq={3} phase={1.3} tubeRadius={RING_TUBE * 0.38} />
      <OrbitalThread radius={RING_RADIUS * 0.82} rotation={[0.15, -0.5, 0.6]} color="#818cf8" archFraction={0.3} bendAmount={0.04} bendFreq={1.5} phase={2.6} tubeRadius={RING_TUBE * 0.3} />
      <OrbitalThread radius={RING_RADIUS * 1.15} rotation={[-0.2, 1.4, -0.3]} color="#38bdf8" archFraction={0.26} bendAmount={0.06} bendFreq={2.5} phase={4.1} tubeRadius={RING_TUBE * 0.26} />

      {/* shared ring tilt — one small, consistent rotation for the whole node ring, not
          per-node hand-tuning, so the four nodes read as one coherent symmetric structure */}
      <group rotation={NODE_RING_TILT}>
        {nodes.map((n, i) => (
          <NodeMesh
            key={n.id}
            config={n}
            index={i}
            count={nodes.length}
            onNavigate={onNavigate}
            registerRef={(el) => { nodeRefs.current[n.id] = el; }}
          />
        ))}
      </group>
      {nodes.map((n) => (
        <ConnectionStream key={n.id} getNodeGroup={() => nodeRefs.current[n.id]} color={n.color} />
      ))}

      <CornerFlare />

      {/* Environment layer: two distant nebula haze planes at different depths/tints (echoing the
          reference pair's scale/atmosphere without literally depicting either image), plus sparse
          scene-scale drifting dust — understated, sits behind and around the core, never in front
          of or competing with it. */}
      {/* deliberately unequal — left side reads visibly denser/brighter than the right, matching
          the dust field's own bias, so the environment feels naturally uneven rather than a
          mirrored pair placed for balance */}
      <NebulaHaze position={[-3.5, 1.8, -8]} color="#3b5bdb" scale={17} intensity={1.3} />
      <NebulaHaze position={[4.2, -2.2, -11]} color="#6d28d9" scale={18} intensity={0.6} />
      <SpaceDust />

      {/* sparse, calm starfield — restrained atmosphere, not a dense field competing with
          the nucleus for attention */}
      <Stars radius={100} depth={50} count={45} factor={2} saturation={0} fade speed={0.15} />
    </>
  );
}

export default function ZamoScene({ planets }: { planets: ZamoNodeConfig[] }) {
  const router = useRouter();

  return (
    <Canvas
      camera={{ position: [0, 0.15, 9.5], fov: 30 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
    >
      <SceneContents nodes={planets} onNavigate={(href) => router.push(href)} />
      <EffectComposer>
        {/* dialed back deliberately — contrast against the dark background should create the
            sense of intensity, not blanket bloom smearing everything bright. Threshold raised so
            only genuinely blown-out fragments (ignition points, thread pulses) bloom; midtones
            stay crisp instead of glowing uniformly. */}
        <Bloom intensity={0.4} luminanceThreshold={0.55} luminanceSmoothing={0.6} mipmapBlur />
      </EffectComposer>
    </Canvas>
  );
}
