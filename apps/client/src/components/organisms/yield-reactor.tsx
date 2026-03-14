import { useEffect, useRef, useState } from "react";
import { cn } from "@/utils";

interface YieldReactorProps {
  active?: boolean;
  intensity?: number; // 0-100, controls animation speed
  className?: string;
}

export function YieldReactor({
  active = true,
  intensity = 65,
  className,
}: YieldReactorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const uniformsRef = useRef<{
    uTime: WebGLUniformLocation | null;
    uResolution: WebGLUniformLocation | null;
    uColor: WebGLUniformLocation | null;
    uIntensity: WebGLUniformLocation | null;
  }>({ uTime: null, uResolution: null, uColor: null, uIntensity: null });
  const startTimeRef = useRef(0);
  const rafRef = useRef<number>(0);
  const lastFrameTimeRef = useRef(0);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) {
      console.warn("WebGL not supported");
      return;
    }

    glRef.current = gl as WebGLRenderingContext;

    // Vertex shader
    const vsSource = `
      attribute vec2 aPosition;
      void main() { 
        gl_Position = vec4(aPosition, 0.0, 1.0); 
      }
    `;

    // Fragment shader with fluid animation
    const fsSource = `
      precision mediump float;
      uniform float uTime;
      uniform vec2 uResolution;
      uniform vec3 uColor;
      uniform float uIntensity;

      float noise(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }

      float smoothNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = noise(i);
        float b = noise(i + vec2(1.0, 0.0));
        float c = noise(i + vec2(0.0, 1.0));
        float d = noise(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * smoothNoise(p);
          p *= 2.0;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / uResolution;
        
        // Scale time by intensity - at low intensity, time moves very slowly
        float t = uTime * uIntensity * 0.1;
        vec2 p = uv * vec2(8.0, 3.0);
        
        // Reduce wave speeds at low intensity
        float speedMult = max(0.1, uIntensity);
        
        float wave1 = sin(uv.x * 15.0 - t * 5.0 * speedMult + fbm(p + t) * 3.0) * 0.5 + 0.5;
        float wave2 = sin(uv.x * 10.0 - t * 4.0 * speedMult + uv.y * 3.0) * 0.5 + 0.5;
        float wave3 = fbm(p * 2.0 + vec2(-t * 3.0 * speedMult, 0.0));
        
        float energy = wave1 * 0.45 + wave2 * 0.35 + wave3 * 0.55;
        energy = pow(energy, 1.3);
        
        // Slower pulse at low intensity
        float pulse = sin(t * 3.5 * speedMult) * 0.18 + 0.9;
        energy *= pulse;
        
        energy *= 1.25;
        
        vec3 col = uColor * energy * 1.4;
        col += vec3(1.0) * pow(energy, 2.5) * 0.6;
        
        gl_FragColor = vec4(col, energy * 0.8);
      }
    `;

    function compileShader(type: number, source: string) {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Shader compile error:", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }

    const vs = compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = compileShader(gl.FRAGMENT_SHADER, fsSource);

    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Program link error:", gl.getProgramInfoLog(program));
      return;
    }

    gl.useProgram(program);
    programRef.current = program;

    // Setup vertices
    const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const aPosition = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    // Get uniform locations
    uniformsRef.current = {
      uTime: gl.getUniformLocation(program, "uTime"),
      uResolution: gl.getUniformLocation(program, "uResolution"),
      uColor: gl.getUniformLocation(program, "uColor"),
      uIntensity: gl.getUniformLocation(program, "uIntensity"),
    };

    // Enable blending
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    startTimeRef.current = performance.now();

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      if (gl && program) {
        gl.deleteProgram(program);
      }
    };
  }, []);

  // Intersection Observer to pause when not visible
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.1 }
    );

    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = glRef.current;
    if (!canvas || !gl || !active || !isVisible) {
      // Cancel animation if not active or not visible
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      return;
    }

    const resizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2); // Cap at 2x for performance
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    resizeCanvas();
    
    // Debounced resize handler
    let resizeTimeout: number;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(resizeCanvas, 100);
    };
    
    window.addEventListener("resize", handleResize);

    // Target 60fps but allow browser to throttle
    const targetFPS = 60;
    const frameInterval = 1000 / targetFPS;

    const render = (currentTime: number) => {
      if (!gl || !programRef.current || !isVisible) return;

      // Throttle to target FPS
      const elapsed = currentTime - lastFrameTimeRef.current;
      if (elapsed < frameInterval) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      lastFrameTimeRef.current = currentTime - (elapsed % frameInterval);

      const time = (performance.now() - startTimeRef.current) / 1000;
      const { uTime, uResolution, uColor, uIntensity } = uniformsRef.current;

      // Cyan color for the shader
      const r = 0 / 255;
      const g = 194 / 255;
      const b = 255 / 255;

      if (uTime) gl.uniform1f(uTime, time);
      if (uResolution) gl.uniform2f(uResolution, canvas.width, canvas.height);
      if (uColor) gl.uniform3f(uColor, r, g, b);
      if (uIntensity) gl.uniform1f(uIntensity, intensity / 100);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(resizeTimeout);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [active, intensity, isVisible]);

  return (
    <canvas
      ref={canvasRef}
      className={cn("w-full h-full", className)}
      style={{ display: "block" }}
    />
  );
}
