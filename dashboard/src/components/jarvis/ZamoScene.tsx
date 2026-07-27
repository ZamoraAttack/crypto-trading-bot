"use client";

import { useRef, useMemo, useState, type ReactNode } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { Stars, Html, Line, Trail, Billboard } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { useRouter } from "next/navigation";
import * as THREE from "three";
import PlanetInfoCard from "./PlanetInfoCard";

export interface ZamoNodeConfig {
  id:             string;
  label:          string;
  value:          string;
  icon:           ReactNode;
  color:          string;
  hoverRadius:    number;
  tiltX:          number;
  tiltZ:          number;
  basePhase:      number;
  swayAmplitude:  number;
  swaySpeed:      number;
  nudge?:         [number, number, number];
  href?:          string;
}

const CORE_PARTICLE_COUNT = 600;
const STREAM_PARTICLES    = 4;

function createGlowMaterial(coreColor: string, edgeColor: string, intensityMin: number, intensityMax: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime:         { value: 0 },
      uCoreColor:    { value: new THREE.Color(coreColor) },
      uEdgeColor:    { value: new THREE.Color(edgeColor) },
      uIntensityMin: { value: intensityMin },
      uIntensityMax: { value: intensityMax },
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
      uniform vec3 uCoreColor;
      uniform vec3 uEdgeColor;
      uniform float uTime;
      uniform float uIntensityMin;
      uniform float uIntensityMax;
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
        // broad gradient sweep across the visible surface, not just a thin rim
        float fresnel = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0), 1.4);

        // irregular gas-cloud turbulence — slowly shifting so it feels alive, not static
        float n1 = noise(vObjectNormal * 3.0 + vec3(uTime * 0.05, uTime * 0.03, 0.0));
        float n2 = noise(vObjectNormal * 6.5 - vec3(0.0, uTime * 0.04, uTime * 0.02));
        float turbulence = n1 * 0.65 + n2 * 0.35;

        float fresnelT = clamp(fresnel + (turbulence - 0.5) * 0.5, 0.0, 1.0);
        vec3 color = mix(uCoreColor, uEdgeColor, fresnelT * 0.88);

        // rotating nucleus hotspot — fixed in object space, so it spins with the mesh
        vec3 hotspotDir = normalize(vec3(0.35, 0.45, 0.82));
        float nucleus = pow(max(dot(vObjectNormal, hotspotDir), 0.0), 1.6);
        color = mix(color, uCoreColor * 1.5, nucleus * 0.6);

        float pulse = 0.92 + 0.08 * sin(uTime * 1.4);
        float intensity = mix(uIntensityMin, uIntensityMax, fresnelT) * pulse + nucleus * 0.45;

        // soft cloudy falloff — dissolves toward the silhouette instead of a hard solid edge,
        // modulated by turbulence so the edge itself is wispy and irregular, not a clean circle
        float alpha = pow(1.0 - fresnel, 1.7) * (0.6 + turbulence * 0.7);
        alpha = clamp(alpha + nucleus * 0.35, 0.0, 1.0);

        gl_FragColor = vec4(color * intensity, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

const NEBULA_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const NEBULA_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uSeed;
  varying vec2 vUv;

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
    vec2 centered = vUv - 0.5;
    float dist = length(centered) * 2.0;
    float n = noise(vec3(vUv * 3.5, uTime * 0.05 + uSeed));
    float edge = 0.5 + n * 0.4;
    float alpha = smoothstep(edge, edge - 0.45, dist);
    alpha *= 0.45 + n * 0.55;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

function createNebulaMaterial(color: string, seed: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uTime:  { value: 0 },
      uSeed:  { value: seed },
    },
    vertexShader: NEBULA_VERTEX_SHADER,
    fragmentShader: NEBULA_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

interface NebulaPuffConfig {
  size:       number;
  offset:     [number, number, number];
  color:      string;
  seed:       number;
  spinSpeed:  number;
}

const NEBULA_PUFFS: NebulaPuffConfig[] = [
  { size: 3.72, offset: [0, 0, 0],                color: "#9d7bf0", seed: 0.0, spinSpeed: 0.02 },
  { size: 2.86, offset: [0.46, 0.23, 0.14],       color: "#7c5ce0", seed: 1.7, spinSpeed: -0.015 },
  { size: 3.15, offset: [-0.4, -0.18, -0.22],     color: "#1fb8d4", seed: 3.1, spinSpeed: 0.018 },
  { size: 2.43, offset: [0.25, -0.4, 0.32],       color: "#3fd0e0", seed: 4.6, spinSpeed: -0.022 },
  { size: 2.15, offset: [-0.29, 0.34, -0.11],     color: "#a78bfa", seed: 6.0, spinSpeed: 0.026 },
];

function NebulaPuff({ size, offset, color, seed, spinSpeed }: NebulaPuffConfig) {
  const groupRef = useRef<THREE.Group>(null);
  const spinAngle = useRef(0);
  const material = useMemo(() => createNebulaMaterial(color, seed), [color, seed]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    material.uniforms.uTime.value = t;
    if (groupRef.current) {
      // spin rate itself drifts, and never quite matches the other puffs' rhythm
      const rate = spinSpeed * (1 + Math.sin(t * 0.04 + seed * 1.3) * 0.5);
      spinAngle.current += rate * delta;
      groupRef.current.rotation.z = spinAngle.current;

      const breathe = Math.sin(t * 0.3 + seed) * 0.6 + Math.sin(t * 0.11 + seed * 2.3) * 0.4;
      groupRef.current.scale.setScalar(1 + breathe * 0.08);
    }
  });

  return (
    <Billboard position={offset}>
      <group ref={groupRef}>
        <mesh material={material}>
          <planeGeometry args={[size, size]} />
        </mesh>
      </group>
    </Billboard>
  );
}

const PARTICLE_VERTEX_SHADER = `
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;
const PARTICLE_FRAGMENT_SHADER = `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor, alpha);
  }
`;

function randomPointInCluster(): THREE.Vector3 {
  const r = 2.29 + Math.random() * 3.15;
  const theta = Math.acos(2 * Math.random() - 1);
  const phi = Math.random() * Math.PI * 2;
  const sinTheta = Math.sin(theta);
  return new THREE.Vector3(r * sinTheta * Math.cos(phi), r * Math.cos(theta), r * sinTheta * Math.sin(phi));
}

function ShootingStar({ seed }: { seed: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const state = useRef({
    active: false,
    start: new THREE.Vector3(),
    end: new THREE.Vector3(),
    t: 0,
    duration: 0.7,
    cooldown: 2 + seed * 2.5,
  });

  useFrame((_, delta) => {
    const s = state.current;
    const mesh = meshRef.current;
    if (!mesh) return;

    if (!s.active) {
      mesh.visible = false;
      s.cooldown -= delta;
      if (s.cooldown <= 0) {
        s.start = randomPointInCluster();
        s.end = s.start.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * 3.2,
          (Math.random() - 0.5) * 1.6,
          (Math.random() - 0.5) * 3.2
        ));
        s.t = 0;
        s.duration = 0.5 + Math.random() * 0.6;
        s.active = true;
      }
      return;
    }

    s.t += delta / s.duration;
    if (s.t >= 1) {
      s.active = false;
      s.cooldown = 5 + Math.random() * 10;
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    mesh.position.lerpVectors(s.start, s.end, s.t);
  });

  return (
    <Trail width={1.5} length={5} color="#f5f0ff" attenuation={(t) => t * t} decay={2}>
      <mesh ref={meshRef} visible={false}>
        <sphereGeometry args={[0.02, 6, 6]} />
        <meshBasicMaterial color="#f5f0ff" transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </Trail>
  );
}

function Core() {
  const innerRef   = useRef<THREE.Mesh>(null);
  const pointsRef  = useRef<THREE.Points>(null);
  const nucleusRot = useRef({ x: 0, y: 0, z: 0 });

  const material = useMemo(() => createGlowMaterial("#c4b0ff", "#4fd8e8", 1.1, 2.0), []);

  const particleMaterial = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: PARTICLE_VERTEX_SHADER,
    fragmentShader: PARTICLE_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }), []);

  // static "floating in space" field — dense near the core, thinning outward, no orbiting/infall motion
  const particles = useMemo(() => {
    const positions   = new Float32Array(CORE_PARTICLE_COUNT * 3);
    const colors      = new Float32Array(CORE_PARTICLE_COUNT * 3);
    const baseColors  = new Float32Array(CORE_PARTICLE_COUNT * 3);
    const sizes       = new Float32Array(CORE_PARTICLE_COUNT);
    const baseSizes   = new Float32Array(CORE_PARTICLE_COUNT);
    const pulsePhase  = new Float32Array(CORE_PARTICLE_COUNT);
    const pulseSpeed  = new Float32Array(CORE_PARTICLE_COUNT);
    const pulseAmount = new Float32Array(CORE_PARTICLE_COUNT);

    const hot  = new THREE.Color("#e9d5ff");
    const cool = new THREE.Color("#1fb8d4");
    const OUTER_R = 3.6465;
    const INNER_R = 2.0735;

    for (let i = 0; i < CORE_PARTICLE_COUNT; i++) {
      const r     = INNER_R + Math.pow(Math.random(), 2.2) * 1.573;
      const theta = Math.acos(2 * Math.random() - 1);
      const phi   = Math.random() * Math.PI * 2;
      const sinTheta = Math.sin(theta);
      positions[i * 3 + 0] = r * sinTheta * Math.cos(phi);
      positions[i * 3 + 1] = r * Math.cos(theta);
      positions[i * 3 + 2] = r * sinTheta * Math.sin(phi);

      const heat = THREE.MathUtils.clamp(1 - (r - INNER_R) / (OUTER_R - INNER_R), 0, 1);
      const c = cool.clone().lerp(hot, heat * heat).multiplyScalar(1.25);
      baseColors[i * 3 + 0] = c.r; baseColors[i * 3 + 1] = c.g; baseColors[i * 3 + 2] = c.b;
      colors[i * 3 + 0] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;

      baseSizes[i]   = 0.045 + Math.random() * 0.06;
      sizes[i]       = baseSizes[i];
      pulsePhase[i]  = Math.random() * Math.PI * 2;
      pulseSpeed[i]  = 0.3 + Math.random() * 1.4;
      pulseAmount[i] = Math.random() < 0.5 ? 0.2 + Math.random() * 0.35 : 0.08;
    }
    return { positions, colors, baseColors, sizes, baseSizes, pulsePhase, pulseSpeed, pulseAmount };
  }, []);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;

    material.uniforms.uTime.value = t;

    if (innerRef.current) {
      // speed itself drifts slowly (breathing tempo) instead of a constant clockwork spin
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

    if (pointsRef.current) {
      const colorAttr = pointsRef.current.geometry.attributes.aColor as THREE.BufferAttribute;
      const sizeAttr  = pointsRef.current.geometry.attributes.aSize as THREE.BufferAttribute;
      for (let i = 0; i < CORE_PARTICLE_COUNT; i++) {
        const wave = Math.sin(t * particles.pulseSpeed[i] + particles.pulsePhase[i]) * 0.75
                   + Math.sin(t * particles.pulseSpeed[i] * 0.41 + particles.pulsePhase[i] * 1.9) * 0.25;
        const pulse = 1 + wave * particles.pulseAmount[i];
        sizeAttr.setX(i, particles.baseSizes[i] * pulse);
        colorAttr.setXYZ(
          i,
          particles.baseColors[i * 3 + 0] * pulse,
          particles.baseColors[i * 3 + 1] * pulse,
          particles.baseColors[i * 3 + 2] * pulse
        );
      }
      sizeAttr.needsUpdate = true;
      colorAttr.needsUpdate = true;
    }
  });

  return (
    <group>
      <pointLight position={[0, 0, 0]} intensity={4} color="#a78bfa" distance={16} decay={2} />

      {/* Layer 1 — small bright nucleus, an anchor of "something real" inside the cloud, not the dominant shape */}
      <mesh ref={innerRef} material={material}>
        <sphereGeometry args={[0.605, 48, 48]} />
      </mesh>

      {/* Layer 2 — overlapping nebula billboards define the outer silhouette, irregular and cloud-like */}
      {NEBULA_PUFFS.map((puff, i) => <NebulaPuff key={i} {...puff} />)}

      {/* Layer 3 — floating star cluster, dense near the core — twinkling/pulsing, not orbiting or falling inward */}
      <points ref={pointsRef} material={particleMaterial}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={CORE_PARTICLE_COUNT} array={particles.positions} itemSize={3} />
          <bufferAttribute attach="attributes-aColor" count={CORE_PARTICLE_COUNT} array={particles.colors} itemSize={3} />
          <bufferAttribute attach="attributes-aSize" count={CORE_PARTICLE_COUNT} array={particles.sizes} itemSize={1} />
        </bufferGeometry>
      </points>

      {Array.from({ length: 5 }).map((_, i) => <ShootingStar key={i} seed={i} />)}
    </group>
  );
}

interface NodeMeshProps {
  config:      ZamoNodeConfig;
  onNavigate:  (href: string) => void;
  registerRef: (el: THREE.Group | null) => void;
}

function NodeMesh({ config, onNavigate, registerRef }: NodeMeshProps) {
  const swayRef   = useRef<THREE.Group>(null);
  const nodeRef   = useRef<THREE.Mesh>(null);
  const bobRef    = useRef<THREE.Group>(null);
  const [hovered, setHovered]       = useState(false);
  const [navigating, setNavigating] = useState(false);

  const material = useMemo(() => createGlowMaterial("#e6e2fb", config.color, 0.7, 1.25), [config.color]);

  const trailPoints = useMemo(() => {
    const curve = new THREE.EllipseCurve(0, 0, config.hoverRadius, config.hoverRadius, -0.55, 0.55, false, 0);
    return curve.getPoints(24).map(p => new THREE.Vector3(p.x, 0, p.y));
  }, [config.hoverRadius]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const seed = config.basePhase;
    material.uniforms.uTime.value = t;
    material.uniforms.uIntensityMax.value = hovered || navigating ? 1.7 : 1.25;

    if (swayRef.current) {
      // two incommensurate frequencies so the sway never settles into an obvious repeat
      const sway = Math.sin(t * config.swaySpeed + seed) * 0.7
                 + Math.sin(t * config.swaySpeed * 1.63 + seed * 2.1) * 0.3;
      swayRef.current.rotation.y = config.basePhase + sway * config.swayAmplitude * (hovered ? 0.3 : 1);
    }
    if (bobRef.current) {
      const bob = Math.sin(t * 0.9 + seed) * 0.7 + Math.sin(t * 0.31 + seed * 1.7) * 0.3;
      bobRef.current.position.y = bob * 0.12;
    }
    if (nodeRef.current) {
      // gently varying spin rate (was a fixed per-frame increment, also framerate-dependent — fixed to use delta)
      const spinRate = 0.16 + Math.sin(t * 0.05 + seed) * 0.05;
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

  return (
    <group position={config.nudge ?? [0, 0, 0]} rotation={[config.tiltX, 0, config.tiltZ]}>
      <group ref={swayRef}>
        <group ref={registerRef} position={[config.hoverRadius, 0, 0]}>
          <group ref={bobRef}>
            <mesh
              onPointerOver={handlePointerOver}
              onPointerOut={handlePointerOut}
              onClick={handleClick}
              visible={false}
            >
              <sphereGeometry args={[0.55, 8, 8]} />
            </mesh>

            <group scale={scale}>
              {/* HUD halo, not a planetary atmosphere */}
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.352, 0.0088, 8, 48]} />
                <meshBasicMaterial color={config.color} transparent opacity={0.7} blending={THREE.AdditiveBlending} depthWrite={false} />
              </mesh>
              {/* glowing intelligence node — white-hot center fading to its accent color at the rim */}
              <mesh ref={nodeRef} material={material}>
                <sphereGeometry args={[0.264, 32, 32]} />
              </mesh>
            </group>

            <Html center distanceFactor={9} position={[0, 0.682, 0]}>
              <PlanetInfoCard icon={config.icon} label={config.label} value={config.value} highlighted={hovered || navigating} />
            </Html>
          </group>
        </group>

        {/* faint partial trajectory hint — never a complete circle */}
        <Line points={trailPoints} color={config.color} transparent opacity={0.16} lineWidth={1} dashed dashSize={0.08} gapSize={0.08} />
      </group>
    </group>
  );
}

interface ConnectionStreamProps {
  getNodeGroup: () => THREE.Group | null;
  color: string;
}

function ConnectionStream({ getNodeGroup, color }: ConnectionStreamProps) {
  const lineGeometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    return g;
  }, []);
  const lineMaterial = useMemo(
    () => new THREE.LineBasicMaterial({
      color, transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
    [color]
  );

  const particleRefs = useRef<(THREE.Mesh | null)[]>([]);
  const tOffsets = useMemo(
    () => Array.from({ length: STREAM_PARTICLES }, (_, i) => i / STREAM_PARTICLES),
    []
  );
  const tRef = useRef(0);

  useFrame((state, delta) => {
    const group = getNodeGroup();
    if (!group) return;
    const target = new THREE.Vector3();
    group.getWorldPosition(target);

    const posAttr = lineGeometry.attributes.position as THREE.BufferAttribute;
    posAttr.setXYZ(0, target.x, target.y, target.z);
    posAttr.setXYZ(1, 0, 0, 0);
    posAttr.needsUpdate = true;

    // flow rate drifts gently — the pulses never travel at a perfectly metronomic pace
    const rate = 0.18 * (1 + Math.sin(state.clock.elapsedTime * 0.07) * 0.3);
    tRef.current += delta * rate;

    particleRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const t = (tRef.current + tOffsets[i]) % 1;
      mesh.position.lerpVectors(target, new THREE.Vector3(0, 0, 0), t);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.sin(t * Math.PI) * 0.95;
    });
  });

  return (
    <>
      <primitive object={new THREE.Line(lineGeometry, lineMaterial)} />
      {tOffsets.map((_, i) => (
        <mesh key={i} ref={(el) => { particleRefs.current[i] = el; }}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshBasicMaterial color={color} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}

function SceneContents({ nodes, onNavigate }: { nodes: ZamoNodeConfig[]; onNavigate: (href: string) => void }) {
  const nodeRefs = useRef<Record<string, THREE.Group | null>>({});

  return (
    <>
      <ambientLight intensity={0.3} />
      <Core />
      {nodes.map((n) => (
        <NodeMesh
          key={n.id}
          config={n}
          onNavigate={onNavigate}
          registerRef={(el) => { nodeRefs.current[n.id] = el; }}
        />
      ))}
      {nodes.map((n) => (
        <ConnectionStream key={n.id} getNodeGroup={() => nodeRefs.current[n.id]} color={n.color} />
      ))}
      {/* layered star field for depth parallax — far/dense + near/sparse */}
      <Stars radius={90} depth={60} count={4200} factor={2.4} saturation={0} fade speed={0.35} />
      <Stars radius={35} depth={25} count={900} factor={4.5} saturation={0} fade speed={0.15} />
    </>
  );
}

export default function ZamoScene({ planets }: { planets: ZamoNodeConfig[] }) {
  const router = useRouter();

  return (
    <Canvas
      camera={{ position: [0, 2.6, 10.2], fov: 42 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
    >
      <SceneContents nodes={planets} onNavigate={(href) => router.push(href)} />
      <EffectComposer>
        <Bloom intensity={0.75} luminanceThreshold={0.3} luminanceSmoothing={0.85} mipmapBlur />
      </EffectComposer>
    </Canvas>
  );
}
